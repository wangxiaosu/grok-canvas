import { NextResponse } from "next/server";
import { clearAuth } from "@/lib/xai/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await clearAuth();
  return NextResponse.json({ ok: true });
}
