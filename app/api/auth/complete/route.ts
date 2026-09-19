import { NextResponse } from "next/server";
import { completeLogin } from "@/lib/xai/oauth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { code, state } = await request.json();
    if (typeof code !== "string" || !code.trim() || code.length > 4096 || /\s/.test(code.trim()) ||
        typeof state !== "string" || !state || state.length > 256) {
      return NextResponse.json({ error: "请粘贴完整授权码，再试一次" }, { status: 400 });
    }
    await completeLogin({ code: code.trim(), state });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "授权码无效、已过期或登录未完成，请重新登录后再试" }, { status: 400 });
  }
}
