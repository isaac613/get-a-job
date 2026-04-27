// Validation helpers for the chat agent's "Apply Changes" handlers
// (handleApplyRoadmapChanges, handleApplyApplicationActions in
// ChatInterface.jsx). The chat agent emits suggested actions; we
// validate AI-emitted values against allowed lists and against the
// user's actual profile data before writing to the DB.

export const VALID_TIERS = ["tier_1", "tier_2", "tier_3"];

// Mirrors the chk_applications_status DB CHECK constraint.
export const VALID_STATUSES = [
  "interested", "preparing", "applied", "interviewing",
  "offer", "accepted", "rejected",
];

// Matches the canonical examples in the ai-chat ROADMAP_CHANGES_RULES
// prompt (functions/ai-chat/index.ts line ~137). Keep this list in sync
// with that prompt — agent values that aren't in this list get dropped
// silently.
export const VALID_INTERVIEW_STAGES = [
  "phone_screen", "technical", "onsite", "final_round", "reference_check",
];

export const validTier = (t) => (VALID_TIERS.includes(t) ? t : null);
export const validStatus = (s) => (VALID_STATUSES.includes(s) ? s : null);
export const validInterviewStage = (s) =>
  (VALID_INTERVIEW_STAGES.includes(s) ? s : null);

// Normalise to alphanumeric-lowercase for skill comparisons. Bridges
// the casing/punctuation differences between AI-proposed strings and
// the user's actual profile.skills entries.
const skillKey = (s) =>
  String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// Filters AI-proposed matched_skills against the user's profile.skills.
// Returns an array of the user's actual skill strings (preserving their
// original casing) for each proposed skill that has a normalised match.
// Drops anything that doesn't correspond to a real user skill — this is
// the anti-fabrication guard.
export function validateMatchedSkills(proposed, userSkills) {
  if (!Array.isArray(proposed) || !Array.isArray(userSkills)) return [];
  const userSkillByKey = new Map();
  for (const s of userSkills) {
    if (typeof s !== "string") continue;
    userSkillByKey.set(skillKey(s), s);
  }
  const out = [];
  const seen = new Set();
  for (const p of proposed) {
    if (typeof p !== "string") continue;
    const key = skillKey(p);
    if (!key || seen.has(key)) continue;
    const userSkill = userSkillByKey.get(key);
    if (userSkill) {
      out.push(userSkill);
      seen.add(key);
    }
  }
  return out;
}

// Sanitises AI-proposed missing_skills. These are aspirational —
// skills the user doesn't have — so we don't validate against
// profile.skills. Just enforce shape: trim, dedupe, cap length.
export function sanitizeMissingSkills(proposed) {
  if (!Array.isArray(proposed)) return [];
  const out = [];
  const seen = new Set();
  for (const p of proposed) {
    if (typeof p !== "string") continue;
    const trimmed = p.trim();
    if (!trimmed) continue;
    const key = skillKey(trimmed);
    if (seen.has(key)) continue;
    out.push(trimmed);
    seen.add(key);
  }
  return out.slice(0, 20);
}
