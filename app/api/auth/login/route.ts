import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-error";
import { beginLogin } from "@/lib/xai/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await beginLogin();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
