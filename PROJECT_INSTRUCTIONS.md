# PROJECT_INSTRUCTIONS — Get A Job

**Last updated: 2026-05-12 (after PRs #38–#47 — Langfuse migration complete, Daily Action Card backend, admin pilot tooling, deployed live at getajob.careers)**

This file is the **living source of truth** for the project. Read this first, then follow cross-references for depth.

**Every PR must update this file.** When the change is non-trivial — new feature, new edge function, new schema, sprint progress — append/edit the relevant section. The CLAUDE.md / ROADMAP.md / lessons.md files have one job each; this file is the index that ties them together. If you read this and something feels stale, fix it.

Cross-references:
- `CLAUDE.md` — coding conventions, branch + PR rules, commit format, lessons doctrine
- `ROADMAP.md` — week-by-week sprint plan with the v1/v2 cut table
- `tasks/lessons.md` — append-only log of "took multiple attempts" gotchas; read before non-trivial work in tier scoring, LLM prompts, edge-function deploys, role/skill libraries, onboarding
- `README.md` — local setup + env vars
- `docs/research/linkedin-post-performance.md` — research findings that ground every LinkedIn-related prompt
- `docs/strategy/installation-checklist.md` + `docs/strategy/design-strategy.md` — prioritized tool/MCP/skill/API installation roadmap and the UX/sidebar/display-philosophy reference for the Wk 6 visual redesign

---

## What this app is

Get A Job is an AI-powered career operating system for **business students at Reichman University entering the Israeli tech market.** Pilot launches **June 15, 2026** (80 own-pilot users via WhatsApp groups), then a Reichman 10-student practicum in August, then the larger 100-student Reichman practicum Aug–Nov 2026.

Target users are not generic job seekers — they are early-career business students (CS, Marketing, BD, RevOps, PM, CSM, Solutions, GTM kinds of roles, not engineering). All product decisions are anchored to that audience: reply rates, tone, role library, voice rules, framework defaults.

Pilot is **CONFIRMED** — Reichman professor + Dr. Miller personally vouching. Internship Company Picker is a P0 add to original scope.

---

## Where we are right now

**Sprint week:** Wk 3 of the June 15 launch sprint (May 19–25 per ROADMAP, but we're running ahead — Eli's slice is complete). Today is **2026-05-12**.

**Most recent PRs (chronological):**

| # | Date | What |
|---|---|---|
| #20 | Apr 27 | refactor(prompts) — replace banned-vocab lists with positive voice rules |
| #21 | Apr 28 | feat(cv) — template engine + sector-aware fonts + matcher hardening |
| #22 | Apr 28 | fix(chat) — gate story-capture follow-up + CV style picker in chat |
| #23–#29 | Apr 28 → May 4 | CV polish series (date normalization, About align, sub-header weight, conditional Experience umbrella, institution guard, dedup, per-bucket tailoring policy, ATS template, Polished one-page chrome, restored visual hierarchy) |
| #30 | May 5 | docs(research) — `docs/research/linkedin-post-performance.md`, ~430 lines, source-of-truth referenced by all LinkedIn-related prompts |
| #31 | May 5 | feat(linkedin) — Phase 1: hub tabs + POST_VOICE_RULES. `LinkedinOptimizer.jsx` becomes a 3-tab hub (Profile / Posts / Networking) routed via `useSearchParams` |
| #32–#33 | May 6 | feat(linkedin) — Posts Phases 2+3: 7 post types (project / lessons / milestone / recap / observation / question / free_form) + carousel warning |
| #34 | May 6 | feat(linkedin) — Phase 4 PR A: Networking tab — principles + Comment Coach |
| #35 | May 6–8 | feat(linkedin) — Phase 4 PR B: Outreach Conversation Coach. 8 goals, multi-turn coaching, warm-up-vs-ask judgment |
| #36–#37 | May 8 | docs — PROJECT_INSTRUCTIONS.md established as living source of truth + ROADMAP catch-up + PR template checkbox + post-merge cleanup |
| #38–#39 | May 8–12 | docs(strategy) — `docs/strategy/installation-checklist.md` + `docs/strategy/design-strategy.md` + tick off completed installs (Context7 MCP, obra/superpowers, Anthropic skills, ui-ux-pro-max, Corey Haines marketing) |
| #40 | May 12 | chore(claude) — Production hooks at `.claude/settings.json`: PostToolUse auto-format (Prettier + ESLint), PreToolUse file protection (migrations / voice-rules / libraries / .env / package-lock), PreToolUse dangerous-command blocker (rm -rf, destructive SQL, force-push, --no-verify) |
| #41 | May 10–11 | feat(observability) — Langfuse tracing helper (`_shared/openai-chat.ts`) + extract-story-from-text canary. Pure pass-through safety; reads `LANGFUSE_*` env vars; `x-langfuse-ingestion-version: 4` header for real-time traces |
| #42–#44 | May 11 | feat(observability) — Langfuse migration batches 2a (5 low-risk), 2b (4 LinkedIn family), 2c (3 complex: career-analysis + tailored-cv with `cv-gen-<uuid>` sessionId + ai-chat with refactored retry wrapper). **All 13 OpenAI-calling functions traced** |
| #45 | May 12 | feat(daily-action) — Daily Action Card backend. Migration `20260511_daily_actions.sql` + `generate-daily-action` edge function. Rule-based ranking (leverage × urgency × low_friction × calibration backoff) + LLM framing only. Lazy generation on Home load; UNIQUE per (user, date) |
| #46 | May 12 | feat(admin) — Admin chat log viewer + story browser. Migration adds `admin_list_students` / `admin_chat_messages` / `admin_stories_browse` RPCs. Two new cards on `/admin` with student dropdown, pretty-printed `suggested_*_json` blocks, raw-text-vs-STAR side-by-side |
| #47 | May 12 | fix(deploy) — `vercel.json` SPA rewrite so deep routes (`/admin`, etc.) resolve client-side |

**Currently in flight:**
- Isaac's Wk 3 slice — Story Bank Phase 2 (Mon), Daily Action Card UI (Wed), calibration loop validation (Fri)
- Wk 4 (Eli) up next: LinkedIn import + Internship Finder Phase 1 (LinkedIn archive zip parser, `linkedin_imports` / `linkedin_connections` / `linkedin_change_events` schema, connection cross-reference)

---

## Architecture at a glance

**Frontend:** React 18 + Vite + Tailwind + shadcn/ui + TanStack Query + sonner (toasts). Pages in `src/pages/` auto-register via `src/pages.config.js` (do not edit `pages.config.js` manually). Routing: BrowserRouter; `createPageUrl(pageName)` from `@/utils` builds page paths.

**Backend:** Supabase. Project ref `ilmqmodklutztuybsvwd`.
- Postgres + RLS (4-policy own-row pattern: SELECT / INSERT / UPDATE / DELETE all `(SELECT auth.uid()) = user_id`)
- Auth (email + magic link)
- Edge Functions in Deno (`supabase/functions/<slug>/index.ts`)
- Storage (CV PDFs, etc.)
- Migrations in `supabase/migrations/<YYYYMMDD>_<slug>.sql`

**LLM provider:** OpenAI. Two model tiers:
- `gpt-4o-mini` for cheap classification / extraction (Story extraction, tier scoring)
- `gpt-4o` for generation surfaces (CV, posts, comments, outreach, career analysis)
- `response_format: json_object` for any structured output

**Domain libraries** (Israeli market context, ~170 roles + skills + proof signals + role-skill mappings): `supabase/functions/<slug>/shared/libraries/00_role_library.ts` etc. Each function copies the libraries it needs — keep in sync if editing. Edits require explicit cross-review by the other dev.

**Tier scoring:** `src/lib/scoreApplication.js` (`tierFromScores`) mirrors `assignTierWithGoal` in `generate-career-analysis`. LLM-derived alignment uses tighter thresholds than the deterministic path.

**Deployment (live since 2026-05-12):**
- **Repo:** `getajob-careers/get-a-job` on GitHub (transferred from `isaac613/get-a-job` 2026-05-12)
- **Hosting:** Vercel — auto-deploys from `main` on push
- **Domain:** `getajob.careers` (Cloudflare DNS → Vercel)
- **Supabase Auth URL configuration:** set to `https://getajob.careers` for magic-link redirects
- **`vercel.json`:** SPA rewrite at the repo root so deep routes (`/admin`, `/Tracker`, etc.) resolve through React Router instead of returning 404 from Vercel's static handler (PR #47)
- **Observability:** Langfuse Cloud (per-call LLM traces with userId filtering) + Supabase `function_metrics` table (per-call latency/cost/tokens) + Supabase edge function logs dashboard

---

## Edge functions (16)

All under `supabase/functions/<slug>/index.ts`. Each writes per-call metrics via `_shared/metrics.ts` (PR #6) and emits Langfuse traces via `_shared/openai-chat.ts` (PR #41-#44).

| Slug | Model | Purpose |
|---|---|---|
| `ai-chat` | gpt-4o | Career Agent multi-turn chat. Emits `SUGGESTED_*_JSON` blocks (TASKS, ROADMAP_CHANGES, APPLICATION_ACTIONS, CV_GENERATION, AGENT, STORY_CAPTURE) the frontend renders as cards |
| `analyze-job-match` | gpt-4o | Score a JD against user profile → `match_score` + `goal_alignment_score` + `required_seniority`. Drives tier auto-assignment |
| `extract-proof-signals` | gpt-4o-mini | Pull proof signals (metrics, named tools, named outcomes) from free-text inputs |
| `extract-story-from-text` | gpt-4o-mini | STAR extraction from user-pasted experience text. 3-layer anti-fabrication. Powers Story Bank |
| `generate-career-analysis` | gpt-4o | Tiered role recommendations (`career_roles` table) — Tier 1/2/3 with rationale |
| `generate-daily-action` | gpt-4o-mini | **Daily Action Card** backend. Rule-based ranking (leverage × urgency × low_friction × calibration backoff) over tasks + applications + career_roles + stories, picks top-1, LLM frames only the title/rationale/estimated_minutes. Lazy generation on Home dashboard load; UNIQUE (user_id, for_date) enforces max one card per day. `pick_score` persisted for debugging |
| `generate-job-suggestions` | gpt-4o | JSearch / Active Jobs DB → scored job suggestions for the user's roles |
| `generate-learning-paths` | gpt-4o | Course recommendations to close skill gaps (Coursera + LinkedIn Learning affiliate links) |
| `generate-linkedin-comment` | gpt-4o | **PR #34.** Paste a post → 3 substantive comment options grounded in user's real experience. Anti-fab: empty options + `no_fit_reason` when nothing genuine to say |
| `generate-linkedin-content` | gpt-4o | Earlier LinkedIn content function (pre-Phase-2) — likely deprecate path TBD |
| `generate-linkedin-outreach-message` | gpt-4o | **PR #35.** Multi-turn outreach coach across 8 goals. Two modes: new conversation (insert + opener) or continue (load thread + append `new_them_reply` or `mark_as_sent` → next AI turn). Emits `warm_up_advice` for premature asks. Programmatic anti-pattern detection in post-process |
| `generate-linkedin-post` | gpt-4o | **PR #32–33.** 7 post types (project / lessons / milestone / recap / observation / question / free_form). Per-type framework + POST_VOICE_RULES injected. Refinement mode supported (UPDATE same row) |
| `generate-tailored-cv` | gpt-4o | CV generation with STORY BANK PRECEDENCE — verbatim metric/tool binding from `stories` table. DOCX rendering via template engine (PR #21+) |
| `generate-tasks` | gpt-4o | Personalised weekly action plan |
| `import-linkedin-archive` | n/a | Wk 4 LinkedIn import (zip upload + Connections.csv parser). Schema designed; awaiting Eli's archive |
| `lookup-role-skills` | n/a | Static lookup against `role_library` + `skill_library` |

**Rate limits:** all generation surfaces are gated via `serviceClient.rpc('check_rate_limit', ...)`. Defaults: 60/hour for posts/comments/outreach, lower for CV (expensive call).

**Deploy:** via Supabase CLI (`supabase functions deploy <slug> --project-ref ilmqmodklutztuybsvwd`) OR via Supabase Management API multipart endpoint when CLI is unavailable. The token is stashed at `/tmp/.gaj_supabase_token` for current sessions; see `tasks/lessons.md` 2026-05-05 entry.

---

## Voice rules (5 constants)

All in `supabase/functions/_shared/voice-rules.ts`. Each is a long string injected into the system prompt of the relevant edge function. Source-of-truth voice across surfaces.

| Constant | Surface | Notes |
|---|---|---|
| `CV_VOICE_RULES` | `generate-tailored-cv` | Resume voice — concrete > generic, named outcomes, specific metrics, active voice |
| `LINKEDIN_VOICE_RULES` | LinkedIn profile content | Headline + summary + experience bullets — same anti-fluff discipline as CV |
| `POST_VOICE_RULES` | `generate-linkedin-post` | Hook rules, engagement-bait blacklist (no "Agree?" / "Comment YES if…"), suppressed openers ("Excited to share", "Thrilled to announce", "Humbled to") |
| `COMMENT_VOICE_RULES` | `generate-linkedin-comment` | 50–150 word sweet spot, anti-platitude list, Israeli direct register |
| `OUTREACH_VOICE_RULES` | `generate-linkedin-outreach-message` | The outreach contract (3 questions recipient asks), 50–150 word openers, ≤200 char connection notes, anti-pattern list including "I hope this finds you well" + variants, the ask-temperature principle, anti-fabrication with explicit examples |

**The replace-banned-vocab-with-positive-voice-rules refactor was PR #20.** Old approach (banned vocab lists) didn't work — the model would pattern-match around the banned words but keep the underlying voice. Voice-rules approach gives the model what TO write, not just what NOT to.

**Anti-pattern detection.** For OUTREACH specifically, the model still slips template phrases ("I hope you're doing well") even with hard-rule injection — these are too high-frequency in training data. PR #35 added programmatic post-process detection in `sanitizeSuggestion` that scans for ~10 known anti-patterns and surfaces warning chips into `suggestion.warnings`. The user sees the warning above the editable text and rewrites before sending. This is a pattern worth replicating for any other surface where the model resists rule-following on common phrases.

---

## Key files

Single index — when something feels load-bearing, it's probably in here.

### Frontend
| Path | What |
|---|---|
| `src/pages/LinkedinOptimizer.jsx` | LinkedIn hub. Tabs Profile / Posts / Networking via `useSearchParams` |
| `src/components/linkedin/ProfileTab.jsx` | Original LinkedIn Optimizer body (PR #20-era) |
| `src/components/linkedin/PostsTab.jsx` | Posts state machine (idle → compose → preview); renders `PostTypeGrid`, `PostComposeForm`, `PostPreview`, `PostsList`, `StoryBankSidebar` |
| `src/components/linkedin/NetworkingTab.jsx` | Networking tab — Comment Coach + Outreach Coach. Strategy guide link to Resources at top (PR #35 refactor) |
| `src/components/linkedin/posts/{PostTypeGrid,PostComposeForm,PostPreview,PostsList,StoryBankSidebar}.jsx` | Posts subcomponents |
| `src/components/linkedin/networking/CommentCoach.jsx` | Paste post → 3 comment options. Ephemeral, no persistence |
| `src/components/linkedin/networking/NetworkingPrinciples.jsx` | 6 principle cards + 2 colored callout banners. Lives in Resources page after PR #35 |
| `src/components/linkedin/networking/OutreachConversationsList.jsx` | List of past outreach conversations, active first, sorted by `updated_at DESC` |
| `src/components/linkedin/networking/OutreachComposer.jsx` | 3-screen composer: pick goal (grouped 6C) → describe target → multi-turn thread with editable bubbles + AI suggestion card |
| `src/pages/Resources.jsx` | Accordion of guides. Supports optional `component` field on guide entries (PR #35) |
| `src/pages/AddInformation.jsx` | The 38-column profile editor; covers 33 user-editable cols today |
| `src/lib/scoreApplication.js` | `tierFromScores` — deterministic tier mapping; mirrors LLM-derived `assignTierWithGoal` |
| `src/utils/index.ts` | `createPageUrl` helper for inter-page navigation |

### Backend (edge functions)
| Path | What |
|---|---|
| `supabase/functions/_shared/voice-rules.ts` | The 5 voice-rule constants |
| `supabase/functions/_shared/metrics.ts` | `startMetric` / `finishMetric` — per-call observability writing to `function_metrics` |
| `supabase/functions/_shared/openai-chat.ts` | `openaiChatCompletion()` — drop-in fetch wrapper that adds Langfuse tracing as a pure pass-through (fire-and-forget via `EdgeRuntime.waitUntil`, swallows all Langfuse errors so the OpenAI call always works). Reads env vars `LANGFUSE_SECRET_KEY` / `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_BASE_URL`. Sends `x-langfuse-ingestion-version: 4` header for real-time trace ingestion. **All 13 OpenAI-calling edge functions migrated** (PRs #41 / #42 / #43 / #44). `generate-tailored-cv` two-pass groups via `sessionId: cv-gen-<uuid>`; `generate-linkedin-outreach-message` multi-turn groups via `sessionId: outreach-<conversation_id>`; `ai-chat` retries trace per attempt via the refactored `fetchOpenAIWithRetry` helper |
| `supabase/functions/_shared/post-frameworks/{types,frameworks}.ts` | 7 post-type frameworks + typed input shapes (PR #32–33) |
| `supabase/functions/_shared/outreach-frameworks/{types,frameworks}.ts` | 8 outreach-goal frameworks + typed shapes (PR #35) |
| `supabase/functions/_shared/cv-templates/` | CV template engine (PR #21) |

### Schema
| Migration | Purpose |
|---|---|
| `20260504_stories_schema.sql` | Story Bank — `stories` table, RLS, 4 indexes, trigger |
| `20260504_function_metrics.sql` | Per-call observability across edge functions |
| `20260504_application_outcome_loop_schema.sql` | `status_changes` audit table + `applications.source` / `found_via_*` / `outcome_notes` |
| `20260504_admin_dashboard.sql` | Admin SQL views infrastructure |
| `20260504_linkedin_optimizations.sql` | LinkedIn profile optimizations |
| `20260506_linkedin_posts.sql` | 7-type posts table — separate `edited_text` column (per Eli's call PR #32) |
| `20260506_linkedin_outreach_conversations.sql` | 8-goal multi-turn conversations table (PR #35) |
| `20260506_profiles_education_institution.sql` | Education institution column |
| `20260511_daily_actions.sql` | Daily Action Card table — one row per (user_id, for_date), 8 action types, calibration-loop partial index on dismissed-by-type, RLS 4-policy |
| `20260512_admin_chat_and_story_browsers.sql` | Admin pilot tooling — `admin_list_students()` / `admin_chat_messages()` / `admin_stories_browse()` RPCs + admin SELECT policies on conversations + chat_messages. Powers the two new admin cards |

### Docs / process
| Path | What |
|---|---|
| `docs/research/linkedin-post-performance.md` | LinkedIn research source of truth (~430 lines) — cross-validated / single-sourced / contested findings tagged. Update when pilot data contradicts |
| `docs/strategy/installation-checklist.md` | Prioritized tool/MCP/skill/API installation roadmap (this week / pre-launch / post-launch) |
| `docs/strategy/design-strategy.md` | UX principles, sidebar architecture, display philosophy, pre-launch checklist |
| `tasks/lessons.md` | Append-only log of "took multiple attempts" gotchas |
| `CLAUDE.md` | Coding conventions, branch + PR rules, commit format |
| `ROADMAP.md` | Week-by-week sprint plan, v1/v2 cuts, risk register |
| `.github/pull_request_template.md` | What every PR description must cover |
| `.claude/settings.json` + `.claude/scripts/{protect-files,block-dangerous}.sh` | Project-shared Claude Code hooks — auto-format/lint on every file edit (PostToolUse), file protection on migrations/voice-rules/libraries/.env/package-lock (PreToolUse), dangerous-command blocking for rm -rf, destructive SQL, force-push, --no-verify, prod db reset (PreToolUse Bash). Per-user overrides in `.claude/settings.local.json` |

---

## Sprint status — Wk 3 remaining + Wk 4 queue

The full week-by-week is in `ROADMAP.md`. This is the working slice.

### Wk 3 remaining

**Eli (Thu–Fri slots):**
- ✅ **Daily Action Card** — schema + `generate-daily-action` edge function (rule-based ranking + LLM framing; lazy generation on Home load). Migration `20260511_daily_actions.sql`. _Backend complete; Isaac builds UI._
- ✅ **Admin chat log viewer** — `admin_chat_messages(p_user_id, p_limit)` RPC + `<ChatLogsCard />` on `/admin`. Student dropdown → grouped conversations (collapsed by default) → expandable threads with pretty-printed `suggested_*_json` blocks. Error rows show original prompt + failure response side-by-side.
- ✅ **Admin story browser** — `admin_stories_browse(p_user_id NULL, p_limit)` RPC + `<StoryBrowserCard />` on `/admin`. Student dropdown (with "All students") → story cards with STAR fields stacked, chips for metrics/skills/tools/tags, and `raw_source_text` side-by-side when `source='conversation'` (best-effort: latest user message before story.created_at). `extraction_notes` display deferred — column isn't persisted yet by extract-story-from-text.

**Isaac (Wk 3, 2.5 days):**
- **Mon — Story Bank Phase 2:** AddInformation Experience tab inline stories + quick-add modal
- **Wed — Daily Action Card UI** on Home dashboard (Done / Snooze / Dismiss actions). Backend ready: POST to `generate-daily-action`, render `{ daily_action: { title, rationale, estimated_minutes, action_type, source_table, source_id, status } }`. For `reflect`, clicking Done opens Story Bank quick-add modal (the reflection IS the capture). On Dismiss: PATCH `daily_actions` row to `status='dismissed'` — calibration loop is already wired in the edge function (`generate-daily-action` queries last-7-day dismissals on each call).
- **Fri — Daily Action calibration loop:** already wired in backend (see above). Isaac validates by triggering 3+ dismissals of a type and confirming the next pick deweights that type.

### Wk 4 queue (May 26 – June 1)

**Eli:**
- **Mon–Tue — LinkedIn import:** schema (`linkedin_imports` + `linkedin_connections` + `linkedin_change_events`) + zip upload edge function + Connections.csv parser (others if time)
- **Wed — Connection cross-reference:** match user's connections against Internship Picker company list. "X connections at Atera" UI on Tracker rows
- **Thu — Internship Finder schema:** `internship_profiles` + `companies` + `company_targets` + `faculty_practicum_companies` + `practicum_mode` onboarding toggle + `generate-internship-profile` edge function
- **Fri:** buffer + integration test

**Isaac (Wk 4, 2.5 days):**
- **Mon — `match-internship-companies` edge function** (scoring against profile)
- **Wed — `/Practicum` page UI:** profile display + kanban pipeline (basic — exploring → outreach → interview → offered)
- **Fri — Career Agent practicum prompt addition** + `SUGGESTED_COMPANY_TARGET_JSON` parsing

**Wk 4 risk:** Internship Finder is normally 10 days; we're fitting ~4. v1 cuts already locked: no curated companies DB seed (job-board API only), no `draft-outreach-message` (defer post-launch), no faculty-provided list (manual entries). Phase 2 polish post-launch.

**Wk 4 hard dependency:** LinkedIn import depends on Eli's archive being requested in Wk 1. ~24h LinkedIn processing cooldown. If late, parser uses sample data and ships Connections-only v1.

---

## Isaac — your tasks

Pulled from ROADMAP.md, scoped to your 2.5 days/week through launch.

### This week (Wk 3, May 19–25 / running through May 25)
1. Story Bank Phase 2 — AddInformation Experience tab inline stories + quick-add modal (Mon)
2. Daily Action Card UI on Home dashboard (Done / Snooze / Dismiss) — depends on Eli landing the schema + edge function first (Wed)
3. Daily Action calibration loop — dismissed-type backoff (Fri)

### Wk 4 (May 26 – June 1)
1. `match-internship-companies` edge function (Mon)
2. `/Practicum` page UI — profile + kanban (Wed)
3. Career Agent practicum prompt + `SUGGESTED_COMPANY_TARGET_JSON` parsing (Fri)

### Wk 5 (June 2–8)
1. Schema validator skill — reads `role_library` + `skill_library`, emits enums + ID sets as JSON (Mon)
2. Role library research skill — slash command, drafts to `_drafts/` (Wed)
3. Add 30–50 business-student roles using the research skill (Fri) — BD Analyst, Solutions Engineer, RevOps, Customer Marketing, GTM Strategist, etc.

### Wk 6 (June 9–15) — launch week
1. Story Bank → Career Agent passive mention. Story Bank → LinkedIn Optimizer evidence injection (Mon)
2. Visual redesign incremental — token migration on top 5 most-trafficked components (Home, Tracker, AddInformation, Career Agent, Onboarding). Playwright baseline as regression check (Wed)
3. Final UI polish + responsive checks on mobile + faculty briefing materials (Fri)

### Pinned reading before starting any of the above
- `tasks/lessons.md` — read the lessons relevant to your area (LLM prompts for the role library skill, edge-function deploys for `match-internship-companies`)
- The relevant migration if you're touching schema
- The relevant edge function if you're calling it from new UI
- `CLAUDE.md` — branch + PR + commit conventions

---

## How to work with Claude Code

We're using Claude (Opus 4.7 in 1M-context mode) as a pair programmer in two surfaces: **Claude Code** (terminal — direct file edits, command execution, runs lint/build) and **Claude.ai** (browser — research, deep planning, prompt-writing). The patterns below are how we've actually worked in PRs #20–#47.

The repo now also has **production Claude Code hooks** at `.claude/settings.json` (shipped PR #40) that enforce the conventions automatically: every file edit runs Prettier + ESLint, protected paths (migrations, voice-rules, libraries, .env, package-lock) require confirmation, and dangerous bash commands (`rm -rf`, destructive SQL, `git push --force`, `--no-verify`) are blocked outright. Both Eli and Isaac inherit these when they run Claude Code in this repo — no setup needed beyond `jq` (Homebrew).

### The ask-don't-tell pattern

When in doubt, Claude pauses and asks. This is non-negotiable for:
- **Decisions that change scope** — "should I add X?" not "I added X."
- **Decisions that lock in design** — "single-shot vs conversation thread for outreach?" not "I built the conversation thread."
- **Risky / hard-to-reverse actions** — `git push --force`, `git reset --hard`, dropping tables, force-merging, sending public messages. Always confirm first.
- **Anything visible to others** — pushing branches, opening PRs, posting comments. Confirm scope first.

In Eli's auto-memory: "Surface decisions for confirmation; don't lock in unilaterally even when broader scope is approved." Claude mirrors that. If you find Claude diving into a multi-file change without checking, redirect — that's the signal that the prompt was under-scoped.

### Decision checkpoints

For non-trivial work, Claude pauses before building and surfaces numbered decisions:

```
Before I build, two design questions worth confirming:

1. Persistence model. A: ephemeral (no DB rows, regen each time). B: one row per
   conversation. Lean B because of decision 5A (editable bubbles).
2. Goal-edit mid-thread. A: lock once started. B: editable. Lean B per your earlier call.

If both leans are right, I'll proceed.
```

You answer "all confirmed, go" or redirect a specific decision. This pattern keeps Claude from spending 30 minutes building down a path you'd reject in 30 seconds.

Use it any time you're delegating something architectural. **Don't accept "I'll figure it out as I go" from Claude on architectural calls** — that's where most rework comes from.

### The full-CI-before-push rule

Per `tasks/lessons.md` 2026-05-06 entry: `vite build` ≠ ESLint. CI runs `npm run lint && npm run typecheck && npm run build` — three separate gates. Before any push:

```bash
npm run lint && npm run typecheck && npm run build
```

The ~10s extra is cheaper than a failed CI + push-fix cycle. Typecheck is currently `continue-on-error: true` in CI (shadcn Button/Input typedef issues blocking baseline cleanup) — but lint and build are blocking gates.

### Key files to read before starting

When asking Claude to work in an unfamiliar area, point it at the right files:

| Working on | Read first |
|---|---|
| LinkedIn Posts | `docs/research/linkedin-post-performance.md`, `_shared/post-frameworks/`, `_shared/voice-rules.ts` (POST_VOICE_RULES) |
| LinkedIn Comments | `_shared/voice-rules.ts` (COMMENT_VOICE_RULES), the research doc sections 5-6 |
| LinkedIn Outreach | `_shared/outreach-frameworks/`, `_shared/voice-rules.ts` (OUTREACH_VOICE_RULES) |
| CV generation | `_shared/cv-templates/`, the CV polish PR series #23–#29 |
| Tier scoring | `src/lib/scoreApplication.js`, `generate-career-analysis/index.ts`, `tasks/lessons.md` 2026-04-28 entry |
| Edge function deploy | `tasks/lessons.md` 2026-05-05 entry |
| Schema migrations | `supabase/migrations/` — pick a recent one matching your pattern (RLS, indexes, triggers) |

### Commit + PR conventions

From `CLAUDE.md`:
- Conventional commits: `feat(area):`, `fix(area):`, `refactor(area):`, `docs(area):`
- Co-author trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- Branch: `eli/<topic>` or `isaac/<topic>` — never push to main
- PR template: `.github/pull_request_template.md` — fill out What & Why, Test Plan, Notes for the reviewer
- Squash-merge to keep main linear
- Cross-review required for `_shared/libraries/` edits

---

## Tools / skills we use

The full toolkit across both surfaces. Isaac, you have access to all of these.

### Web research (Claude.ai — deep research mode)

Long-running multi-source research. Good for: industry data we don't already know, validating claims before they ground product decisions. Used for the LinkedIn post performance research that became `docs/research/linkedin-post-performance.md` (~50 tool calls, multiple cross-validation passes).

**When to use:** before building a feature whose quality depends on external claims (reply rates, format defaults, recipient-side dynamics). Save the output as a `docs/research/<topic>.md` file in the repo so prompts can ground in it.

**Pattern:** Eli specifies the research scope in Claude.ai → Claude.ai produces a long-form findings doc with cross-validated / single-sourced / contested tagging → Eli pastes the doc into the repo via Claude Code → all related edge function prompts cite the doc as source.

### Web search + web fetch (Claude Code in-session)

For shallow lookups inside an active coding session — API docs, library version checks, "does Postgres support X." Faster than spinning up a Claude.ai research tab.

### Supabase MCP server (Claude.ai)

Direct Postgres queries against the live project. Used for migration verification (`select count(*) from pg_class where relrowsecurity = true`), schema introspection, debugging RLS. When MCP isn't loaded in a session, the fallback is the Supabase Management API + a personal access token stashed at `/tmp/.gaj_supabase_token` — see `tasks/lessons.md` 2026-05-05 entry.

### gh CLI (Claude Code terminal)

GitHub from the terminal — opening PRs, commenting on issues, listing PRs/issues, checking PR CI status. Used for every PR opened in PRs #30–#47.

```bash
gh pr create --title "..." --body "$(cat <<'EOF'
## Summary
...
EOF
)"
gh pr view <num>
gh pr checks <num>
gh issue list
```

### The prompt-writing pattern (Claude.ai → Claude Code)

When Eli wants Claude Code to do something complex, the workflow is:

1. **Eli describes intent in Claude.ai** (broader, more permissive thinking environment)
2. **Claude.ai drafts a Claude Code prompt** — usually framed as a question Claude Code should ask Eli back, with relevant context the prompt should include
3. **Eli reviews + tweaks the draft** in Claude.ai
4. **Eli pastes into Claude Code** — Claude Code now has a self-contained briefing

Why: Claude.ai is better at scoping work; Claude Code is better at executing it. Splitting the job by surface gives a higher-quality prompt than typing freeform into Claude Code. Use it for any architectural call, multi-PR sequence, or "I want to build X but I'm not sure of the right shape."

### The decision-checkpoint pattern (in any session)

Before non-trivial work, Claude surfaces numbered decisions with options + leans (described above under "How to work with Claude Code"). This is the explicit form of ask-don't-tell.

Eli has saved feedback: "Surface decisions for confirmation; don't lock in unilaterally even when broader scope is approved." If you're working with Claude and you notice it diving into multi-file work without checking architectural calls, redirect — the prompt was probably under-scoped.

### Installed Claude Code skills + MCPs

Installed in user scope on Eli's setup, available across all projects. Isaac should mirror these.

| Plugin | Source | What it gives you |
|---|---|---|
| **superpowers** | `obra/superpowers-marketplace` | Multi-agent dev workflow — TDD, code review, subagent execution, planning, brainstorming, verification-before-completion. The most-used pack |
| **document-skills** (Anthropic) | `anthropics/skills` (alias `anthropic-agent-skills`) | docx / pdf / pptx / xlsx authoring, frontend-design, webapp-testing, skill-creator, claude-api, theme-factory, brand-guidelines |
| **example-skills** (Anthropic) | `anthropics/skills` | Same surface as document-skills but with the example pack |
| **ui-ux-pro-max** | `nextlevelbuilder/ui-ux-pro-max-skill` | 50+ UI styles, 161 color palettes, 57 font pairings, 99 UX guidelines, 161 product types, 25 chart types across 10 stacks |
| **marketing-skills** (Corey Haines) | `coreyhaines31/marketingskills` | 32 marketing skills: copywriting, page-cro, email-sequence, seo-audit, ad-creative, churn-prevention, etc. Critical for the landing page |
| **Context7 MCP** | `https://mcp.context7.com/mcp` (HTTP transport) | Fetches latest docs for React / Tailwind / shadcn / Supabase / Deno / Langfuse — reduces hallucinated APIs |

See `docs/strategy/installation-checklist.md` for the full installation roadmap (THIS WEEK / PRE-LAUNCH / POST-LAUNCH).

### Other tools worth knowing

- **Claude Code's TaskCreate / TaskList** — internal task tracking within a session. Don't rely on it for cross-session memory; use ROADMAP.md for that.
- **Slash commands / skills** — `/loop` (recurring work), `/clear` (reset session), and any project-specific skills we add. Wk 5 ships a role-library research skill (Isaac).
- **Worktrees** — `Agent` tool with `isolation: "worktree"` runs an agent on an isolated copy of the repo. Useful for exploratory refactors that might not land. Not used much yet.

---

## Keeping this file alive

**Every PR updates this file.** Adding a new edge function? Add a row to the table. Shipping a feature? Update Sprint Status. Refactor changes a key file path? Update Key Files. New convention? Add a section or update CLAUDE.md and add the cross-reference here.

The PR template (`.github/pull_request_template.md`) has a checkbox for this — added in PR #36. If you read this file and something feels stale, that's the signal — fix it in your next PR.

When the file gets too long (current target: <800 lines), split. The split rule: anything that has its own evolution rhythm (lessons, research, sprint plan) lives in its own file and is cross-referenced from here.
