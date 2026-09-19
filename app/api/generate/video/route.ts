import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-error";
import { submitVideoGeneration } from "@/lib/video-generate";
import { videoUpstream } from "@/lib/video-upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { kind: "bad_request", message: "invalid JSON" } }, { status: 400 });
  }
  try {
    return NextResponse.json(await submitVideoGeneration(body, videoUpstream));
  } catch (error) {
    return errorResponse(error);
  }
}
