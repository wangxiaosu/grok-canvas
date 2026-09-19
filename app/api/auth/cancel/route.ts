import { NextResponse } from "next/server";
import { loadAuth, saveAuth } from "@/lib/xai/store";

export async function POST(request: Request) {
  try {
    const { state } = await request.json();
    if (typeof state !== "string" || !state || state.length > 256) return new Response(null, { status: 400 });
    const auth = await loadAuth();
    if (auth.pending_oauth?.state === state) {
      auth.pending_oauth = null;
      await saveAuth(auth);
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return new Response(null, { status: 500 }); }
}
