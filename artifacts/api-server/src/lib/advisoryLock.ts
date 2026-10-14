import { createHash } from "node:crypto";

// PostgreSQL advisory locks accept signed 64-bit keys. Derive the key in Node
// so older hosting databases do not need hashtextextended or an extension.
// Keep this mapping stable across instances and retries.
export function advisoryLockKey(value: string): string {
  return createHash("sha256")
    .update("treasure-advisory-lock-v1:")
    .update(value)
    .digest()
    .readBigInt64BE(0)
    .toString();
}
