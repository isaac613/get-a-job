-- admin_dashboard — Wk 2 Day 5 of the June 15 launch sprint.
--
-- Backs the /admin page: 5 cards giving Eli real-time observability over
-- the platform (cost trend, per-function volume, conversion funnel, error
-- feed, per-student engagement).
--
-- Defense-in-depth gating:
--   1. admin_users table (RLS-enabled with no policies → deny-all-from-clients;
--      only service-role + SECURITY DEFINER functions can read it).
--   2. is_admin() helper — SECURITY DEFINER reads admin_users using the
--      caller's auth.uid().
--   3. New SELECT policies on profiles / applications / status_changes /
--      stories / function_metrics gated by is_admin() — additive to
--      existing self-access policies (Postgres ORs them).
--   4. Admin RPC functions explicitly check is_admin() at the top and
--      RAISE EXCEPTION if not — belt-and-suspenders even though RLS
--      would already filter rows.
--   5. Frontend route guard checks user.id against admin_users client-side
--      (separate code path; the SQL gate is the actual security).

-- ─── 1. Admin users table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  notes text
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
-- No policies = deny-all-from-clients. Only service-role inserts (for
-- admin provisioning) + the SECURITY DEFINER is_admin() function can
-- read this table. Users cannot enumerate or self-promote.

-- Bootstrap the first admin (Eli, primary account). Adding more admins
-- later is a runtime operation: service-role INSERT INTO admin_users
-- (user_id) VALUES ('<uuid>'); — no migration or redeploy needed because
-- is_admin() reads the table dynamically on every call. Demo account
-- intentionally NOT seeded — kept production-only.
INSERT INTO admin_users (user_id, notes) VALUES
  ('4b243f3a-5035-474e-a89d-aff13fe06cc2', 'Eli — primary')
ON CONFLICT (user_id) DO NOTHING;

-- ─── 2. is_admin() helper ─────────────────────────────────────────────
-- SECURITY DEFINER bypasses the deny-all RLS on admin_users so the
-- function can do its lookup. Returns false for unauthenticated callers
-- (auth.uid() is NULL → row never matches).
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = (SELECT auth.uid())
  );
$$;

-- ─── 3. Admin SELECT policies on data tables ──────────────────────────
-- Additive to existing per-user policies. Postgres ORs SELECT policies →
-- regular users see their own rows; admins see all rows.

DROP POLICY IF EXISTS "Admins view all profiles" ON profiles;
CREATE POLICY "Admins view all profiles" ON profiles
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Admins view all applications" ON applications;
CREATE POLICY "Admins view all applications" ON applications
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Admins view all status_changes" ON status_changes;
CREATE POLICY "Admins view all status_changes" ON status_changes
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Admins view all stories" ON stories;
CREATE POLICY "Admins view all stories" ON stories
  FOR SELECT USING (is_admin());

-- function_metrics had RLS-on with NO policies (deny-all-from-clients,
-- service-role-only). Adding an admin SELECT policy turns the deny-all
-- into "admins-allow + everyone-else-deny."
DROP POLICY IF EXISTS "Admins view all function_metrics" ON function_metrics;
CREATE POLICY "Admins view all function_metrics" ON function_metrics
  FOR SELECT USING (is_admin());

-- ─── 4. Admin RPC functions ───────────────────────────────────────────
-- All four use SECURITY INVOKER so the caller's RLS applies (admins see
-- everything per the policies above; non-admins see nothing because the
-- explicit gate raises). Belt-and-suspenders is_admin() check at top of
-- each so even if RLS misconfigures, the function refuses.

-- Cost & call-volume trend, parameterized by p_days (7/14/30 toggle).
CREATE OR REPLACE FUNCTION admin_cost_trend(p_days int DEFAULT 7)
RETURNS TABLE(day date, total_cost numeric, total_calls bigint, total_failures bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  IF p_days NOT IN (7, 14, 30) THEN
    RAISE EXCEPTION 'p_days must be 7, 14, or 30';
  END IF;
  RETURN QUERY
    SELECT
      date_trunc('day', created_at)::date AS day,
      COALESCE(SUM(cost_usd), 0)::numeric AS total_cost,
      COUNT(*)::bigint AS total_calls,
      COUNT(*) FILTER (WHERE NOT ok)::bigint AS total_failures
    FROM function_metrics
    WHERE created_at > now() - (p_days || ' days')::interval
    GROUP BY 1
    ORDER BY 1;
END $$;

-- Per-function volume & failure rate, last 7 days fixed (this card doesn't
-- need a window toggle — its job is "what's hot right now").
CREATE OR REPLACE FUNCTION admin_function_volume()
RETURNS TABLE(function_name text, calls bigint, failures bigint, total_cost numeric, avg_latency_ms numeric)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT
      fm.function_name,
      COUNT(*)::bigint AS calls,
      COUNT(*) FILTER (WHERE NOT ok)::bigint AS failures,
      COALESCE(SUM(fm.cost_usd), 0)::numeric AS total_cost,
      AVG(fm.latency_ms)::numeric AS avg_latency_ms
    FROM function_metrics fm
    WHERE fm.created_at > now() - INTERVAL '7 days'
    GROUP BY fm.function_name
    ORDER BY calls DESC;
END $$;

-- Conversion funnel — 5 stages from signup to offer.
CREATE OR REPLACE FUNCTION admin_funnel()
RETURNS TABLE(ord int, stage text, count bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT * FROM (VALUES
      (1, 'Signed up',       (SELECT COUNT(*) FROM profiles)::bigint),
      (2, 'Onboarded',       (SELECT COUNT(*) FROM profiles WHERE onboarding_complete = true)::bigint),
      (3, '1+ Application',  (SELECT COUNT(DISTINCT user_id) FROM applications)::bigint),
      (4, '1+ Interview',    (SELECT COUNT(DISTINCT user_id) FROM applications WHERE status IN ('interviewing', 'offer', 'accepted'))::bigint),
      (5, '1+ Offer',        (SELECT COUNT(DISTINCT user_id) FROM applications WHERE status IN ('offer', 'accepted'))::bigint)
    ) AS f(ord, stage, count)
    ORDER BY ord;
END $$;

-- Per-student engagement summary.
CREATE OR REPLACE FUNCTION admin_student_engagement()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  signed_up_at timestamptz,
  onboarding_complete boolean,
  total_applications bigint,
  applications_7d bigint,
  total_stories bigint,
  last_application_at timestamptz,
  total_cost_usd numeric,
  function_calls_7d bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT
      p.id,
      p.full_name,
      p.created_at,
      p.onboarding_complete,
      (SELECT COUNT(*) FROM applications WHERE applications.user_id = p.id)::bigint,
      (SELECT COUNT(*) FROM applications WHERE applications.user_id = p.id AND created_at > now() - INTERVAL '7 days')::bigint,
      (SELECT COUNT(*) FROM stories WHERE stories.user_id = p.id)::bigint,
      (SELECT MAX(created_at) FROM applications WHERE applications.user_id = p.id),
      COALESCE((SELECT SUM(cost_usd) FROM function_metrics WHERE function_metrics.user_id = p.id), 0)::numeric,
      COALESCE((SELECT COUNT(*) FROM function_metrics WHERE function_metrics.user_id = p.id AND created_at > now() - INTERVAL '7 days'), 0)::bigint
    FROM profiles p
    ORDER BY p.created_at DESC;
END $$;

-- ─── Comments for future maintainers ──────────────────────────────────
COMMENT ON TABLE admin_users IS
  'Allow-list for /admin dashboard access. Add rows via service-role only (no client-side INSERT policy). Used by is_admin() helper.';
COMMENT ON FUNCTION is_admin() IS
  'Returns true if the caller (auth.uid()) is in admin_users. SECURITY DEFINER to bypass admin_users RLS for the lookup. Used by RLS policies + admin_* RPC functions.';
COMMENT ON FUNCTION admin_cost_trend(int) IS
  'Daily cost + call-volume buckets for the last p_days (7|14|30). Powers the trend line chart on /admin.';
COMMENT ON FUNCTION admin_function_volume() IS
  'Per-function call counts, failure counts, total cost, average latency over the last 7 days. Powers the per-function bar chart.';
COMMENT ON FUNCTION admin_funnel() IS
  'Five-stage cohort funnel from signed-up → 1+ offer. Drop-off percentages computed client-side.';
COMMENT ON FUNCTION admin_student_engagement() IS
  'Per-user engagement snapshot: signup state, application counts (all-time + 7d), story count, function call count + cost.';
