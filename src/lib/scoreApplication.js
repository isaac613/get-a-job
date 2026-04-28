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

// Goal-aware tier derivation. Mirrors assignTierWithGoal in
// generate-career-analysis but with stricter alignment thresholds — the
// scores here come from an LLM rating a free-text JD (noisy), not from
// the deterministic skill_transfer matrix in generate-career-analysis
// (precise). gpt-4o-mini tends to pick middle-band scores even when the
// rubric explicitly assigns the case to a low band; we observed an SDR
// for a Product Manager target getting alignment=60 (right at the
// previous tier_1 boundary) when the rubric said 0-19. Bumping by 10
// points across both branches absorbs that bias without breaking
// genuinely-aligned roles which routinely score 75-90.
//
// Inputs are 0-1.
//   T1: strong fit + strong alignment, OR adequate fit + very strong alignment
//   T2: viable fit but off-path
//   T3: aspirational — some skill foundation + on-path
// Falls back to tierFromScore when alignment is null/undefined (no goal set).
export function tierFromScores(fit, alignment) {
  if (alignment == null || !Number.isFinite(alignment)) return tierFromScore(fit);
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
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        qualification_score: fit,
        goal_alignment_score: alignment,
        tier: tierFromScores(fit, alignment),
      })
      .eq("id", applicationId);
    if (updateError) throw updateError;
    queryClient?.invalidateQueries({ queryKey: ["applications"] });
  } catch (err) {
    console.warn("[scoreApplication] background scoring failed:", err?.message || err);
  }
}
