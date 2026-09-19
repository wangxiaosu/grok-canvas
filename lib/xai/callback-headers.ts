export function callbackHeaders(origin: string | null): Headers {
  const headers = new Headers({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", Vary: "Origin" });
  if (origin === "https://accounts.x.ai") {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Private-Network", "true");
  }
  return headers;
}
