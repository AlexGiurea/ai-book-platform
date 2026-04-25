import { NextResponse } from "next/server";
import {
  buildKindleEmail,
  exportBook,
  type ExportBook,
  type ExportFormat,
} from "@/lib/book-export";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 300;

function isExportFormat(value: unknown): value is ExportFormat {
  return value === "pdf" || value === "epub";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function attachmentHeaders(filename: string, contentType: string) {
  return {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    "Cache-Control": "no-store",
  };
}

function normalizeBook(input: unknown): ExportBook | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as {
    title?: unknown;
    synopsis?: unknown;
    chapters?: unknown;
  };
  if (typeof value.title !== "string") return undefined;
  if (!Array.isArray(value.chapters)) return undefined;

  const chapters = value.chapters
    .map((chapter, index) => {
      if (!chapter || typeof chapter !== "object") return undefined;
      const item = chapter as {
        number?: unknown;
        title?: unknown;
        content?: unknown;
      };
      if (typeof item.content !== "string" || !item.content.trim()) return undefined;
      return {
        number: typeof item.number === "number" ? item.number : index + 1,
        title: typeof item.title === "string" && item.title.trim()
          ? item.title.trim()
          : `Chapter ${index + 1}`,
        content: item.content,
      };
    })
    .filter((chapter): chapter is ExportBook["chapters"][number] => Boolean(chapter));

  if (!chapters.length) return undefined;
  return {
    title: value.title.trim() || "Untitled Folio Book",
    author: "Folio",
    synopsis: typeof value.synopsis === "string" ? value.synopsis : "",
    chapters,
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = body as {
    book?: unknown;
    format?: unknown;
    mode?: unknown;
    kindleEmail?: unknown;
  };
  const book = normalizeBook(payload.book);
  if (!book) {
    return NextResponse.json(
      { error: "There is no readable book content to export yet." },
      { status: 400 }
    );
  }
  if (!isExportFormat(payload.format)) {
    return NextResponse.json(
      { error: "Choose either pdf or epub." },
      { status: 400 }
    );
  }

  const user = await getCurrentUser();
  if (user && user.plan !== "pro") {
    return NextResponse.json(
      { error: "PDF, EPUB, and Kindle export are available on Pro." },
      { status: 403 }
    );
  }

  const artifact = await exportBook(book, payload.format);
  if (payload.mode === "kindle") {
    const kindleEmail =
      typeof payload.kindleEmail === "string" ? payload.kindleEmail.trim() : "";
    if (!isValidEmail(kindleEmail)) {
      return NextResponse.json(
        { error: "Enter a valid Kindle email address." },
        { status: 400 }
      );
    }
    const email = buildKindleEmail(
      artifact,
      kindleEmail,
      user?.email ?? "folio-export@example.com"
    );
    return new Response(new Uint8Array(email.data), {
      headers: attachmentHeaders(email.filename, email.contentType),
    });
  }

  return new Response(new Uint8Array(artifact.data), {
    headers: attachmentHeaders(artifact.filename, artifact.contentType),
  });
}
