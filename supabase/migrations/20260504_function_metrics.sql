-- function_metrics — per-call observability for edge functions
--
-- Lands Wk 1 of the June 15 launch sprint. Captures one row per edge function
-- invocation: latency, ok/fail, model used, tokens consumed, computed cost.
-- Powers (a) the admin view (Wk 2), (b) the autonomous job scout sizing
-- decisions (Wk 5), (c) per-user cost tracking, (d) per-function failure-rate
-- alerts during pilot.
--
-- Coexists with the existing log_error RPC. function_metrics is for aggregate
-- dashboards (every call); log_error stays for forensic detail on failures
-- (only failures, with full error context). Different cardinality, different
-- consumers — keeping them separate avoids overloading one table.
--
-- Writes happen fire-and-forget from edge functions via the service role
-- (see supabase/functions/_shared/metrics.ts). RLS denies all client access;
-- admin views read via service role only.

CREATE TABLE IF NOT EXISTS function_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,                       -- nullable: some calls happen pre-auth
  function_name text NOT NULL,
  latency_ms integer NOT NULL,
  ok boolean NOT NULL,
  error_code text,                    -- short categorical: 'auth', 'openai_5xx', 'parse', 'timeout', etc.
  model_used text,                    -- 'gpt-4o' | 'gpt-4o-mini' | null for non-LLM calls
  tokens_in integer,
  tokens_out integer,
  cost_usd numeric(10, 6),            -- computed from pricing table at write time. Locked-in for accounting.
  http_status integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for the two query shapes the admin view needs:
--   1. "what's happening across the platform right now" — by function + recent
--   2. "what did this user cost" — by user + recent
CREATE INDEX IF NOT EXISTS idx_function_metrics_function_created
  ON function_metrics(function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_function_metrics_user_created
  ON function_metrics(user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- RLS deny-all-from-clients. The metrics table is server-side only — written
-- by edge functions via the service role, read by admin views via service
-- role. No user-facing access.
ALTER TABLE function_metrics ENABLE ROW LEVEL SECURITY;
-- (No policies created. RLS-on with no policies = deny by default for non-service-role.)

COMMENT ON TABLE function_metrics IS
  'Per-call observability for edge functions. Written fire-and-forget by the metrics helper at supabase/functions/_shared/metrics.ts. Coexists with log_error RPC (different cardinality + use case).';
COMMENT ON COLUMN function_metrics.cost_usd IS
  'Computed at write time from MODEL_PRICING table in the metrics helper. Locked-in to historical pricing — does not retroactively change if model pricing shifts.';
COMMENT ON COLUMN function_metrics.error_code IS
  'Short categorical tag (e.g. ''auth'', ''openai_5xx'', ''parse'', ''timeout''), not full error message. Detailed errors go to log_error RPC.';
