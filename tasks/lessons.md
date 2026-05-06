# Lessons

Append-only log of corrections that took multiple attempts. Read before working in the relevant area.

---
2026-04-28 — LLM scoring middle-band bias on noisy categorical decisions
Trigger: gpt-4o-mini scored an SDR at goal_alignment=60 for a Product Manager target — right at the bottom of the "60-79: Adjacent" rubric band, when the rubric explicitly placed SDR-for-PM in the 0-19 band. Took three iterations (sharper rubric → tighter thresholds → seniority cap) to land correct tiers.
What I did wrong: assumed sharper rubric prose alone would correct gpt-4o-mini's tendency to pick the safe middle. It does not. Mini models hedge to the middle band even when explicit anti-pattern examples are in the rubric.
Rule for next time: when an LLM-derived numeric score feeds a categorical decision (tier, status, classification), do all three: (1) tighten client-side thresholds to leave headroom for LLM noise, (2) sharpen the rubric with explicit "do not default to the middle" wording, (3) persist the raw score to the DB so future mis-assignments are debuggable from data not function logs. Never rely on rubric prose alone.
---
2026-05-05 — Don't ask for manual workarounds when a working REST pattern is already on disk
Trigger: Supabase MCP tools didn't load this session. I proposed Eli paste SQL into the dashboard manually instead of recalling that prior sessions used the management API + a stashed token at /tmp/.gaj_supabase_token. Eli had to push back and tell me to use the same pattern as yesterday.
What I did wrong: defaulted to "ask the user to do it" the moment my preferred tool was missing, without first checking for the project's established alternative. The token file's existence + filename pattern was a clear signal of a deliberate workflow.
Rule for next time: when an MCP tool is missing, before asking the user to do anything manually, check for: (1) tokens/creds at predictable paths (/tmp/.gaj_*, .env.local), (2) prior bash patterns in shell snapshots, (3) curl + management API as the universal fallback (https://api.supabase.com/v1/projects/<ref>/database/query for arbitrary SQL). The supabase management API + a personal access token will always work — there is no situation where MCP loss requires Eli to leave the editor.
---
2026-05-06 — vite build passes, CI lint fails (different validation gates)
Trigger: PR #32 CI failed on `useState` imported but never used in PostComposeForm.jsx. Pre-commit I had only run `npx vite build` which is permissive on unused imports. ESLint with --quiet (CI's lint step) caught it.
What I did wrong: treated `npx vite build` as sufficient pre-commit signal for frontend changes. Vite's job is bundling; it doesn't enforce ESLint rules. The CI runs `npm run lint && npm run typecheck && npm run build` — three separate gates, not one.
Rule for next time: before pushing any frontend PR, run `npm run lint` (not just vite build). The full pre-push command is `npm run lint && npm run typecheck && npm run build` — matches CI exactly. The ~10s extra is cheaper than a failed CI + push-fix cycle.
---
