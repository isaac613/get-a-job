// Returns true when the user has added experiences/certifications/projects
// after the last career analysis run. Drives the "Refresh recommended"
// banner on Career Roadmap (and hint text on Home / Job Suggestions) so
// users know their cached career_roles rows no longer reflect their data.
//
// Exact timestamp comparison: profile.last_reality_check_date is timestamptz
// (migration 20260426). The frontend writes new Date().toISOString() on each
// successful analysis, so refreshing immediately clears the banner — no
// false-positive from same-day pre-existing rows being "newer than midnight".
export function isAnalysisStale({ profile, experiences, certifications, projects }) {
  if (!profile?.last_reality_check_date) return false;
  const lastCheckMs = new Date(profile.last_reality_check_date).getTime();
  if (!Number.isFinite(lastCheckMs)) return false;
  const rows = [
    ...(experiences || []),
    ...(certifications || []),
    ...(projects || []),
  ];
  return rows.some((r) => {
    if (!r?.created_at) return false;
    const t = new Date(r.created_at).getTime();
    return Number.isFinite(t) && t > lastCheckMs;
  });
}
