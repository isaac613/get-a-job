# Get A Job — Roadmap

Living document. Both Eli and Isaac update as work moves. Anchor for what's shipped, what's in flight, what's next.

**Pilot launch: Aug 2026 (Reichman, ~100 business students)**

---

## Done (recent)

- **2026-04-28 — JD-based tier auto-assignment, goal-aware scoring, seniority cap.** Replaces title-based tier guesses; tier now derived from `analyze-job-match` returning `match_score` + `goal_alignment_score` + `required_seniority`. `tierFromScores` (`src/lib/scoreApplication.js`) applies thresholds + a hard tier_3 cap when role exceeds user stage.
- **2026-04-28 — Demo for Reichman professor + Dr. Miller. Pilot confirmed Aug–Nov 2026.** Zero bugs in demo. Both faculty personally vouching.
- **2026-04-28 — Team workflow infrastructure** (this commit): ROADMAP.md, PR template, CI workflow, CLAUDE.md handoff rules.
- **Earlier April 2026:** CV Tier 1 prompt improvements, learning-paths URL validation, ai-chat retry layer, onboarding handleFinalise clobber fix, Career Agent dropdown, demo account reset RPC.

## In Progress

_(Nothing currently. Both devs free for sprint planning.)_

---

## Up Next — Sprint plan toward Aug 2026 pilot

Ordered by dependency + priority. Owner column = whoever picks it up; reassign as needed.

### Wk 1 — Stabilization (fix what's silently broken)
| Item | Owner | Notes |
|---|---|---|
| P0: `scoreApplication` failure visibility — fix queryKey + add retry UI | — | `src/lib/scoreApplication.js`. Stuck "Calculating tier…" rows are pilot-blocker |
| P0: JSON truncation detection in `analyze-job-match`, `ai-chat`, `generate-tasks` | — | Detect `finish_reason === "length"`, retry at higher max_tokens |
| P0: AddInformation column coverage (#35) | — | Currently edits ~10 of 30+ profile columns; students can't edit `five_year_role`/`primary_domain` post-onboarding |
| P1: `AbortSignal` on `ai-chat`, `analyze-job-match`, `lookup-role-skills` | — | 3 functions can hang forever |
| P1: Tests for `src/lib/scoreApplication.js` | — | Zero coverage on most-iterated logic of the project |
| Quick win: remove 2000-char JD truncation in `generate-job-suggestions` | — | Free fix |
| Quick win: lazy-load PDF.js + jsPDF | — | Drops main bundle ~50–100KB |
| Domain purchase + DNS setup | — | Needed early — 1 week DNS propagation buffer |

### Wk 2 — Foundation for skills + observability
| Item | Owner | Notes |
|---|---|---|
| `schema-validator` skill — reads role_library + skill_library, emits enums + ID sets | — | Precondition for role-research skill |
| Library deduplication: move `_shared/libraries/` to one canonical location | — | ~10 MB dup across 5 functions; divergence risk |
| `function_metrics` table + emit from every edge function | — | Without this, debugging at 100 users is by-anecdote |
| Pending tasks: #30 (education fields), #31 (tasks due_date), #33 (extract-proof-signals library bloat) | — | Leftover from pre-demo audit |

### Wk 3–4 — Internship Company Picker (NEW pilot blocker)
| Item | Owner | Notes |
|---|---|---|
| Curate IL company DB (~100 anchor companies) | — | Manual; weight scale-ups + Israeli tech (per user feedback) |
| `company_targets` table + RLS | — | Mirror `applications` pattern |
| `/InternshipExplorer` page with reui Data Grid | — | Cards + filters: stage, sector, role |
| Match logic: company × student profile → fit + reasoning | — | Reuses `analyze-job-match` patterns |
| Practicum proposal flow (student submits, professor reviews) | — | Requires cohort dashboard scaffolding |

### Wk 5–6 — Role library expansion + cohort dashboard
| Item | Owner | Notes |
|---|---|---|
| `role-library-researcher` skill — slash command, validator-aware, drafts to `_drafts/` | — | Depends on schema-validator |
| Add 30–50 business-student-relevant roles | — | BD Analyst, Solutions Engineer, RevOps, Customer Marketing, GTM Strategist, etc. |
| Cohort dashboard v0 for instructors | — | Depends on `function_metrics` |
| `status_changes` audit table + trigger | — | Precondition for cohort velocity metric |
| `cohort` field on profiles | — | "reichman_2026_fall" |

### Wk 7–8 — Pre-pilot polish
| Item | Owner | Notes |
|---|---|---|
| Firecrawl JD backfill in `handleAddToTracker` | — | $19/mo Hobby tier; fixes empty-JD problem |
| WhatsApp notifications via Twilio | — | Israeli students live on WhatsApp; ~$20/mo |
| Daily action card on Home dashboard | — | Single focused action; cuts paralysis |
| reui Data Grid → Tracker | — | Sort/filter applications by tier/score/status |
| `edge-function-deployer` skill | — | Bundles deploy + verify-active + smoke test |

### Wk 9–10 — Reichman-specific value
| Item | Owner | Notes |
|---|---|---|
| Reichman alumni connection database | — | Faculty-curated; needs early input from professor + Dr. Miller |
| Story Bank | — | STAR stories reusable across CV gen + interview prep |
| `session-handoff` skill — auto-update ROADMAP.md from branch state | — | Helps team handoff between Eli + Isaac |

> **Cohort velocity** parked to **mid-pilot** (Sep–Oct 2026). Need real user data first before comparison metrics are meaningful — derived from `applications.status` history, requires `status_changes` audit table when we get there.

### Wk 11–12 — Last mile
| Item | Owner | Notes |
|---|---|---|
| Practice interview agent v1 (text only) | — | Voice via OpenAI Realtime is post-pilot |
| Email parser inbox (Mailgun + edge function classifier) | — | DNS done in Wk 1 should be ready by now |
| Application outcome learning loop | — | Capture status transitions; surface what works |

### Wk 13 — Pilot prep
| Item | Owner | Notes |
|---|---|---|
| Production deploy on the new domain | — | After domain DNS settled |
| Final bug audit | — | Re-run backend + frontend audits |
| Student onboarding documentation | — | What to do, in what order, with FAQ |
| Faculty briefing materials | — | Cohort dashboard walk-through, escalation paths |

---

## Backlog (post-pilot or stretch)

- N5 reverse-job-spec / North-star JD generator
- Voice mode for Practice Interview (OpenAI Realtime API)
- Hebrew/RTL support
- Salary negotiation coach
- Mobile-first responsive pass
- ESLint rule: any error in user-initiated async must toast or render, not console-only
- Cohort velocity metric (parked to mid-pilot — needs real data)
- Email parser inbox (decision pending — see risk review issue)

---

## How to use this file

- When you start work, move an item to **In Progress** with your name.
- When you ship, move to **Done** with the date and a one-line summary.
- New ideas go in the relevant week or **Backlog** with a one-line scope.
- This file is the source of truth for "what are we doing." If it's not here, it's not happening.
