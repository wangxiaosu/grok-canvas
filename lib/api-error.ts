import { NextResponse } from "next/server";
import { BatchProtocolError } from "@/lib/generation-batch";
import { VideoRequestError } from "@/lib/video-generate";
import { OAuthError } from "@/lib/xai/oauth";
import { XaiApiError } from "@/lib/xai/client";

export type ApiErrorBody = {
  error: {
    kind: string;
    message: string;
    status?: number;
    retryAfterSeconds?: number | null;
  };
};

export function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof XaiApiError) {
    const httpStatus =
      error.kind === "not_logged_in" ? 401 : error.status >= 400 ? error.status : 502;
    return NextResponse.json(
      {
        error: {
          kind: error.kind,
          message: error.message,
          status: error.status,
          retryAfterSeconds: error.retryAfterSeconds,
        },
      },
      { status: httpStatus },
    );
  }
  if (error instanceof VideoRequestError) {
    const kind =
      error.httpStatus === 404 ? "not_found" : error.httpStatus >= 500 ? "upstream_protocol" : "bad_request";
    return NextResponse.json({ error: { kind, message: error.message } }, { status: error.httpStatus });
  }
  if (error instanceof BatchProtocolError) {
    return NextResponse.json(
      { error: { kind: "upstream_protocol", message: error.message } },
      { status: 502 },
    );
  }
  if (error instanceof OAuthError) {
    return NextResponse.json(
      { error: { kind: error.code, message: error.message } },
      { status: 401 },
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json(
    { error: { kind: "internal", message } },
    { status: 500 },
  );
}
