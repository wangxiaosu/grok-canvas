import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-error";
import { recoverVideoTasks } from "@/lib/video-generate";
import { videoUpstream } from "@/lib/video-upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  try {
    return NextResponse.json({ tasks: await recoverVideoTasks(videoUpstream) });
  } catch (error) {
    return errorResponse(error);
  }
}
