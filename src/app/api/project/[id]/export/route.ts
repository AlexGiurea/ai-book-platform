import { NextResponse } from "next/server";
import { store } from "@/lib/agent";
import { exportProjectBook, buildKindleEmail, type ExportFormat } from "@/lib/book-export";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 300;

function isExportFormat(value: string | null): value is ExportFormat {
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.plan !== "pro") {
    return NextResponse.json(
      { error: "PDF, EPUB, and Kindle export are available on Pro." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const project = await store.getProjectForUser(id, user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.plan !== "pro") {
    return NextResponse.json(
      { error: "This project is not eligible for export." },
      { status: 403 }
    );
  }
  if (!project.batches.length) {
    return NextResponse.json(
      { error: "There is no manuscript to export yet." },
      { status: 409 }
    );
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "download";
  const format = url.searchParams.get("format");
  if (!isExportFormat(format)) {
    return NextResponse.json(
      { error: "Choose either pdf or epub." },
      { status: 400 }
    );
  }

  const artifact = await exportProjectBook(project, format);
  if (mode === "kindle") {
    const kindleEmail = (url.searchParams.get("kindleEmail") ?? "").trim();
    if (!isValidEmail(kindleEmail)) {
      return NextResponse.json(
        { error: "Enter a valid Kindle email address." },
        { status: 400 }
      );
    }
    const email = buildKindleEmail(artifact, kindleEmail, user.email);
    return new Response(new Uint8Array(email.data), {
      headers: attachmentHeaders(email.filename, email.contentType),
    });
  }

  return new Response(new Uint8Array(artifact.data), {
    headers: attachmentHeaders(artifact.filename, artifact.contentType),
  });
}
