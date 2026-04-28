// Background scoring of applications via analyze-job-match.
//
// Fire-and-forget pattern — the caller does NOT await this function.
// The flow is: user adds an application, it appears in Tracker
// immediately with no AI Confidence and no tier shown, and ~3-8s later
// both fill in once analyze-job-match returns. Tier is derived from
// the same qualification_score (thresholds match FIT_ONLY_THRESHOLDS in
// generate-career-analysis), so users never see a tier guess shift.
//
// Wired into every code path that inserts an application (JobSuggestions,
// Tracker manual add, chat agent's Path B handler) plus the JD-save
// handler on ApplicationRow (so updating a JD re-scores). JobMatchChecker
// already computes the score synchronously before insert and derives the
// tier inline from match_score using the same thresholds.

export function tierFromScore(score) {
  if (score >= 0.55) return "tier_1";
  if (score >= 0.40) return "tier_2";
  return "tier_3";
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
    const score = Math.max(0, Math.min(1, Number(data.match_score) / 100));
    if (!Number.isFinite(score)) return;
    const { error: updateError } = await supabase
      .from("applications")
      .update({ qualification_score: score, tier: tierFromScore(score) })
      .eq("id", applicationId);
    if (updateError) throw updateError;
    queryClient?.invalidateQueries({ queryKey: ["applications"] });
  } catch (err) {
    console.warn("[scoreApplication] background scoring failed:", err?.message || err);
  }
}
