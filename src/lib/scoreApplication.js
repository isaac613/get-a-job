// Background scoring of applications via analyze-job-match.
//
// Fire-and-forget pattern — the caller does NOT await this function.
// The flow is: user adds an application, it appears in Tracker
// immediately with no AI Confidence shown, and ~3-8s later the score
// fills in once analyze-job-match returns.
//
// Wired into every code path that inserts an application (JobSuggestions,
// Tracker manual add, chat agent's Path B handler) plus the JD-save
// handler on ApplicationRow (so updating a JD re-scores). JobMatchChecker
// already computes the score synchronously before insert and is unchanged.
//
// Failure semantics: scoring failures are silent (console.warn only).
// The application stays inserted; qualification_score stays NULL; the
// UI hides AI Confidence (via the line 276 conditional fix). Worst-case
// outcome of a scoring failure is "no AI Confidence shown for this row",
// not a broken UI state.

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
      .update({ qualification_score: score })
      .eq("id", applicationId);
    if (updateError) throw updateError;
    queryClient?.invalidateQueries({ queryKey: ["applications"] });
  } catch (err) {
    console.warn("[scoreApplication] background scoring failed:", err?.message || err);
  }
}
