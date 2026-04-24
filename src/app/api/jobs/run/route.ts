import { NextResponse } from "next/server";
import { processNextGenerationJob } from "@/lib/agent/job-runner";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const result = await processNextGenerationJob();
  return NextResponse.json(result);
}

export async function GET() {
  const result = await processNextGenerationJob();
  return NextResponse.json(result);
}
