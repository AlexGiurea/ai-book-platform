import { NextResponse } from "next/server";
import { store } from "@/lib/agent";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await store.listProjects());
}
