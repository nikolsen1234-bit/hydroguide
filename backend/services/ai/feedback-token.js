/**
 * Generates a cryptographically strong, unguessable token for the
 * user-feedback flow. The token is used as the KV key
 * (`feedback:${token}`) and returned in the AI response body so the
 * client can post feedback for that specific generation.
 *
 * Uses `crypto.randomUUID()` (RFC 4122 v4), which provides 122 bits of
 * entropy from a CSPRNG. Available in the Cloudflare Workers V8 runtime
 * and in modern Node.js without an explicit import.
 *
 * @returns {string} A URL-safe UUID v4 string (36 chars).
 */
export function createFeedbackToken() {
  return crypto.randomUUID();
}
