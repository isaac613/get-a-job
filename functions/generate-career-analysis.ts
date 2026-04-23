import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- Load JSON Libraries ---
import roleLibrary from "../data/00_role_library.json" assert { type: "json" };
import skillLibrary from "../data/01_skill_library.json" assert { type: "json" };
import proofSignalLibrary from "../data/02_proof_signal_library.json" assert { type: "json" };
import roleSkillMapping from "../data/04_role_skill_mapping.json" assert { type: "json" };
import skillTransferMap from "../data/15_skill_transfer_map.json" assert { type: "json" };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const MODEL = 'gpt-4o-mini'
const RATE_LIMIT_CALLS = 5
const RATE_LIMIT_WINDOW = 3600 // 1 hour

// Fit scoring weights per fit_scoring_logic
const WEIGHTS = { core: 0.6, secondary: 0.3, differentiator: 0.1 } as const;

// Legacy pure-fit thresholds — used as fallback when no 5-year goal is known
const FIT_ONLY_THRESHOLDS = { t1: 0.70, t2: 0.50, t3: 0.35 } as const;

// Goal-aware thresholds — tiers combine readiness (fit) AND goal alignment
const GOAL_TIER_THRESHOLDS = {
  tier_1_min_fit: 0.50,
  tier_1_min_alignment: 0.60,
  tier_2_min_fit: 0.50,
  tier_3_min_fit: 0.35,
  tier_3_min_alignment: 0.60,
} as const;

const MAX_T1 = 3, MAX_T2 = 2, MAX_T3 = 1;

// ─── Helpers ────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  "the","a","an","of","to","and","or","in","on","for","with","at","by","from",
  "as","is","are","was","were","be","been","has","have","had","do","does","did",
  "that","this","these","those","it","its","their","them","they","you","your",
  "our","his","her","she","he","who","whom","which","what","when","where","why",
  "how","not","no","yes","also","but","if","then","so","than","such","can","could",
  "may","might","will","would","shall","should","must","role","person","often",
  "level","typically","usually","someone","user","users","work","working"
]);

function tokenize(s: string): string[] {
  return (s || "").toLowerCase().match(/[a-z][a-z-]{2,}/g) || [];
}

function containsPhrase(text: string, phrase: string): boolean {
  if (!phrase || phrase.length < 3) return false;
  const esc = phrase.toLowerCase().trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("\\b" + esc + "\\b").test(text);
}

function signalFires(signal: any, text: string): boolean {
  for (const t of signal.tags || []) {
    if (typeof t === "string" && containsPhrase(text, t.replace(/_/g, " "))) return true;
  }
  const desc = String(signal.description || "").toLowerCase();
  const descTokens = [...new Set(tokenize(desc).filter((t) => !STOPWORDS.has(t)))];
  if (descTokens.length === 0) return false;
  let hits = 0;
  for (const tok of descTokens) if (containsPhrase(text, tok)) hits++;
  return hits >= Math.max(3, Math.ceil(descTokens.length * 0.4));
}

// Extract skill IDs from a mapping (handles flat and nested schemas)
function bucketSkillIds(mapping: any, bucket: "core" | "secondary" | "differentiator"): string[] {
  if (!mapping) return [];
  const flat = mapping[`${bucket}_skills`];
  if (Array.isArray(flat) && flat.length > 0) {
    return flat
      .map((e: any) => (typeof e === "string" ? e : e?.skill_id))
      .filter((s: any): s is string => typeof s === "string");
  }
  const nested = mapping.skills;
  if (nested && typeof nested === "object" && Array.isArray(nested[bucket])) {
    return nested[bucket]
      .map((e: any) => (typeof e === "string" ? e : e?.skill_id))
      .filter((s: any): s is string => typeof s === "string");
  }
  return [];
}

// Pure-fit tier — used only when the user has no 5-year goal
function assignTierFitOnly(score: number): "tier_1" | "tier_2" | "tier_3" | null {
  if (score >= FIT_ONLY_THRESHOLDS.t1) return "tier_1";
  if (score >= FIT_ONLY_THRESHOLDS.t2) return "tier_2";
  if (score >= FIT_ONLY_THRESHOLDS.t3) return "tier_3";
  return null;
}

// Goal-aware tier — combines readiness (fit) AND alignment to the 5-year goal.
// Tier 1 = strong enough fit AND strong goal alignment (best next move)
// Tier 2 = strong fit but weak goal alignment (viable but off-path)
// Tier 3 = on-path but not yet ready (aspirational)
function assignTierWithGoal(fitScore: number, goalAlignment: number):
  "tier_1" | "tier_2" | "tier_3" | null {
  const t = GOAL_TIER_THRESHOLDS;
  if (fitScore >= t.tier_1_min_fit && goalAlignment >= t.tier_1_min_alignment) return "tier_1";
  if (fitScore >= t.tier_2_min_fit) return "tier_2";
  if (fitScore >= t.tier_3_min_fit && goalAlignment >= t.tier_3_min_alignment) return "tier_3";
  return null;
}

// ─── Pre-computed indexes ──────────────────────────────────────────────
const allRoles: any[] = (roleLibrary as any).roles;
const allSkills: any[] = (skillLibrary as any).skill_library;
const allSignals: any[] = (proofSignalLibrary as any).proof_signal_library;
const allMappings: any[] = (roleSkillMapping as any).role_skill_mapping;
const allTransfers: any[] = (skillTransferMap as any).transfers;

const ROLE_BY_ID = new Map<string, any>();
for (const r of allRoles) ROLE_BY_ID.set(r.id || r.role_id, r);

const MAPPING_BY_ROLE = new Map<string, any>();
for (const m of allMappings) MAPPING_BY_ROLE.set(m.role_id, m);

const SKILL_BY_ID = new Map<string, any>();
for (const s of allSkills) SKILL_BY_ID.set(s.id || s.skill_id, s);

// Index transfers by (source, target) for O(1) lookup: find how candidate → goal transitions
const TRANSFER_BY_S_T = new Map<string, any>();
for (const t of allTransfers) TRANSFER_BY_S_T.set(`${t.s}→${t.t}`, t);

function skillName(id: string): string {
  return SKILL_BY_ID.get(id)?.name || id;
}

// Resolve the user's free-text 5-year goal into a role_id from the library.
// Two-pass scored matcher (defensive against noisy user input):
//   1. Exact normalized match on standardized_title or any alternate_title → immediate win
//   2. Whole-word substring match scored by (inputLen / titleLen). Drops short
//      alternate titles (< 5 chars) to avoid matching on abbreviations like "Lead".
//      Never uses `norm.includes(title)` — that direction matches generic user
//      input against overly-broad short titles and produces wrong results.
//   Tiebreak by seniority_rank desc — students typically aspire to the senior
//   version of an ambiguous family ("marketing" → Marketing Manager, not Coordinator).
//   Returns null when best score < MIN_GOAL_RESOLUTION_SCORE so the tier system
//   falls back to pure-fit thresholds rather than picking a garbage role.
const SENIORITY_RANK: Record<string, number> = {
  "Entry": 0, "entry": 0,
  "Entry_Mid": 1,
  "Mid": 2, "mid": 2,
  "mid_to_senior": 3,
  "Senior": 3, "senior": 3,
  "Lead_Manager": 4, "lead": 4,
  "Director_Head": 5,
  "VP_Executive": 6, "executive": 6,
};
const MIN_GOAL_RESOLUTION_SCORE = 0.30;

// Seniority cap by user experience level — applies only to scored pass (Pass 2).
// Exact matches (Pass 1) always win regardless — if a student explicitly types
// "VP Marketing" we respect that.
type ExperienceLevel = "early_career" | "mid_career" | "senior_career";
const SENIORITY_CAP: Record<ExperienceLevel, number> = {
  early_career: 3,  // Senior and below
  mid_career: 5,    // Director_Head and below
  senior_career: 6, // VP_Executive (no effective cap)
};

function resolveGoalRoleId(
  goalText: string | null | undefined,
  experienceLevel: ExperienceLevel = "mid_career"
): string | null {
  if (!goalText) return null;
  const norm = goalText.toLowerCase().replace(/[\s_\-]+/g, " ").trim();
  if (!norm) return null;

  // Pass 1 — exact normalized match (no cap; user's explicit choice wins)
  for (const r of allRoles) {
    const id = r.id || r.role_id;
    const titles = [r.standardized_title, ...(r.alternate_titles || [])]
      .filter(Boolean)
      .map((t: string) => t.toLowerCase().replace(/[\s_\-]+/g, " ").trim());
    if (titles.some((t: string) => t === norm)) return id;
  }

  // Pass 2 — scored whole-word substring match, filtered by seniority cap
  const cap = SENIORITY_CAP[experienceLevel];
  const esc = norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${esc}\\b`);
  const inputLen = norm.length;

  let best: { id: string; score: number; seniorityRank: number } | null = null;
  for (const r of allRoles) {
    const seniorityRank = SENIORITY_RANK[r.seniority] ?? 2;
    if (seniorityRank > cap) continue;  // above ceiling for this experience level

    const id = r.id || r.role_id;
    const candidateTitles: string[] = [];
    if (r.standardized_title) {
      candidateTitles.push(
        String(r.standardized_title).toLowerCase().replace(/[\s_\-]+/g, " ").trim()
      );
    }
    for (const alt of (r.alternate_titles || [])) {
      const a = String(alt).toLowerCase().replace(/[\s_\-]+/g, " ").trim();
      if (a.length >= 5) candidateTitles.push(a);
    }

    let roleScore = 0;
    for (const t of candidateTitles) {
      if (pattern.test(t)) {
        const s = inputLen / t.length;
        if (s > roleScore) roleScore = s;
      }
    }

    if (roleScore > 0) {
      if (
        !best ||
        roleScore > best.score ||
        (roleScore === best.score && seniorityRank > best.seniorityRank)
      ) {
        best = { id, score: roleScore, seniorityRank };
      }
    }
  }

  return best && best.score >= MIN_GOAL_RESOLUTION_SCORE ? best.id : null;
}

function yearFromDate(s: unknown): number | null {
  if (!s) return null;
  const m = String(s).match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}

// Count only career-building employment toward experience years. Military,
// volunteer, and student-leadership roles don't make someone a mid-career
// professional — a Reichman undergrad with 2 years Nahal + 2 years Heseg
// volunteering + 1 year part-time is still early-career, not mid-career.
// Career-countable types: internship, full_time, part_time, freelance.
const CAREER_COUNTABLE_TYPES = new Set(["internship", "full_time", "part_time", "freelance"]);

// Re-infer experience type from title/company/responsibilities, used when the
// stored type is missing or obviously wrong (e.g. legacy rows from before the
// CV extractor learned to classify military service — everything was stamped
// "full_time" regardless). Mirrors the client-side inferExperienceType.
function reinferType(exp: any): string {
  const stored = String(exp?.type ?? "").toLowerCase();
  const text = `${exp?.title || ""} ${exp?.company || ""} ${Array.isArray(exp?.responsibilities) ? exp.responsibilities.join(" ") : (exp?.responsibilities || "")}`.toLowerCase();

  if (/\b(idf|nahal|givati|golani|paratroopers|sayeret|matkal|shaldag|duvdevan|kfir|unit 8200|\b8200\b|mamram|talpiot|israeli? defense forces|military service|army|idf reserves|soldier|officer training|bahad)\b/.test(text)) return "military";
  if (/\b(volunteer|volunteering|pro bono|mentor(ed|ing)? at)\b/.test(text)) return "volunteer";
  if (/\b(intern|internship)\b/.test(text)) return "internship";
  if (/\b(freelance|freelancer|self-employed|contractor|consultant)\b/.test(text)) return "freelance";
  if (/\b(president|captain|chair|founder|co-founder|team lead(er)?)\b/.test(text) && /\b(club|society|association|student|chapter)\b/.test(text)) return "leadership";

  return stored || "full_time";
}

function totalYearsOfExperience(experiences: any[]): number {
  const now = new Date().getFullYear();
  let total = 0;
  for (const exp of experiences || []) {
    const t = reinferType(exp);
    if (!CAREER_COUNTABLE_TYPES.has(t)) continue;
    const start = yearFromDate(exp.start_date);
    if (start === null) continue;
    const endRaw = String(exp.end_date ?? "").toLowerCase();
    const isCurrent = exp.is_current || !endRaw || endRaw.includes("present") || endRaw.includes("current");
    const end = isCurrent ? now : (yearFromDate(exp.end_date) ?? now);
    total += Math.max(0, end - start);
  }
  return total;
}

// Heuristic for student detection on the profile row. Education level values
// we've seen in the wild: "high_school", "bachelors", "masters", "phd",
// "bootcamp", "self_taught". Undergrad in progress is usually stored as
// "bachelors" (the target degree) with no completion flag, so we also look
// at whether any career-countable role started long enough ago to suggest
// post-grad. If the only non-excluded experience is a sub-2-year part-time
// gig overlapping with education, treat as still-a-student.
function inferExperienceLevel(experiences: any[], profile: any): ExperienceLevel {
  const years = totalYearsOfExperience(experiences);
  const edu = String(profile?.education_level || "").toLowerCase();
  const explicitStudent = edu.includes("student") || edu.includes("in progress") || edu.includes("current");
  if (explicitStudent || years < 3) return "early_career";
  if (years < 8) return "mid_career";
  return "senior_career";
}

// Broad role family groups — for low-alignment "related but not adjacent" fallback.
// Only used when no transfer path and no family match exist.
const FAMILY_GROUPS: Record<string, string> = {
  Support: "customer_ops",
  Relationship_Growth: "customer_ops",
  Customer_Experience: "customer_ops",
  Onboarding_Implementation: "customer_ops",
  Sales: "commercial",
  BD_Partnerships: "commercial",
  Marketing: "commercial",
  RevOps_BizOps: "analytics_ops",
  Operations: "analytics_ops",
  Data: "analytics_ops",
  Finance: "analytics_ops",
  Consulting: "analytics_ops",
  Product: "product_tech",
  Engineering: "product_tech",
  Design_UX: "product_tech",
  AI_ML: "product_tech",
  Solutions_Engineering: "product_tech",
  HR_People: "people_admin",
  Admin_GA: "people_admin",
  IT_Security: "product_tech",
  Leadership: "leadership",
};

// Compute goal alignment score 0–1 for a candidate role given the user's goal role id.
// Returns a reason string so the LLM/frontend can explain the number.
function computeGoalAlignment(
  candidateId: string,
  goalRoleId: string | null
): { score: number; reason: string } {
  if (!goalRoleId) return { score: 0, reason: "no goal provided" };
  if (candidateId === goalRoleId) return { score: 1.0, reason: "exact target role" };

  const cand = ROLE_BY_ID.get(candidateId);
  const goal = ROLE_BY_ID.get(goalRoleId);
  if (!cand || !goal) return { score: 0.1, reason: "candidate or goal missing from library" };

  // Transfer path candidate → goal
  const transfer = TRANSFER_BY_S_T.get(`${candidateId}→${goalRoleId}`);
  if (transfer) {
    const type = String(transfer.type || "").toLowerCase();
    if (type === "natural") return { score: 0.85, reason: "natural transfer path to goal" };
    if (type === "stretch") return { score: 0.70, reason: "stretch transfer path to goal" };
    if (type === "pivot")   return { score: 0.50, reason: "pivot transfer path to goal" };
    return { score: 0.65, reason: `known transfer path to goal (${type || "unspecified"})` };
  }

  // Same role_family (covers reverse transfers / adjacent same-track roles)
  if (cand.role_family && goal.role_family && cand.role_family === goal.role_family) {
    return { score: 0.9, reason: `same role family (${cand.role_family})` };
  }

  // Related broad family group
  const candGroup = FAMILY_GROUPS[cand.role_family];
  const goalGroup = FAMILY_GROUPS[goal.role_family];
  if (candGroup && goalGroup && candGroup === goalGroup) {
    return { score: 0.5, reason: `related category (${candGroup})` };
  }

  return { score: 0.1, reason: "no clear connection to goal" };
}

// Deterministic scoring — now accepts goalRoleId to compute goal_alignment_score
function computeRoleScore(
  roleId: string,
  userSkillIds: Set<string>,
  goalRoleId: string | null
) {
  const mapping = MAPPING_BY_ROLE.get(roleId);
  const roleDef = ROLE_BY_ID.get(roleId);
  const buckets = {
    core: bucketSkillIds(mapping, "core"),
    secondary: bucketSkillIds(mapping, "secondary"),
    differentiator: bucketSkillIds(mapping, "differentiator"),
  };
  const matchedBy: Record<string, string[]> = { core: [], secondary: [], differentiator: [] };
  const missingBy: Record<string, string[]> = { core: [], secondary: [], differentiator: [] };
  for (const b of ["core", "secondary", "differentiator"] as const) {
    for (const sid of buckets[b]) {
      (userSkillIds.has(sid) ? matchedBy[b] : missingBy[b]).push(sid);
    }
  }
  const ratio = (matched: number, total: number) => (total > 0 ? matched / total : 0);
  const fitScore =
    ratio(matchedBy.core.length, buckets.core.length) * WEIGHTS.core +
    ratio(matchedBy.secondary.length, buckets.secondary.length) * WEIGHTS.secondary +
    ratio(matchedBy.differentiator.length, buckets.differentiator.length) * WEIGHTS.differentiator;

  const { score: goalAlignment, reason: alignmentReason } =
    computeGoalAlignment(roleId, goalRoleId);

  const tier = goalRoleId
    ? assignTierWithGoal(fitScore, goalAlignment)
    : assignTierFitOnly(fitScore);

  const matchedSkillIds = [...matchedBy.core, ...matchedBy.secondary, ...matchedBy.differentiator];
  const missingSkillIds = [...missingBy.core, ...missingBy.secondary];
  return {
    role_id: roleId,
    title: roleDef?.standardized_title || roleDef?.title || roleId,
    score: Math.round(fitScore * 1000) / 1000,
    goal_alignment_score: Math.round(goalAlignment * 1000) / 1000,
    alignment_reason: alignmentReason,
    tier,
    matched_skill_ids: matchedSkillIds,
    missing_skill_ids: missingSkillIds,
    matched_skills: matchedSkillIds.map(skillName),
    missing_skills: missingSkillIds.map(skillName),
    role_family: roleDef?.role_family,
    seniority: roleDef?.seniority,
    mapping_exists: Boolean(mapping),
  };
}

function inferQualificationLevel(experiences: any[]): "Junior" | "Mid-Level" | "Senior" {
  const count = experiences.length;
  const hasManaged = experiences.some((e: any) => e.managed_people);
  if (hasManaged || count >= 5) return "Senior";
  if (count >= 2) return "Mid-Level";
  return "Junior";
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: allowed } = await serviceClient.rpc('check_rate_limit', {
      p_user_id: user.id,
      p_function_name: 'generate-career-analysis',
      p_max_calls: RATE_LIMIT_CALLS,
      p_window_seconds: RATE_LIMIT_WINDOW,
    })
    if (!allowed) {
      await serviceClient.rpc('log_error', {
        p_user_id: user.id,
        p_function_name: 'generate-career-analysis',
        p_error_message: 'Rate limit exceeded',
        p_error_details: null,
      }).catch(() => {});
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again in an hour.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const rawBody = JSON.stringify(body);
    if (rawBody.length > 100_000) {
      return new Response(JSON.stringify({ error: 'Request payload too large.' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { dream_roles } = body

    const { data: profiles } = await supabase.from('profiles').select('*').eq('id', user.id)
    const { data: experiences } = await supabase.from('experiences').select('*').eq('user_id', user.id)
    const { data: projects } = await supabase.from('projects').select('*').eq('user_id', user.id)
    const { data: certifications } = await supabase.from('certifications').select('*').eq('user_id', user.id)

    const profile = profiles?.[0]
    if (!profile) {
      return new Response(JSON.stringify({ error: 'No profile found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const trunc = (s: unknown, max: number) => String(s ?? '').slice(0, max);
    const sanitisedProfile = {
      full_name: trunc(profile.full_name, 100),
      skills: (profile.skills || []).slice(0, 50).map((s: unknown) => trunc(s, 60)),
      degree: trunc(profile.degree, 100),
      field_of_study: trunc(profile.field_of_study, 100),
      education_level: trunc(profile.education_level, 50),
      summary: trunc(profile.summary, 500),
      five_year_role: trunc(profile.five_year_role, 100),
      target_job_titles: (profile.target_job_titles || []).slice(0, 10).map((t: unknown) => trunc(t, 100)),
      target_industries: (profile.target_industries || []).slice(0, 10).map((i: unknown) => trunc(i, 100)),
      location: trunc(profile.location, 100),
      employment_status: trunc(profile.employment_status, 50),
      open_to_lateral: profile.open_to_lateral ?? false,
      open_to_outside_degree: profile.open_to_outside_degree ?? false,
    };
    const sanitisedExperiences = (experiences || []).slice(0, 10).map((e: any) => ({
      title: trunc(e.title, 100),
      company: trunc(e.company, 100),
      responsibilities: trunc(e.responsibilities, 300),
      skills_used: (e.skills_used || []).slice(0, 20).map((s: unknown) => trunc(s, 60)),
      tools_used: (e.tools_used || []).slice(0, 20).map((s: unknown) => trunc(s, 60)),
      managed_people: e.managed_people ?? false,
      cross_functional: e.cross_functional ?? false,
      type: trunc(e.type, 50),
    }));
    const sanitisedProjects = (projects || []).slice(0, 10).map((p: any) => ({
      name: trunc(p.name, 100),
      description: trunc(p.description, 300),
      skills_demonstrated: (p.skills_demonstrated || []).slice(0, 20).map((s: unknown) => trunc(s, 60)),
    }));
    const sanitisedCerts = (certifications || []).slice(0, 10).map((c: any) => ({
      name: trunc(c.name, 100),
      issuer: trunc(c.issuer, 100),
    }));
    const sanitisedDreamRoles = (dream_roles || []).slice(0, 10).map((r: unknown) => trunc(r, 100));
    const dreamRolesForPrompt = sanitisedDreamRoles.length
      ? sanitisedDreamRoles
      : (profile.five_year_role ? [trunc(profile.five_year_role, 100)] : []);

    // ─── PHASE 1: Deterministic scoring ────────────────────────────────

    // 1a. Build profile text for proof signal matching
    const profileTextParts: string[] = [
      sanitisedProfile.full_name,
      sanitisedProfile.summary,
      sanitisedProfile.degree,
      sanitisedProfile.field_of_study,
      sanitisedProfile.education_level,
      sanitisedProfile.skills.join(" "),
      ...sanitisedExperiences.map(e => `${e.title} at ${e.company}. ${e.responsibilities} ${(e.skills_used || []).join(" ")} ${(e.tools_used || []).join(" ")}`),
      ...sanitisedProjects.map(p => `${p.name}. ${p.description} ${(p.skills_demonstrated || []).join(" ")}`),
      ...sanitisedCerts.map(c => `${c.name} ${c.issuer}`),
      sanitisedProfile.target_job_titles.join(" "),
    ];
    const profileText = profileTextParts.filter(Boolean).join(" ").toLowerCase();

    // 1b. Extract user skill IDs from proof signals + stated skills
    const userSkillIds = new Set<string>();
    for (const sig of allSignals) {
      if (signalFires(sig, profileText)) {
        for (const sid of sig.maps_to_skills || []) {
          if (typeof sid === "string") userSkillIds.add(sid);
        }
      }
    }
    // Also accept stated skills that match library IDs directly
    for (const stated of sanitisedProfile.skills) {
      const norm = stated.toLowerCase().replace(/[\s-]+/g, "_");
      if (SKILL_BY_ID.has(norm)) userSkillIds.add(norm);
    }

    // 1c. Infer experience level and resolve goal within that ceiling
    const experienceLevel = inferExperienceLevel(experiences || [], profile);
    const goalRoleId = resolveGoalRoleId(sanitisedProfile.five_year_role, experienceLevel);
    const seniorityCap = SENIORITY_CAP[experienceLevel];

    // 1d. Score all roles (with goal alignment), filtered by experience-level cap.
    //   - early_career  → excludes Lead/Director/VP (ranks 4–6)
    //   - mid_career    → excludes VP (rank 6)
    //   - senior_career → no cap
    // A student should NEVER see Director or VP roles in their results, even if the
    // scoring math would otherwise surface them. Apply BEFORE scoring so the LLM
    // never receives an over-cap role to explain.
    const allScored = allRoles
      .filter(r => (SENIORITY_RANK[r.seniority] ?? 2) <= seniorityCap)
      .map(r => computeRoleScore(r.id || r.role_id, userSkillIds, goalRoleId))
      .filter(r => r.mapping_exists && r.tier !== null);
    console.log(`[career-analysis] experienceLevel=${experienceLevel} cap=${seniorityCap} candidates=${allScored.length} (of ${allRoles.length} library roles)`);

    // 1e. Build candidate pool: targeted roles + strong matches
    const allTargets = Array.from(new Set([
      ...sanitisedProfile.target_job_titles,
      ...dreamRolesForPrompt,
    ])).filter(Boolean).map(t => t.toLowerCase());

    const isTargeted = (roleId: string): boolean => {
      if (allTargets.length === 0) return false;
      const def = ROLE_BY_ID.get(roleId);
      if (!def) return false;
      const titles = [def.standardized_title, ...(def.alternate_titles || [])]
        .filter(Boolean).map((s: string) => s.toLowerCase());
      return titles.some((t: string) => allTargets.some(a => t.includes(a) || a.includes(t)));
    };

    const targeted = allScored.filter(r => isTargeted(r.role_id));
    const strongUntargeted = allScored
      .filter(r => !isTargeted(r.role_id) && (r.tier === "tier_1" || r.tier === "tier_2"));
    const candidatePool = [...targeted, ...strongUntargeted];

    // 1f. Select final set: top-N per tier with tier-appropriate sort
    //   - Tier 1 sorted by combined score (0.5 * fit + 0.5 * alignment) — both dimensions matter
    //   - Tier 2 sorted by fit desc — viable-now roles
    //   - Tier 3 sorted by alignment desc — aspirational on-path roles
    const combinedT1 = (r: any) => 0.5 * r.score + 0.5 * r.goal_alignment_score;
    const byTier = {
      tier_1: candidatePool
        .filter(r => r.tier === "tier_1")
        .sort((a, b) => combinedT1(b) - combinedT1(a))
        .slice(0, MAX_T1),
      tier_2: candidatePool
        .filter(r => r.tier === "tier_2")
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_T2),
      tier_3: candidatePool
        .filter(r => r.tier === "tier_3")
        .sort((a, b) => b.goal_alignment_score - a.goal_alignment_score)
        .slice(0, MAX_T3),
    };
    const selected = [...byTier.tier_1, ...byTier.tier_2, ...byTier.tier_3];

    if (selected.length === 0) {
      return new Response(JSON.stringify({
        qualification_level: inferQualificationLevel(sanitisedExperiences),
        experience_level: experienceLevel,
        overall_assessment: "No roles in the library currently meet the minimum fit threshold for this profile. Focus on building foundational skills and revisit after gaining more experience.",
        skill_gaps: [],
        roles: [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Aggregate skill_gaps across all selected roles
    const allMissing = new Set<string>();
    for (const r of selected) for (const sid of r.missing_skill_ids) allMissing.add(sid);
    const aggregatedGaps = [...allMissing].slice(0, 8).map(skillName);

    // ─── PHASE 2: LLM writes explanations only ─────────────────────────
    const rolesForLLM = selected.map(r => ({
      title: r.title,
      tier: r.tier,
      readiness_score: r.score,
      goal_alignment_score: r.goal_alignment_score,
      alignment_reason: r.alignment_reason,
      matched_skills: r.matched_skills,
      missing_skills: r.missing_skills,
    }));

    const goalRoleTitle = goalRoleId ? ROLE_BY_ID.get(goalRoleId)?.standardized_title : null;

    const expLevelLabel = experienceLevel === 'early_career' ? 'early-career (student / 0–2 years)'
      : experienceLevel === 'mid_career' ? 'mid-career (3–7 years)'
      : 'senior (8+ years)';
    const capLabel = experienceLevel === 'early_career'
      ? 'Entry, Entry_Mid, Mid, and Senior individual-contributor roles only. ABSOLUTELY NO Director, Head of, VP, Chief, or "Lead / Manager" titles.'
      : experienceLevel === 'mid_career'
      ? 'Up to Director-level. No VP or Chief titles.'
      : 'All seniority levels permitted.';

    const systemPrompt = `You are a career advisor for the "Get A Job" platform.

You will receive a user's profile and a set of pre-scored role recommendations with their fit scores, tiers, matched skills, and skill gaps.

Your job is to write clear, helpful explanations — NOT to compute scores or assign tiers. Scores and tiers are already computed deterministically by the server.

USER SENIORITY CONTEXT: This user is ${expLevelLabel}. Appropriate roles: ${capLabel}. The server has already filtered the pre-scored list to respect this cap, so every role in the input is safe to recommend. Do not name, suggest, or mention any role above the user's cap in your reasoning, action_items, or alignment_to_goal text — if a Tier 3 aspirational role is shown, it's already within the cap.

Write in a supportive, actionable tone. Reference the user's specific experiences and skills. Do not invent facts about the user. Do not modify the titles, tiers, scores, matched_skills, or missing_skills values.`;

    const userPrompt = `USER PROFILE:
- Name: ${sanitisedProfile.full_name || 'Not provided'}
- Education: ${sanitisedProfile.degree} in ${sanitisedProfile.field_of_study} (${sanitisedProfile.education_level})
- Summary: ${sanitisedProfile.summary || 'Not provided'}
- 5-Year Goal: ${sanitisedProfile.five_year_role || 'Not provided'}
- Target Job Titles: ${JSON.stringify(sanitisedProfile.target_job_titles)}
- Target Industries: ${JSON.stringify(sanitisedProfile.target_industries)}
- Location: ${sanitisedProfile.location || 'Not provided'}
- Employment Status: ${sanitisedProfile.employment_status || 'Not provided'}
- Open to Lateral Roles: ${sanitisedProfile.open_to_lateral}
- Open to Roles Outside Degree: ${sanitisedProfile.open_to_outside_degree}
- Stated Skills: ${JSON.stringify(sanitisedProfile.skills)}
- Experiences: ${JSON.stringify(sanitisedExperiences)}
- Projects: ${JSON.stringify(sanitisedProjects)}
- Certifications: ${JSON.stringify(sanitisedCerts)}
${dreamRolesForPrompt.length ? `- Dream Roles: ${dreamRolesForPrompt.join(', ')}` : ''}

TIER DEFINITIONS (for your reasoning — the server has already assigned tiers):
- Tier 1: strong fit AND strong alignment to the 5-year goal — the best immediate next move
- Tier 2: strong fit but weak goal alignment — viable now, but pulls away from the long-term path
- Tier 3: moderate fit but strong goal alignment — aspirational, one step ahead of current readiness

${goalRoleTitle ? `RESOLVED 5-YEAR GOAL ROLE (matched to library): ${goalRoleTitle}` : `NO 5-YEAR GOAL PROVIDED — tier assignment used fit score only.`}

PRE-SCORED ROLE RECOMMENDATIONS (do not modify title, tier, scores, or skill lists):
${JSON.stringify(rolesForLLM, null, 2)}

For each role listed above, write:
1. reasoning: 2-3 sentences explaining why this user is/isn't a strong fit, referencing their specific experiences and skills. Mention both the fit score and the goal alignment score when relevant.
2. action_items: 2-3 concrete, specific next steps to close the skill gaps
3. alignment_to_goal: 1 sentence explaining the goal alignment score using the alignment_reason as a factual anchor (e.g. "natural transfer path", "same role family", "no clear connection")

Also write at the top level:
- overall_assessment: 2-3 sentences summarising the user's current position and strongest signals
- qualification_level: "Junior", "Mid-Level", or "Senior" based on their experience depth

Return JSON matching this exact structure:
{
  "qualification_level": "string",
  "overall_assessment": "string",
  "roles": [
    {
      "title": "string (copy exactly from the input)",
      "tier": "string (copy exactly)",
      "readiness_score": number (copy exactly),
      "goal_alignment_score": number (copy exactly),
      "matched_skills": [strings] (copy exactly),
      "missing_skills": [strings] (copy exactly),
      "reasoning": "string (YOU write this)",
      "action_items": [strings] (YOU write this),
      "alignment_to_goal": "string (YOU write this)"
    }
  ]
}

CRITICAL: Do not change any title, tier, readiness_score, goal_alignment_score, matched_skills, or missing_skills value. Copy them verbatim. You are only authoring reasoning, action_items, alignment_to_goal, overall_assessment, and qualification_level.

Return ONLY valid JSON.`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.4,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(45000),
    })

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text()
      await serviceClient.rpc('log_error', {
        p_user_id: user.id,
        p_function_name: 'generate-career-analysis',
        p_error_message: 'OpenAI API error',
        p_error_details: { status: openaiResponse.status, details: errText },
      })
      return new Response(JSON.stringify({ error: 'AI service error', details: errText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const completion = await openaiResponse.json()
    let llmResult: Record<string, any>;
    try {
      llmResult = JSON.parse(completion.choices?.[0]?.message?.content || '{}');
    } catch {
      return new Response(JSON.stringify({ error: 'AI returned an invalid response format. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── PHASE 3: Hard validation — override LLM-supplied numeric/ID fields ───
    const llmRolesByTitle = new Map<string, any>();
    if (Array.isArray(llmResult.roles)) {
      for (const r of llmResult.roles) {
        if (typeof r?.title === "string") llmRolesByTitle.set(r.title, r);
      }
    }

    const finalRoles = selected.map(server => {
      const llm = llmRolesByTitle.get(server.title) || {};
      return {
        title: server.title,
        tier: server.tier,
        readiness_score: server.score,
        goal_alignment_score: server.goal_alignment_score,
        alignment_reason: server.alignment_reason,
        matched_skills: server.matched_skills,
        missing_skills: server.missing_skills,
        reasoning: typeof llm.reasoning === "string" ? llm.reasoning : "",
        action_items: Array.isArray(llm.action_items)
          ? llm.action_items.filter((x: any) => typeof x === "string").slice(0, 5)
          : [],
        alignment_to_goal: typeof llm.alignment_to_goal === "string" ? llm.alignment_to_goal : "",
      };
    });

    const response = {
      qualification_level: ["Junior", "Mid-Level", "Senior"].includes(llmResult.qualification_level)
        ? llmResult.qualification_level
        : inferQualificationLevel(sanitisedExperiences),
      experience_level: experienceLevel,
      overall_assessment: typeof llmResult.overall_assessment === "string" && llmResult.overall_assessment.trim()
        ? llmResult.overall_assessment
        : "",
      skill_gaps: aggregatedGaps,
      roles: finalRoles,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    try {
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )
      await serviceClient.rpc('log_error', {
        p_user_id: null,
        p_function_name: 'generate-career-analysis',
        p_error_message: (error as Error).message,
        p_error_details: null,
      })
    } catch { /* best-effort logging */ }
    return new Response(JSON.stringify({ error: 'An unexpected error occurred.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
