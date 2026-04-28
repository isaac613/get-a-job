#!/usr/bin/env bash
# One-shot bootstrap for the GitHub Issues + Project tracking system.
# Prerequisites:
#   1. brew install gh
#   2. gh auth login   (pick: GitHub.com → HTTPS → authenticate via web browser)
#
# Then from repo root: bash scripts/setup-github-tracking.sh
#
# What it does:
#   - Creates the label taxonomy (priority, type, area, status)
#   - Creates ~16 seed issues from ROADMAP.md Wk 1-3
#   - Prints follow-up steps for the Project board (manual UI clicks)

set -euo pipefail

REPO="isaac613/get-a-job"

echo "═══ Sanity checks ═══"
gh auth status >/dev/null 2>&1 || { echo "ERROR: not authenticated. Run: gh auth login"; exit 1; }
gh repo view "$REPO" >/dev/null 2>&1 || { echo "ERROR: can't access repo $REPO"; exit 1; }
echo "✓ authed against $REPO"
echo

echo "═══ Creating labels ═══"
# Priority
gh label create "p0" --repo "$REPO" --color "B60205" --description "Pilot blocker — fix before Aug 2026" --force
gh label create "p1" --repo "$REPO" --color "D93F0B" --description "High priority — should ship pre-pilot" --force
gh label create "p2" --repo "$REPO" --color "FBCA04" --description "Medium priority — can ship during pilot" --force
gh label create "p3" --repo "$REPO" --color "C5DEF5" --description "Nice to have — post-pilot or never" --force

# Type
gh label create "type:bug" --repo "$REPO" --color "EE0701" --description "Something is broken" --force
gh label create "type:feat" --repo "$REPO" --color "1D76DB" --description "New functionality" --force
gh label create "type:chore" --repo "$REPO" --color "C2E0C6" --description "Maintenance / refactor / infra" --force
gh label create "type:spike" --repo "$REPO" --color "5319E7" --description "Research / decision-making" --force
gh label create "type:docs" --repo "$REPO" --color "0E8A16" --description "Documentation" --force

# Area (where in the codebase)
gh label create "area:tracker" --repo "$REPO" --color "BFE5BF" --description "Application Tracker" --force
gh label create "area:cv" --repo "$REPO" --color "BFE5BF" --description "CV generation / agent" --force
gh label create "area:scoring" --repo "$REPO" --color "BFE5BF" --description "Tier / fit scoring logic" --force
gh label create "area:agents" --repo "$REPO" --color "BFE5BF" --description "Chat agents (Career, Interview, CV)" --force
gh label create "area:onboarding" --repo "$REPO" --color "BFE5BF" --description "Onboarding flow" --force
gh label create "area:roadmap" --repo "$REPO" --color "BFE5BF" --description "Career Roadmap page + role library" --force
gh label create "area:internship-picker" --repo "$REPO" --color "BFE5BF" --description "New: Internship Company Picker" --force
gh label create "area:cohort-dashboard" --repo "$REPO" --color "BFE5BF" --description "Instructor cohort view" --force
gh label create "area:infra" --repo "$REPO" --color "BFE5BF" --description "CI / deploy / observability / tooling" --force

# Status (for issues without an assignee yet)
gh label create "blocked" --repo "$REPO" --color "B60205" --description "Waiting on something else" --force
gh label create "needs-spec" --repo "$REPO" --color "FBCA04" --description "Acceptance criteria not yet clear" --force
gh label create "ready-for-pickup" --repo "$REPO" --color "0E8A16" --description "Spec is clear, anyone can grab" --force
gh label create "good-first-grab" --repo "$REPO" --color "7057FF" --description "Small + isolated — good way to start a session" --force

# Special
gh label create "pilot-blocker" --repo "$REPO" --color "B60205" --description "Must ship before Aug 2026" --force
gh label create "needs-cross-review" --repo "$REPO" --color "D93F0B" --description "Touches domain libraries — both devs review" --force

echo "✓ labels done"
echo

echo "═══ Creating seed issues ═══"

# ─── Wk 1: Stabilization ─────────────────────────────────────────────────
gh issue create --repo "$REPO" --title "P0: scoreApplication failure visibility + queryKey fix" --label "p0,type:bug,area:scoring,pilot-blocker,ready-for-pickup,good-first-grab" --body "**File:** \`src/lib/scoreApplication.js\`

**Two compounding bugs:**
1. Line 36 invalidates \`[\"applications\"]\`, but pages use \`[\"applications\", user.id]\` — invalidation never fires
2. Catch handler is \`console.warn\` only — silent failures leave rows in \"Calculating tier…\" forever

**Fix:**
- Pass user_id to scoreApplication, fix queryKey
- Add \`tier_scoring_failed_at\` timestamp column on applications
- Surface 'Retry' button in ApplicationRow when set

**Acceptance:** transient OpenAI error → row shows 'Retry' button after timeout, not infinite spinner."

gh issue create --repo "$REPO" --title "P0: JSON truncation detection in analyze-job-match, ai-chat, generate-tasks" --label "p0,type:bug,area:scoring,area:agents,pilot-blocker,ready-for-pickup" --body "**Files:** \`supabase/functions/analyze-job-match/index.ts\`, \`ai-chat/index.ts\`, \`generate-tasks/index.ts\`

**Risk:** all three use \`response_format: json_object\` then \`JSON.parse()\` without checking \`finish_reason\`. With longer JDs at 100 students, max_tokens=1024 in analyze-job-match will truncate → silent JSON parse failure → 500.

**Fix:** detect \`finish_reason === \"length\"\`, retry once with higher max_tokens, log if persistent. Bump analyze-job-match to 2048."

gh issue create --repo "$REPO" --title "P0: AddInformation only edits ~10 of 30+ profile columns (#35)" --label "p0,type:bug,area:onboarding,pilot-blocker,ready-for-pickup" --body "**File:** \`src/pages/AddInformation.jsx\`

Currently students can't edit \`five_year_role\`, \`primary_domain\`, \`qualification_level\`, \`target_industries\`, \`employment_status\` post-onboarding. Half the platform value is iteration — students will hit this on day 2.

**Acceptance:** every column the onboarding flow writes is editable from AddInformation."

gh issue create --repo "$REPO" --title "P1: AbortSignal on ai-chat, analyze-job-match, lookup-role-skills" --label "p1,type:chore,area:infra,ready-for-pickup,good-first-grab" --body "Three edge functions don't have \`AbortSignal.timeout(...)\` — a hung OpenAI call ties up the function for ~10 min default.

**Fix:** add \`signal: AbortSignal.timeout(45000)\` to the OpenAI fetch in all three. Mirror the pattern from the 6 functions that already have it."

gh issue create --repo "$REPO" --title "P1: Tests for src/lib/scoreApplication.js" --label "p1,type:chore,area:scoring,ready-for-pickup,good-first-grab" --body "Most-iterated logic of the project has zero coverage. The 8 sanity cases that ran in node during the SDR-tier debugging session aren't checked in.

**Fix:** \`src/test/scoreApplication.test.js\` covering:
- tierFromScore boundaries (0.55, 0.40, 0.25)
- tierFromScores with/without alignment
- Seniority ceiling enforcement (early/mid/senior × Entry through Lead)
- null/NaN safety"

gh issue create --repo "$REPO" --title "Quick win: remove 2000-char JD truncation in generate-job-suggestions" --label "p1,type:chore,area:scoring,ready-for-pickup,good-first-grab" --body "**File:** \`supabase/functions/generate-job-suggestions/index.ts:735\`

JSearch returns full JDs but we \`slice(0, 2000)\`. Free win — full JDs improve downstream tier scoring."

gh issue create --repo "$REPO" --title "Quick win: lazy-load PDF.js + jsPDF" --label "p1,type:chore,area:infra,ready-for-pickup" --body "Main bundle is 1.9 MB. PDF.js + jsPDF eager-loaded but only used in StepResumeUpload + MessageBubble (CV download).

**Fix:** \`React.lazy()\` both. Drops first-paint by 1-2s on Israeli 4G."

gh issue create --repo "$REPO" --title "Domain purchase + DNS setup for inbox subdomain (Wk 1)" --label "p0,type:chore,area:infra,pilot-blocker,ready-for-pickup" --body "Pilot needs a domain anyway. Email parser (Wk 11) needs \`inbox.<domain>\` MX records pointing at Mailgun — DNS propagation can take 24h, do this Wk 1.

**Steps:**
1. Decide domain (proposed: getajob.app or careeros.io)
2. Buy via Cloudflare Registrar or Porkbun
3. Set up Mailgun account, get sandbox MX
4. Add MX record on inbox subdomain
5. Verify with \`dig MX inbox.<domain>\`"

# ─── Wk 2: Foundation ───────────────────────────────────────────────────
gh issue create --repo "$REPO" --title "Build schema-validator skill" --label "p1,type:feat,area:infra,ready-for-pickup" --body "Reads \`00_role_library.ts\` + \`01_skill_library.ts\`, emits enums + ID sets + shape as JSON. Precondition for the role-library-researcher skill.

**Acceptance:**
- Lives at \`.claude/skills/schema-validator/SKILL.md\`
- Run yields a \`_validator_output.json\` with all enum values, ID sets per file, and detected shape
- Catches existing inconsistencies in the libraries (ghost skill IDs, role IDs referencing other non-existent role IDs in \`next_roles\`)"

gh issue create --repo "$REPO" --title "Library deduplication — move shared/libraries to canonical location" --label "p1,type:chore,area:infra,needs-cross-review" --body "5 edge functions each ship a 2 MB copy of \`00_role_library.ts\` + \`01_skill_library.ts\` (~10 MB total dup). Edit one, others diverge silently.

**Fix:** move to \`supabase/functions/_shared/libraries/\`, import via relative paths from each function. Per-function deploys still work; cold starts get faster.

**Cross-review required (touches all 5 functions)**."

gh issue create --repo "$REPO" --title "function_metrics observability table + emit from edge functions" --label "p1,type:feat,area:infra,pilot-blocker,ready-for-pickup" --body "Without per-function metrics, debugging at 100 users is by-anecdote.

**Schema:** \`function_metrics(id, user_id, function_name, latency_ms, ok, error_code, model_used, tokens_in, tokens_out, created_at)\`

**Emit:** every edge function logs one row per call. Use trigger or \`afterResponse\` in handler.

**Builds toward:** cohort dashboard, error rate alerts, per-user cost tracking."

gh issue create --repo "$REPO" --title "Pending #30: Education fields lost (N-O39→O44)" --label "p1,type:bug,area:onboarding,ready-for-pickup" --body "Onboarding collects fields O39-O44 but downstream code never reads them. Wastes the most painful onboarding step.

Investigate which fields, where they're lost, and either drop them from onboarding or wire them through."

gh issue create --repo "$REPO" --title "Pending #31: Tasks have no due_date — calendar broken (N-K2/K6)" --label "p1,type:bug,area:agents,ready-for-pickup" --body "Tasks generated by \`generate-tasks\` don't include due_date → never surface on Calendar. Calendar feature looks broken to anyone using it."

gh issue create --repo "$REPO" --title "Pending #33: extract-proof-signals embeds full libraries (N-X3)" --label "p1,type:chore,area:infra,ready-for-pickup" --body "System prompt embeds entire signal + skill libraries (~100 KB) on every onboarding call. Bloats every cold start.

**Fix:** load only relevant signals per user (filter by primary_domain or stated skills before embedding)."

# ─── Wk 3-4: Internship Company Picker ──────────────────────────────────
gh issue create --repo "$REPO" --title "spike: Curate IL company database (~100 anchor companies)" --label "p0,type:spike,area:internship-picker,pilot-blocker,ready-for-pickup" --body "**Question:** what 100 Israeli scale-ups should seed the Internship Company Picker?

**Time-box:** 8 hours.

**Criteria:**
- Active hiring (job postings within last 90 days)
- Israeli HQ or significant Tel Aviv office
- Stage: Series A through pre-IPO (skip seed-stage and public mega-corps)
- Sectors: fintech, cybersec, AI, devtools, B2B SaaS, consumer (mix)
- Has functions students target: Product, Sales, CS, Marketing, Ops, BD

**Output:** CSV/JSON with columns: name, website, careers_page, sector, stage, employees_estimate, hq_city, hiring_functions, notable_for, internship_program (yes/no/case-by-case).

**Sources to check:** Startup Nation Central, Calcalist 50 most promising, Reichman alumni employer list (ask faculty), Built In Israel."

gh issue create --repo "$REPO" --title "Internship Company Picker — full feature epic" --label "p0,type:feat,area:internship-picker,pilot-blocker,needs-spec" --body "**The new pilot blocker.** Students propose 3-5 companies for their practicum based on career roadmap.

**Sub-issues to create after the curation spike returns:**
- [ ] \`company_targets\` table + RLS migration
- [ ] \`/InternshipExplorer\` page (uses reui Data Grid)
- [ ] Company × student profile match logic (LLM with structured output)
- [ ] Proposal flow: student writes reasoning, professor reviews
- [ ] Outreach prep helper (per company, given student profile)

**Depends on:** the curation spike, the cohort dashboard scaffolding (so professors can review proposals)."

# ─── Standalone ─────────────────────────────────────────────────────────
gh issue create --repo "$REPO" --title "Install official Claude Code skill set" --label "p2,type:chore,area:infra,ready-for-pickup,good-first-grab" --body "Per skills audit, install the maintained official ones:

\`\`\`
claude plugin install supabase@supabase-agent-skills
claude plugin install postgres-best-practices@supabase-agent-skills
claude plugins add vercel@claude-plugins-official
/plugin install playwright-skill@playwright-skill
/plugin install code-review  # from anthropics/claude-plugins-official
\`\`\`

Skip the community 'awesome-skills' mega-repos."

echo "✓ ~16 seed issues created"
echo
echo "═══ NEXT STEPS (manual UI — Project board can't be fully scripted) ═══"
echo
echo "1. Open https://github.com/users/isaac613/projects (or org-level if applicable)"
echo "2. New project → Board template → name 'Get A Job — Pilot Sprint'"
echo "3. Add custom fields:"
echo "   - Sprint Week (single-select: Wk 1, Wk 2, ... Wk 13, Backlog, Post-pilot)"
echo "   - Priority (single-select: P0/P1/P2/P3)"
echo "   - Effort (single-select: XS/S/M/L)"
echo "4. Set up workflow automations:"
echo "   - When item added → set Status = Up Next"
echo "   - When linked PR opened → set Status = In Progress"
echo "   - When linked PR merged or issue closed → set Status = Done"
echo "5. Auto-add: any new issue from this repo"
echo "6. Bulk-assign Sprint Week values to the 16 seed issues based on labels"
echo "7. Branch protection on \`main\`: Settings → Branches → require PR + CI pass"
echo
echo "Done. Project board is the source of truth for daily ops; ROADMAP.md stays as the high-level vision."
