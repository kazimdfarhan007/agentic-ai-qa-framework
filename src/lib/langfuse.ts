/**
 * Langfuse singleton client
 *
 * Usage:
 *   import { getLangfuse } from "@/lib/langfuse";
 *   const lf = getLangfuse();
 *   const trace = lf.trace({ name: "remarks-generation" });
 */

import { Langfuse } from "langfuse";

let _client: Langfuse | null = null;

/**
 * Returns the shared Langfuse client.
 * Returns null when credentials are not configured so the rest of the
 * application can treat tracing as optional and fail gracefully.
 */
export function getLangfuse(): Langfuse | null {
  if (_client) return _client;

  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const host =
    process.env.LANGFUSE_HOST ??
    process.env.LANGFUSE_BASE_URL ??
    "https://cloud.langfuse.com";

  if (!secretKey || !publicKey) {
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        "[Langfuse] LANGFUSE_SECRET_KEY or LANGFUSE_PUBLIC_KEY not set — tracing disabled."
      );
    }
    return null;
  }

  _client = new Langfuse({
    secretKey,
    publicKey,
    baseUrl: host,
    // Flush immediately in serverless (Vercel/Next.js edge/node runtimes)
    // so traces are sent before the function process dies.
    flushAt: 1,
    flushInterval: 0,
  });

  return _client;
}

/**
 * Flush all pending traces before a serverless function exits.
 * Call this at the end of every API route that uses tracing.
 */
export async function flushLangfuse(): Promise<void> {
  await _client?.flushAsync();
}
