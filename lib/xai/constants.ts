export const XAI_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
export const XAI_ISSUER = "https://auth.x.ai";
export const XAI_DISCOVERY_URL = `${XAI_ISSUER}/.well-known/openid-configuration`;
export const XAI_AUTHORIZATION_ENDPOINT = `${XAI_ISSUER}/oauth2/authorize`;
export const XAI_TOKEN_ENDPOINT = `${XAI_ISSUER}/oauth2/token`;
export const XAI_API_BASE_URL = "https://api.x.ai/v1";

export const OAUTH_SCOPE =
  "openid profile email offline_access grok-cli:access api:access";
export const OAUTH_PLAN = "generic";
export const OAUTH_REFERRER = "grok-canvas";

export const DEFAULT_REDIRECT_URI = "http://127.0.0.1:3210/callback";

export const AUTH_PROVIDER = "xai-oauth";
export const AUTH_MODE = "oauth_pkce";
