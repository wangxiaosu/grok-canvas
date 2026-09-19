import assert from "node:assert/strict";
import { test } from "node:test";
import { allowLocalRequest } from "../lib/local-access.ts";

const headers = (extra = {}) => new Headers({ host: "127.0.0.1:3210", ...extra });

test("local UI can load, fetch assets, and submit changes", () => {
  assert.equal(allowLocalRequest(headers(), "/"), true);
  for (const path of ["/api/assets/test.png", "/api/generate/image", "/api/canvases"]) {
    assert.equal(allowLocalRequest(headers({ "sec-fetch-site": "same-origin" }), path), true);
    assert.equal(allowLocalRequest(headers({ origin: "http://127.0.0.1:3210" }), path), true);
  }
});
test("rejects foreign origins, missing origin evidence, and rebinding hosts", () => {
  for (const extra of [{}, { origin: "https://evil.example" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }, { origin: "null" }, { host: "evil.example:3210", "sec-fetch-site": "same-origin" }, { host: "127.0.0.1:3210.evil.example", "sec-fetch-site": "same-origin" }]) {
    assert.equal(allowLocalRequest(headers(extra), "/api/generate/image"), false);
  }
  assert.equal(allowLocalRequest(headers({ "sec-fetch-site": "same-origin", origin: "https://evil.example" }), "/api/auth/logout"), false);
});
test("OAuth callback permits xAI navigation but still requires local host", () => {
  assert.equal(allowLocalRequest(headers({ "sec-fetch-site": "cross-site" }), "/callback"), true);
  assert.equal(allowLocalRequest(headers({ host: "evil.example", "sec-fetch-site": "cross-site" }), "/callback"), false);
});
