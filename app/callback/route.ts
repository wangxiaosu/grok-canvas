import { NextResponse } from "next/server";
import { completeLogin, OAuthError } from "@/lib/xai/oauth";
import { loadAuth, saveAuth } from "@/lib/xai/store";
import { callbackHeaders } from "@/lib/xai/callback-headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  const allowed = request.headers.get("origin") === "https://accounts.x.ai" &&
    request.headers.get("access-control-request-method") === "GET";
  return new Response(null, { status: allowed ? 204 : 403, headers: callbackHeaders(request.headers.get("origin")) });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const headers = callbackHeaders(origin);
  if (origin && origin !== "https://accounts.x.ai" && origin !== url.origin) {
    return new Response(null, { status: 403, headers });
  }
  let result = "ok";
  const code = url.searchParams.get("code");
  if (url.searchParams.has("error")) {
    result = "denied";
    const auth = await loadAuth();
    if (auth.pending_oauth && url.searchParams.get("state") === auth.pending_oauth.state) {
      auth.pending_oauth = null;
      auth.last_auth_error = { code: "denied", message: "你已取消授权", relogin_required: true, at: new Date().toISOString() };
      await saveAuth(auth);
    }
  }
  else if (!code) result = "missing_code";
  else {
    try {
      await completeLogin({ code, state: url.searchParams.get("state") });
    } catch (error) {
      result = error instanceof OAuthError ? error.code : "failed";
    }
  }
  // The accounts app also delivers codes using fetch, which must not redirect to the canvas.
  if (origin === "https://accounts.x.ai") {
    return NextResponse.json({ ok: result === "ok", result }, { status: result === "ok" ? 200 : 400, headers });
  }
  const host = request.headers.get("host") ?? url.host;
  const destination = new URL("/auth-result", `${url.protocol}//${host}`);
  destination.searchParams.set("auth", result);
  return NextResponse.redirect(destination, { headers });
}
