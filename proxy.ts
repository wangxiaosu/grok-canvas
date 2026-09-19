import { NextResponse, type NextRequest } from "next/server";
import { allowLocalRequest } from "@/lib/local-access";

export function proxy(request: NextRequest) {
  if (!allowLocalRequest(request.headers, request.nextUrl.pathname)) {
    return NextResponse.json(
      { error: { kind: "forbidden", message: "仅允许从本机画布访问" } },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
