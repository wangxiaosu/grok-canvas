import { OAuthError, refreshTokens } from "./oauth";
import { defaultAuthPath, isLoggedIn, loadAuth } from "./store";
import type { FetchLike } from "./types";

export type ClientOptions = {
  fetch?: FetchLike;
  authPath?: string;
};

export type XaiErrorKind =
  | "not_logged_in"
  | "auth_expired"
  | "tier_denied"
  | "quota_exhausted"
  | "rate_limited"
  | "billing_required"
  | "request_failed";

export class XaiApiError extends Error {
  constructor(
    public readonly kind: XaiErrorKind,
    public readonly status: number,
    message: string,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "XaiApiError";
  }
}

function withBearer(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

function looksLikeExpiredToken(status: number, bodyLower: string): boolean {
  if (status === 401) {
    return true;
  }
  return (
    bodyLower.includes("bad-credentials") ||
    bodyLower.includes("unauthenticated") ||
    bodyLower.includes("token could not be validated") ||
    bodyLower.includes("invalid token") ||
    bodyLower.includes("expired token")
  );
}

/**
 * Fetch against api.x.ai with the stored OAuth access token.
 * On a credential failure it refreshes once and retries.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: ClientOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const authPath = options.authPath ?? defaultAuthPath();
  let auth = await loadAuth(authPath);
  if (!isLoggedIn(auth)) {
    throw new XaiApiError("not_logged_in", 0, "not logged in");
  }

  const lifetime = auth.tokens.expires_in;
  const refreshedAt = auth.last_refresh ? Date.parse(auth.last_refresh) : NaN;
  if (auth.tokens.refresh_token && (!auth.tokens.access_token ||
      (typeof lifetime === "number" && Number.isFinite(refreshedAt) &&
       Date.now() >= refreshedAt + lifetime * 1000 - Math.min(300_000, lifetime * 100)))) {
    auth = await refreshTokens({ fetch: fetchImpl, authPath });
  }
  const first = await fetchImpl(input, withBearer(init, auth.tokens.access_token ?? ""));
  if (first.status !== 401 && first.status !== 403) {
    return first;
  }
  const bodyLower = (await first.clone().text()).toLowerCase();
  if (!looksLikeExpiredToken(first.status, bodyLower)) {
    return first;
  }

  const refreshed = await refreshTokens({ fetch: fetchImpl, authPath });
  return fetchImpl(input, withBearer(init, refreshed.tokens.access_token ?? ""));
}

function errorMessageFromBody(body: string): string {
  if (!body) {
    return "request failed";
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    if (typeof parsed === "string") {
      return parsed;
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (typeof record.error === "string") {
        return record.error;
      }
      if (record.error && typeof record.error === "object") {
        const inner = record.error as Record<string, unknown>;
        if (typeof inner.message === "string") {
          return inner.message;
        }
      }
      if (typeof record.message === "string") {
        return record.message;
      }
      if (typeof record.error_description === "string") {
        return record.error_description;
      }
    }
  } catch {
    return body;
  }
  return body;
}

function classify(status: number, message: string, retryAfter: string | null): XaiApiError {
  const lower = message.toLowerCase();
  const retryAfterSeconds = retryAfter ? Number.parseInt(retryAfter, 10) || null : null;
  const quota =
    lower.includes("quota") || lower.includes("usage limit") || lower.includes("usage_limit");
  const billing =
    status === 402 ||
    lower.includes("billing") ||
    lower.includes("payment") ||
    lower.includes("insufficient") ||
    lower.includes("credit") ||
    lower.includes("spend cap");

  if (looksLikeExpiredToken(status, lower)) {
    return new XaiApiError("auth_expired", status, message);
  }
  if (status === 429) {
    return quota
      ? new XaiApiError("quota_exhausted", status, message)
      : new XaiApiError("rate_limited", status, message, retryAfterSeconds);
  }
  if (billing) {
    return new XaiApiError("billing_required", status, message);
  }
  if (quota) {
    return new XaiApiError("quota_exhausted", status, message);
  }
  if (status === 403) {
    return new XaiApiError("tier_denied", status, message);
  }
  return new XaiApiError("request_failed", status, message);
}

async function apiBase(options: ClientOptions): Promise<string> {
  const auth = await loadAuth(options.authPath ?? defaultAuthPath());
  return auth.base_url.replace(/\/$/, "");
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw classify(response.status, errorMessageFromBody(text), response.headers.get("retry-after"));
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new XaiApiError("request_failed", response.status, "invalid JSON response");
  }
}

export async function postJson<T>(
  pathname: string,
  body: Record<string, unknown>,
  options: ClientOptions = {},
): Promise<T> {
  const base = await apiBase(options);
  const response = await authenticatedFetch(
    `${base}${pathname}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    },
    options,
  );
  return readJsonOrThrow<T>(response);
}

export async function getJson<T>(pathname: string, options: ClientOptions = {}): Promise<T> {
  const base = await apiBase(options);
  const response = await authenticatedFetch(
    `${base}${pathname}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
    },
    options,
  );
  return readJsonOrThrow<T>(response);
}

// ---- Imagine image API surface ---------------------------------------------

export type ImageGenerationRequest = {
  model: string;
  prompt: string;
  n?: number;
  aspect_ratio?: string;
  resolution?: string;
  quality?: string;
};

export type ImageEditRequest = {
  model: string;
  prompt: string;
  /** data: URI or public URL; one image */
  image?: { type: "image_url"; url: string };
  /** multiple images */
  images?: Array<{ type: "image_url"; url: string }>;
  n?: number;
  aspect_ratio?: string;
  resolution?: string;
  quality?: string;
};

// Verified live 2026-09: items carry only `url` (a temporary imgen.x.ai link —
// download promptly) and `mime_type`; no b64_json / revised_prompt in practice.
// Format varies by resolution (1k → JPEG, 2k → PNG) — persist with the actual
// mime_type, not a hardcoded extension.
// `usage.cost_in_usd_ticks` is the billed cost in 1e-10 USD units
// (t2i 1k ≈ $0.04, 2k ≈ $0.06, edit ≈ $0.07 per image).
export type ImageResponse = {
  data: Array<{ url?: string; mime_type?: string }>;
  usage?: { cost_in_usd_ticks?: number };
};

export async function generateImages(
  request: ImageGenerationRequest,
  options?: ClientOptions,
): Promise<ImageResponse> {
  return postJson<ImageResponse>("/images/generations", request, options);
}

export async function editImage(
  request: ImageEditRequest,
  options?: ClientOptions,
): Promise<ImageResponse> {
  return postJson<ImageResponse>("/images/edits", request, options);
}

export function isOAuthError(error: unknown): error is OAuthError {
  return error instanceof OAuthError;
}
