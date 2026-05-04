-- Track when background tier scoring (analyze-job-match) permanently fails
-- on a row, so the UI can swap "Calculating tier…" for a Retry button
-- instead of showing an indefinite spinner. Set in the catch handler of
-- src/lib/scoreApplication.js; cleared back to NULL on the next successful
-- score so a re-run resets the UI cleanly.
--
-- Why: the background scoring path was silent on failure (console.warn
-- only). Transient OpenAI errors, malformed JSON responses, and edge
-- function timeouts all left rows stuck on "Calculating tier…" forever
-- with no recovery path. At 100 students this guarantees a recurring
-- "the platform is broken" support load. Surfacing the failure as a
-- visible Retry button moves recovery to the user.

ALTER TABLE applications
ADD COLUMN IF NOT EXISTS tier_scoring_failed_at timestamptz;

COMMENT ON COLUMN applications.tier_scoring_failed_at IS
  'Set by src/lib/scoreApplication.js when background tier scoring fails. NULL means either never attempted, in flight, or last attempt succeeded. UI shows a Retry button when set.';
