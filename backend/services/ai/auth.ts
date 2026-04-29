import type { Env, SecretStoreBinding } from "./types.js";

export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}

export async function resolveSecret(value: string | SecretStoreBinding | undefined): Promise<string> {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "get" in value && typeof value.get === "function") {
    return await value.get();
  }
  return String(value);
}

export function getAllowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }

  const allowedOrigins = String(env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0) {
    return null;
  }

  if (allowedOrigins.includes("*")) {
    return "*";
  }
  if (allowedOrigins.includes(origin)) {
    return origin;
  }

  return null;
}

export function buildCorsHeaders(request: Request, env: Env): Record<string, string> {
  const allowedOrigin = getAllowedOrigin(request, env);
  if (!allowedOrigin) {
    return {};
  }

  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}
