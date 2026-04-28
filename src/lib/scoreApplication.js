// Background scoring of applications via analyze-job-match.
//
// Fire-and-forget pattern — the caller does NOT await this function.
// The flow is: user adds an application, it appears in Tracker
// immediately with no AI Confidence and no tier shown, and ~3-8s later
// both fill in once analyze-job-match returns.
//
// Tier comes from BOTH match_score (JD fit) and goal_alignment_score
// (does this role advance the 5-year target?), mirroring the goal-aware
// formula in generate-career-analysis. Without alignment, a high-fit
// off-path role like an SDR for a Product Manager target wrongly landed
// in tier_1. When the user has no 5-year goal set, analyze-job-match
// omits goal_alignment_score and we fall back to fit-only thresholds.
//
// Wired into every code path that inserts an application (JobSuggestions,
// Tracker manual add, chat agent's Path B handler) plus the JD-save
// handler on ApplicationRow (so updating a JD re-scores). JobMatchChecker
// computes synchronously and uses the same tierFromScores helper.

// Fit-only fallback — used when the user has no 5-year goal so the LLM
// can't return alignment. Thresholds match FIT_ONLY_THRESHOLDS in
// generate-career-analysis (0.55/0.40/0.25). Exported as the inline
// helper for JobMatchChecker too, in case alignment is missing.
export function tierFromScore(score) {
  if (score >= 0.55) return "tier_1";
  if (score >= 0.40) return "tier_2";
  if (score >= 0.25) return "tier_3";
  return "tier_3";
}

// Seniority ceiling per career stage — mirrors T1_SENIORITY_CEILING in
// generate-career-analysis but stricter for early_career, because the
// LLM-based fit score doesn't apply seniorityGapPenalty (it gives full
// credit on topical skill overlap regardless of experience gap). For an
// early-career student a 4-years-required Mid role still scored 0.70+
// match and landed in tier_1 — wrong, since they can't be hired NOW.
// Stricter ceiling pushes those to tier_3 (Work Toward).
const STAGE_T1_CEILING = {
  early: 1,   // Entry + Entry_Mid only — Mid+ is "Work Toward" for a student
  mid: 3,     // up to Mid_Senior
  senior: 6,  // unbounded
};

const SENIORITY_RANK = {
  Entry: 0,
  Entry_Mid: 1,
  Mid: 2,
  Mid_Senior: 3,
  Senior: 3,
  Lead: 4,
  Manager: 4,
  Principal: 4,
  Staff: 4,
  Director: 5,
  VP: 6,
};

// Goal-aware tier derivation. Combines three signals from analyze-job-match:
//   fit             — JD skill/topic match (0-1)
//   alignment       — how this role advances the 5-year goal (0-1, may be null)
//   roleSeniority   — JD's required experience level (string, may be null)
//   userStage       — user's career stage: "early" | "mid" | "senior"
//
// Layered logic:
//   1. Seniority cap: if the role is above the user's stage ceiling, force
//      tier_3 (Work Toward) regardless of fit/alignment. A student can't be
//      hired into a Senior role today.
//   2. Goal-aware bands (when alignment is provided):
//        T1: strong fit + strong alignment  OR  adequate fit + very strong alignment
//        T2: viable fit but off-path
//        T3: aspirational — some skill foundation + on-path
//   3. Fallback to tierFromScore when alignment is null (no goal set).
//
// Thresholds are stricter than generate-career-analysis (0.70 vs 0.60 for
// T1 alignment) because LLM-derived alignment is noisier than the
// deterministic skill_transfer matrix and gpt-4o-mini tends to pick
// middle-of-rubric scores. See the SDR-for-PM bug for the calibration story.
export function tierFromScores(fit, alignment, options = {}) {
  const { userStage, roleSeniority } = options;
  const roleRank = roleSeniority != null ? (SENIORITY_RANK[roleSeniority] ?? null) : null;
  const ceiling = userStage && STAGE_T1_CEILING[userStage] != null
    ? STAGE_T1_CEILING[userStage]
    : Infinity;
  const canHireNow = roleRank == null || roleRank <= ceiling;
  const hasAlignment = alignment != null && Number.isFinite(alignment);

  // Above seniority ceiling — capped at tier_3 (Work Toward). Even a strong-fit
  // Senior role for a student is aspirational, not viable today.
  if (!canHireNow) return "tier_3";

  if (!hasAlignment) return tierFromScore(fit);

  if (fit >= 0.50 && alignment >= 0.70) return "tier_1";
  if (fit >= 0.40 && alignment >= 0.80) return "tier_1";
  if (fit >= 0.50) return "tier_2";
  if (fit >= 0.20 && alignment >= 0.60) return "tier_3";
  return tierFromScore(fit);
}

export async function scoreApplication(supabase, queryClient, applicationId, jobDescription) {
  if (!applicationId || !jobDescription || typeof jobDescription !== "string" || !jobDescription.trim()) {
    return;
  }
  try {
    const { data, error } = await supabase.functions.invoke("analyze-job-match", {
      body: { job_description: jobDescription, mode: "text" },
    });
    if (error) throw error;
    if (data?.match_score == null) return;
    const fit = Math.max(0, Math.min(1, Number(data.match_score) / 100));
    if (!Number.isFinite(fit)) return;
    const alignmentRaw = data?.goal_alignment_score;
    const alignment = alignmentRaw == null
      ? null
      : Math.max(0, Math.min(1, Number(alignmentRaw) / 100));
    const roleSeniority = data?.required_seniority || null;
    const userStage = data?.user_stage || null;
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        qualification_score: fit,
        goal_alignment_score: alignment,
        required_seniority: roleSeniority,
        tier: tierFromScores(fit, alignment, { userStage, roleSeniority }),
      })
      .eq("id", applicationId);
    if (updateError) throw updateError;
    queryClient?.invalidateQueries({ queryKey: ["applications"] });
  } catch (err) {
    console.warn("[scoreApplication] background scoring failed:", err?.message || err);
  }
}
