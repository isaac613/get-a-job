# Lessons

Append-only log of corrections that took multiple attempts. Read before working in the relevant area.

---
2026-04-28 — LLM scoring middle-band bias on noisy categorical decisions
Trigger: gpt-4o-mini scored an SDR at goal_alignment=60 for a Product Manager target — right at the bottom of the "60-79: Adjacent" rubric band, when the rubric explicitly placed SDR-for-PM in the 0-19 band. Took three iterations (sharper rubric → tighter thresholds → seniority cap) to land correct tiers.
What I did wrong: assumed sharper rubric prose alone would correct gpt-4o-mini's tendency to pick the safe middle. It does not. Mini models hedge to the middle band even when explicit anti-pattern examples are in the rubric.
Rule for next time: when an LLM-derived numeric score feeds a categorical decision (tier, status, classification), do all three: (1) tighten client-side thresholds to leave headroom for LLM noise, (2) sharpen the rubric with explicit "do not default to the middle" wording, (3) persist the raw score to the DB so future mis-assignments are debuggable from data not function logs. Never rely on rubric prose alone.
---
