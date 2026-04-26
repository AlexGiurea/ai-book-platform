import { NextResponse } from "next/server";
import { store } from "@/lib/agent";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * Stops in-flight generation: cancels the project, fails queued/running jobs,
 * and aborts the current model request on this server instance when possible.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
  return NextResponse.json({ ok: true });
}
