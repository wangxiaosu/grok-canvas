import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-error";
import { pollVideoTask } from "@/lib/video-generate";
import { videoUpstream } from "@/lib/video-upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Params = { params: Promise<{ taskId: string }> };

export async function GET(_request: Request, context: Params) {
  try {
    const { taskId } = await context.params;
    return NextResponse.json(await pollVideoTask(taskId, videoUpstream));
  } catch (error) {
    return errorResponse(error);
  }
}
