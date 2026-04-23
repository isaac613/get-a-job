import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- Load JSON Libraries ---
import { roleLibrary } from "./shared/libraries/00_role_library.ts";
import { skillLibrary } from "./shared/libraries/01_skill_library.ts";
import { proofSignalLibrary } from "./shared/libraries/02_proof_signal_library.ts";
import { roleSkillMapping } from "./shared/libraries/04_role_skill_mapping.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'gpt-4o-mini'
const RATE_LIMIT_CALLS = 5
const RATE_LIMIT_WINDOW = 3600 // 1 hour

// Scoring weights per fit_scoring_logic
const WEIGHTS = { core: 0.6, secondary: 0.3, differentiator: 0.1 } as const;
const TIER_THRESHOLDS = { t1: 0.70, t2: 0.50, t3: 0.35 } as const;
const MAX_ROLES_SCORED = 20;
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

function assignTier(score: number): "tier_1" | "tier_2" | "tier_3" | null {
  if (score >= TIER_THRESHOLDS.t1) return "tier_1";
  if (score >= TIER_THRESHOLDS.t2) return "tier_2";
  if (score >= TIER_THRESHOLDS.t3) return "tier_3";
  return null;
}

// ─── Pre-computed indexes ──────────────────────────────────────────────
const allRoles: any[] = (roleLibrary as any).roles;
const allSkills: any[] = (skillLibrary as any).skill_library;
const allSignals: any[] = (proofSignalLibrary as any).proof_signal_library;
const allMappings: any[] = (roleSkillMapping as any).role_skill_mapping;

const ROLE_BY_ID = new Map<string, any>();
for (const r of allRoles) ROLE_BY_ID.set(r.id || r.role_id, r);

const MAPPING_BY_ROLE = new Map<string, any>();
for (const m of allMappings) MAPPING_BY_ROLE.set(m.role_id, m);

const SKILL_BY_ID = new Map<string, any>();
for (const s of allSkills) SKILL_BY_ID.set(s.id || s.skill_id, s);

function skillName(id: string): string {
  return SKILL_BY_ID.get(id)?.name || id;
}

// Deterministic scoring
function computeRoleScore(roleId: string, userSkillIds: Set<string>) {
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
  const score =
    ratio(matchedBy.core.length, buckets.core.length) * WEIGHTS.core +
    ratio(matchedBy.secondary.length, buckets.secondary.length) * WEIGHTS.secondary +
    ratio(matchedBy.differentiator.length, buckets.differentiator.length) * WEIGHTS.differentiator;

  const matchedSkillIds = [...matchedBy.core, ...matchedBy.secondary, ...matchedBy.differentiator];
  const missingSkillIds = [...missingBy.core, ...missingBy.secondary]; // gaps = core + secondary only
  return {
    role_id: roleId,
    title: roleDef?.standardized_title || roleDef?.title || roleId,
    score: Math.round(score * 1000) / 1000,
    tier: assignTier(score),
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

    // 1c. Score all roles
    const allScored = allRoles
      .map(r => computeRoleScore(r.id || r.role_id, userSkillIds))
      .filter(r => r.mapping_exists && r.tier !== null);

    // 1d. Build candidate pool: targeted roles + strong matches
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

    // Union, sort by score desc, cap
    const candidatePool = [...targeted, ...strongUntargeted]
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ROLES_SCORED);

    // 1e. Select final set: top-N by tier
    const byTier = {
      tier_1: candidatePool.filter(r => r.tier === "tier_1").slice(0, MAX_T1),
      tier_2: candidatePool.filter(r => r.tier === "tier_2").slice(0, MAX_T2),
      tier_3: candidatePool.filter(r => r.tier === "tier_3").slice(0, MAX_T3),
    };
    const selected = [...byTier.tier_1, ...byTier.tier_2, ...byTier.tier_3];

    if (selected.length === 0) {
      return new Response(JSON.stringify({
        qualification_level: inferQualificationLevel(sanitisedExperiences),
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
      matched_skills: r.matched_skills,
      missing_skills: r.missing_skills,
    }));

    const systemPrompt = `You are a career advisor for the "Get A Job" platform.

You will receive a user's profile and a set of pre-scored role recommendations with their fit scores, tiers, matched skills, and skill gaps.

Your job is to write clear, helpful explanations — NOT to compute scores or assign tiers. Scores and tiers are already computed deterministically by the server.

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

PRE-SCORED ROLE RECOMMENDATIONS (do not modify title, tier, score, or skill lists):
${JSON.stringify(rolesForLLM, null, 2)}

For each role listed above, write:
1. reasoning: 2-3 sentences explaining why this user is/isn't a strong fit, referencing their specific experiences and skills
2. action_items: 2-3 concrete, specific next steps to close the skill gaps
3. alignment_to_goal: 1 sentence connecting this role to their 5-year target (if provided)

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
      "matched_skills": [strings] (copy exactly),
      "missing_skills": [strings] (copy exactly),
      "reasoning": "string (YOU write this)",
      "action_items": [strings] (YOU write this),
      "alignment_to_goal": "string (YOU write this)"
    }
  ]
}

CRITICAL: Do not change any title, tier, readiness_score, matched_skills, or missing_skills value. Copy them verbatim. You are only authoring reasoning, action_items, alignment_to_goal, overall_assessment, and qualification_level.

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
