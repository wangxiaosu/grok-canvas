import { createHash, randomBytes } from "node:crypto";

export function randomOpaque(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
