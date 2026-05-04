// Per-call metric emit for edge functions. Writes fire-and-forget so
// observability adds zero latency to user-facing requests. Errors during
// the metric write are logged but never thrown — observability failure
// must not break the function it's observing.
//
// Usage pattern (one example — see analyze-job-match for the wired version):
//
//   import { startMetric, finishMetric } from '../_shared/metrics.ts'
//
//   Deno.serve(async (req) => {
//     const m = startMetric('analyze-job-match')
//     try {
//       // ... handler logic ...
//       // when user is known: m.userId = user.id
//       // when LLM responds: m.modelUsed = MODEL; m.tokensIn = usage.prompt_tokens; m.tokensOut = usage.completion_tokens
//       // success: finishMetric(m, { ok: true, httpStatus: 200 })
//       return new Response(JSON.stringify(result), { status: 200, ... })
//     } catch (err) {
//       finishMetric(m, { ok: false, httpStatus: 500, errorCode: 'unhandled' })
//       return new Response(JSON.stringify({ error: '...' }), { status: 500, ... })
//     }
//   })
//
// Coexists with the existing log_error RPC — log_error captures detailed
// forensic data on failures only; function_metrics captures aggregate signal
// on every call. Different cardinality, different consumers.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Pricing table in $/1M tokens. Update when models change or new ones added.
// Unknown models record cost_usd = 0 (so SUMs still work cleanly) — update
// the table when introducing a new model rather than letting unknowns drift.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o':           { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':      { input: 0.15,  output: 0.60 },
  // Anthropic models — added speculatively for future Claude usage; safe to
  // leave in even though we don't currently call Anthropic. Remove if not used.
  'claude-haiku-4-5': { input: 1.00,  output: 5.00 },
  'claude-sonnet-4-6':{ input: 3.00,  output: 15.00 },
  'claude-opus-4-7':  { input: 5.00,  output: 25.00 },
}

export interface Metric {
  functionName: string
  startedAt: number                   // Date.now() when the request began
  userId?: string | null              // mutable — set when auth resolves
  modelUsed?: string | null           // mutable — set after LLM responds
  tokensIn?: number | null            // mutable — set after LLM responds
  tokensOut?: number | null           // mutable — set after LLM responds
}

export interface MetricResult {
  ok: boolean
  httpStatus: number
  errorCode?: string | null
}

export function startMetric(functionName: string): Metric {
  return { functionName, startedAt: Date.now() }
}

function computeCostUsd(
  model: string | null | undefined,
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined
): number | null {
  if (!model || tokensIn == null || tokensOut == null) return null
  const pricing = MODEL_PRICING[model]
  if (!pricing) return 0
  return (tokensIn * pricing.input + tokensOut * pricing.output) / 1_000_000
}

/**
 * Fire-and-forget metric write. Does NOT await the DB insert — observability
 * must not add latency to user-facing requests. Errors are logged but never
 * thrown.
 */
export function finishMetric(m: Metric, result: MetricResult): void {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !serviceKey) {
    console.warn(`[metrics] missing SUPABASE_URL or SERVICE_ROLE_KEY; skipping ${m.functionName}`)
    return
  }

  const row = {
    user_id: m.userId ?? null,
    function_name: m.functionName,
    latency_ms: Date.now() - m.startedAt,
    ok: result.ok,
    error_code: result.errorCode ?? null,
    model_used: m.modelUsed ?? null,
    tokens_in: m.tokensIn ?? null,
    tokens_out: m.tokensOut ?? null,
    cost_usd: computeCostUsd(m.modelUsed, m.tokensIn, m.tokensOut),
    http_status: result.httpStatus,
  }

  // Fire-and-forget. Don't await — observability shouldn't block the response.
  ;(async () => {
    try {
      const client = createClient(url, serviceKey)
      const { error } = await client.from('function_metrics').insert(row)
      if (error) console.warn(`[metrics] insert failed for ${m.functionName}:`, error.message)
    } catch (err) {
      console.warn(`[metrics] unexpected error for ${m.functionName}:`, (err as Error).message)
    }
  })()
}
