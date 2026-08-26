import { NextResponse } from "next/server";
import { store } from "@/lib/agent";
import { getCurrentUser } from "@/lib/auth/session";
import { settleWords } from "@/lib/billing/ledger";
import { rejectCrossOrigin } from "@/lib/security/request";

export const runtime = "nodejs";

/**
 * Stops in-flight generation: cancels the project, fails queued/running jobs,
 * and aborts the current model request on this server instance when possible.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const result = await store.cancelProjectForUser(id, user.id);
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Give back the words this book will now never write. Settling against the
  // prose that already exists means someone who cancels at 80% keeps paying for
  // the 80% they can still read, and gets the rest back.
  const cancelled = await store.getProject(id);
  try {
    await settleWords({
      projectId: id,
      actualWords: cancelled?.totalWords ?? 0,
      note: "cancelled by the author",
    });
  } catch (err) {
    console.warn(
      "[folio] cancel settlement failed",
      err instanceof Error ? err.message : String(err)
    );
  }

  return NextResponse.json({ ok: true });
}
