/**
 * ai-tracer.ts
 *
 * A thin wrapper around the Google Generative AI SDK that:
 *  1. Times the LLM call
 *  2. Logs prompt, response, latency, token usage, and estimated cost
 *     to Langfuse as a `generation` span inside a parent trace.
 *  3. Returns the raw text response so callers are unaffected.
 *
 * Usage:
 *   import { tracedGenerateContent } from "@/lib/ai-tracer";
 *
 *   const { text, latencyMs } = await tracedGenerateContent({
 *     traceId: "my-trace-id",           // optional — auto-generated if omitted
 *     traceName: "remarks-generation",
 *     modelName: "gemini-flash-latest",
 *     prompt,
 *     metadata: { studentCount: 5, schoolId },
 *     model,  // GenerativeModel instance from @google/generative-ai
 *   });
 */

import type { GenerativeModel } from "@google/generative-ai";
import { getLangfuse, flushLangfuse } from "@/lib/langfuse";

/** Cost per 1 000 tokens in USD — update when pricing changes */
const COST_PER_1K_INPUT_TOKENS = 0.000075; // gemini-flash-latest input
const COST_PER_1K_OUTPUT_TOKENS = 0.0003; // gemini-flash-latest output

export interface TracedGenerateOptions {
  /** Descriptive name for the Langfuse trace (e.g., "remarks-generation") */
  traceName: string;
  /** Optional trace ID — Langfuse generates one if omitted */
  traceId?: string;
  /** Gemini model name for logging (e.g., "gemini-flash-latest") */
  modelName: string;
  /** The full prompt string sent to the model */
  prompt: string;
  /** Instantiated GenerativeModel from @google/generative-ai */
  model: GenerativeModel;
  /** Arbitrary metadata attached to the Langfuse trace */
  metadata?: Record<string, unknown>;
  /** Optional user ID (school ID, student ID, etc.) for Langfuse user tracking */
  userId?: string;
  /** Optional session ID for grouping related traces */
  sessionId?: string;
}

export interface TracedGenerateResult {
  /** Raw text from the model */
  text: string;
  /** Wall-clock latency in milliseconds */
  latencyMs: number;
  /** Input token count (if available from model response) */
  inputTokens: number;
  /** Output token count (if available from model response) */
  outputTokens: number;
  /** Estimated cost in USD */
  estimatedCostUSD: number;
}

/**
 * Calls the Gemini model, wraps the call in a Langfuse trace + generation span,
 * and returns the response with observability metadata.
 */
export async function tracedGenerateContent(
  opts: TracedGenerateOptions
): Promise<TracedGenerateResult> {
  const lf = getLangfuse();
  const startTime = Date.now();

  // ── Create trace (no-op if Langfuse is not configured) ─────────────────────
  const trace = lf?.trace({
    id: opts.traceId,
    name: opts.traceName,
    metadata: opts.metadata,
    userId: opts.userId,
    sessionId: opts.sessionId,
    tags: ["ai", "gemini"],
  });

  // ── Create generation span ──────────────────────────────────────────────────
  const generation = trace?.generation({
    name: opts.traceName,
    model: opts.modelName,
    input: opts.prompt,
    startTime: new Date(startTime),
  });

  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let latencyMs = 0;
  let error: unknown;

  try {
    const result = await opts.model.generateContent(opts.prompt);
    latencyMs = Date.now() - startTime;
    text = result.response.text();

    // Extract token usage from response metadata when available
    const usage = result.response.usageMetadata;
    inputTokens = usage?.promptTokenCount ?? 0;
    outputTokens = usage?.candidatesTokenCount ?? 0;
  } catch (err) {
    latencyMs = Date.now() - startTime;
    error = err;

    // Record the error in Langfuse
    generation?.end({
      level: "ERROR",
      statusMessage: err instanceof Error ? err.message : String(err),
    });

    await flushLangfuse();
    throw err;
  }

  const estimatedCostUSD =
    (inputTokens / 1000) * COST_PER_1K_INPUT_TOKENS +
    (outputTokens / 1000) * COST_PER_1K_OUTPUT_TOKENS;

  // ── End generation span with full metadata ──────────────────────────────────
  generation?.end({
    output: text,
    usage: {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
      unit: "TOKENS",
      inputCost: (inputTokens / 1000) * COST_PER_1K_INPUT_TOKENS,
      outputCost: (outputTokens / 1000) * COST_PER_1K_OUTPUT_TOKENS,
      totalCost: estimatedCostUSD,
    },
    metadata: {
      latencyMs,
      ...opts.metadata,
    },
  });

  // ── Score the trace for latency compliance ──────────────────────────────────
  if (trace) {
    const LATENCY_THRESHOLD_MS = 5000; // 5 s target SLA
    lf?.score({
      traceId: trace.id,
      name: "latency-sla",
      value: latencyMs <= LATENCY_THRESHOLD_MS ? 1 : 0,
      comment: `${latencyMs}ms — threshold ${LATENCY_THRESHOLD_MS}ms`,
    });
  }

  // ── Flush immediately (serverless) ─────────────────────────────────────────
  await flushLangfuse();

  return { text, latencyMs, inputTokens, outputTokens, estimatedCostUSD };
}
