-- Application Outcome Loop schema
--
-- Lands Wk 1 of the June 15 launch sprint so the platform captures audit data
-- from day 1 of the pilot. If this slips, every status transition before the
-- migration runs is unrecoverable history — the outcome learning loop (Wk 11
-- in original roadmap, post-launch in compressed plan) has nothing to learn
-- from. Schema lands NOW; surfacing lands LATER.
--
-- Three pieces:
--   1. status_changes audit table — captures every applications.status transition
--   2. Trigger on applications.status UPDATE that only fires on actual changes
--      (WHEN OLD.status IS DISTINCT FROM NEW.status — no-op updates are skipped)
--   3. New applications columns: source (where the row came from),
--      found_via_connection / found_via_alumni (network signals at row creation),
--      outcome_notes (terminal-state reflection from user)

-- ─── status_changes table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS status_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  old_status text,
  new_status text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_changes_user_changed
  ON status_changes(user_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_changes_application
  ON status_changes(application_id, changed_at DESC);

ALTER TABLE status_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS status_changes_select_own ON status_changes;
CREATE POLICY status_changes_select_own ON status_changes
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT runs from the trigger (SECURITY DEFINER), not from client code,
-- so we don't need an INSERT policy for users. UPDATE/DELETE are intentionally
-- not granted — the audit trail is append-only.

-- ─── trigger function + trigger ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION log_application_status_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO status_changes (application_id, user_id, old_status, new_status, changed_at)
  VALUES (NEW.id, NEW.user_id, OLD.status, NEW.status, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_application_status_change ON applications;
CREATE TRIGGER trg_log_application_status_change
  AFTER UPDATE OF status ON applications
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_application_status_change();

-- ─── applications metadata for outcome learning ────────────────────────────

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS source text
    CHECK (source IS NULL OR source IN ('manual','scout','job_suggestion','chat_agent','company_target')),
  ADD COLUMN IF NOT EXISTS found_via_connection boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS found_via_alumni boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS outcome_notes text;

COMMENT ON COLUMN applications.source IS
  'How the application was added. manual=user typed in Tracker, job_suggestion=JobSuggestions Add-to-Tracker, chat_agent=ChatInterface add_application action, scout=Wk 5 scout findings, company_target=Wk 4 Internship Picker. Set by the add-path code, never by the user.';
COMMENT ON COLUMN applications.found_via_connection IS
  'TRUE if at row creation time, the company had a row in linkedin_connections for this user. Set by add-path once LinkedIn import lands (Wk 4); defaults FALSE pre-Wk 4.';
COMMENT ON COLUMN applications.found_via_alumni IS
  'TRUE if at row creation time, the company appeared in reichman_alumni curated list. Set by add-path once alumni list lands; defaults FALSE.';
COMMENT ON COLUMN applications.outcome_notes IS
  'Free-text reflection captured when status transitions to terminal (offer/rejected/accepted/declined). Powers per-user outcome pattern surfacing in the Wk 11+ Insights view.';
