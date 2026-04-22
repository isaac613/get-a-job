import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { roleLibrary } from './shared/libraries/00_role_library.ts'
import { roleSkillMapping } from './shared/libraries/04_role_skill_mapping.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'gpt-4o-mini'
const RATE_LIMIT_CALLS = 50
const RATE_LIMIT_WINDOW = 3600

// Build slim role list once at startup (id + title + sector only)
const roleList = (roleLibrary.roles || [])
  .map((r: any) => ({ id: r.id || r.role_id, title: r.standardized_title || r.title, sector: r.sector || r.role_family }))
  .filter((r: any) => r.id && r.title)

// Index skill mappings by role_id for fast lookup
const skillMappingIndex: Record<string, any> = {}
for (const m of (roleSkillMapping.role_skill_mapping || [])) {
  if (m.role_id) skillMappingIndex[m.role_id] = m
}

async function findClosestLibraryRole(target: string, openaiKey: string): Promise<{ id: string | null, confidence: string }> {
  if (!target) return { id: null, confidence: 'none' }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{
        role: 'user',
        content: `The user's target role is: "${target}"

From this list of roles, find the closest match. A match means same domain and function — not just similar words.
Examples: "AI Automation Developer" → ai_engineer_mid (close), "Customer Success" → customer_success_manager (exact).
If nothing is reasonably close (different industry entirely), return null.

Roles: ${JSON.stringify(roleList)}

Return JSON only: { "matched_id": "role_id or null", "confidence": "exact|close|none" }`
      }],
      temperature: 0,
      max_tokens: 100,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) return { id: null, confidence: 'none' }
  const data = await res.json()
  try {
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}')
    return { id: parsed.matched_id || null, confidence: parsed.confidence || 'none' }
  } catch {
    return { id: null, confidence: 'none' }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

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
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again in an hour.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    if (JSON.stringify(body).length > 100_000) {
      return new Response(JSON.stringify({ error: 'Request payload too large.' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { dream_roles } = body

    const [profileRes, experiencesRes, projectsRes, certificationsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id),
      supabase.from('experiences').select('*').eq('user_id', user.id),
      supabase.from('projects').select('*').eq('user_id', user.id),
      supabase.from('certifications').select('*').eq('user_id', user.id),
    ])

    const profile = profileRes.data?.[0]
    if (!profile) {
      return new Response(JSON.stringify({ error: 'No profile found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const trunc = (s: unknown, max: number) => String(s ?? '').slice(0, max)
    const sanitisedProfile = {
      full_name: trunc(profile.full_name, 100),
      skills: (profile.skills || []).slice(0, 50).map((s: unknown) => trunc(s, 60)),
      degree: trunc(profile.degree, 100),
      field_of_study: trunc(profile.field_of_study, 100),
      education_level: trunc(profile.education_level, 50),
      summary: trunc(profile.summary, 500),
      five_year_role: trunc(profile.five_year_role, 100),
      target_job_titles: (profile.target_job_titles || []).slice(0, 10).map((t: unknown) => trunc(t, 100)),
      employment_status: trunc(profile.employment_status, 50),
      location: trunc(profile.location, 100),
    }
    const sanitisedExperiences = (experiencesRes.data || []).slice(0, 10).map((e: any) => ({
      title: trunc(e.title, 100),
      company: trunc(e.company, 100),
      responsibilities: trunc(e.responsibilities, 300),
      skills_used: (e.skills_used || []).slice(0, 20).map((s: unknown) => trunc(s, 60)),
      tools_used: (e.tools_used || []).slice(0, 20).map((s: unknown) => trunc(s, 60)),
      type: trunc(e.type, 50),
    }))
    const sanitisedProjects = (projectsRes.data || []).slice(0, 10).map((p: any) => ({
      name: trunc(p.name, 100),
      description: trunc(p.description, 300),
      skills_demonstrated: (p.skills_demonstrated || []).slice(0, 20).map((s: unknown) => trunc(s, 60)),
    }))
    const sanitisedCerts = (certificationsRes.data || []).slice(0, 10).map((c: any) => ({
      name: trunc(c.name, 100),
      issuer: trunc(c.issuer, 100),
    }))

    const sanitisedDreamRoles = (dream_roles || []).slice(0, 10).map((r: unknown) => trunc(r, 100))
    const primaryTarget = sanitisedProfile.five_year_role ||
      sanitisedProfile.target_job_titles[0] ||
      sanitisedDreamRoles[0] || ''

    const allTargets = Array.from(new Set([
      ...sanitisedProfile.target_job_titles,
      ...sanitisedDreamRoles,
      ...(primaryTarget ? [primaryTarget] : []),
    ])).filter(Boolean)

    // --- Library matching: find closest role in library for primary target ---
    const { id: matchedRoleId, confidence } = await findClosestLibraryRole(primaryTarget, openaiKey)

    const matchedSkillMapping = matchedRoleId ? skillMappingIndex[matchedRoleId] : null
    const matchedRoleData = matchedRoleId
      ? (roleLibrary.roles || []).find((r: any) => (r.id || r.role_id) === matchedRoleId)
      : null

    // Build library context block — only injected when we have a match
    let libraryContext = ''
    if (matchedSkillMapping && confidence !== 'none') {
      const label = confidence === 'exact' ? 'exact match' : 'closest match'
      // core_skills/secondary_skills/differentiator_skills are flat string arrays
      const coreSkills = (matchedSkillMapping.core_skills || []).join(', ')
      const secondarySkills = (matchedSkillMapping.secondary_skills || []).join(', ')
      const differentiatorSkills = (matchedSkillMapping.differentiator_skills || []).join(', ')
      libraryContext = `
LIBRARY MATCH (${label} for "${primaryTarget}"):
Role: ${matchedRoleData?.standardized_title || matchedRoleData?.title || matchedRoleId}
${matchedRoleData?.core_purpose || matchedRoleData?.description ? `Description: ${matchedRoleData.core_purpose || matchedRoleData.description}` : ''}

Required Skills (use these to score readiness):
- Core (60% weight): ${coreSkills}
- Secondary (30% weight): ${secondarySkills}
- Differentiator (10% weight): ${differentiatorSkills}

Use these skill weights to calculate readiness for this role and roles adjacent to it.
${confidence === 'close' ? `Note: "${primaryTarget}" is not an exact library match — adapt the skill requirements to fit the specific role.` : ''}
`
    }

    // Build proof signals context if available
    const rawProofSignals: any[] = Array.isArray(profile.proof_signals) ? profile.proof_signals : []
    const topSignals = rawProofSignals
      .filter(s => s.strength === 'strong' || s.strength === 'medium')
      .sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0))
      .slice(0, 12)

    let proofSignalsContext = ''
    if (topSignals.length > 0) {
      const signalLines = topSignals.map(s =>
        `- [${s.strength}] ${s.proof_signal}: "${(s.supporting_evidence || [])[0] || ''}" (maps to: ${(s.mapped_skills || []).slice(0, 3).join(', ')})`
      ).join('\n')
      proofSignalsContext = `
PROOF SIGNALS FROM CV (use these to validate readiness scores — strong signals = real evidence of capability):
${signalLines}
Primary domain detected: ${profile.primary_domain || 'unknown'}

When assigning readiness scores, give more weight to strong/medium proof signals than to declared skills alone.
`
    }

    const prompt = `You are a Career Analysis Engine for the "Get A Job" Career Operating System.

CRITICAL RULE: All role recommendations MUST be grounded in the user's stated target domain and actual experience. Do NOT suggest roles from unrelated industries.
${libraryContext}${proofSignalsContext}
USER PROFILE:
- Name: ${sanitisedProfile.full_name || 'Not provided'}
- Employment Status: ${sanitisedProfile.employment_status || 'Not provided'}
- Location: ${sanitisedProfile.location || 'Not provided'}
- Skills: ${JSON.stringify(sanitisedProfile.skills)}
- Education: ${sanitisedProfile.degree} in ${sanitisedProfile.field_of_study} (${sanitisedProfile.education_level})
- Summary: ${sanitisedProfile.summary || 'Not provided'}
- 5-Year Target Role: ${sanitisedProfile.five_year_role || 'Not provided'}
- Target Job Titles: ${JSON.stringify(sanitisedProfile.target_job_titles)}
- Experiences: ${JSON.stringify(sanitisedExperiences)}
- Projects: ${JSON.stringify(sanitisedProjects)}
- Certifications: ${JSON.stringify(sanitisedCerts)}
${allTargets.length ? `- Stated Career Targets: ${allTargets.join(', ')}` : ''}

ROLE SELECTION RULES:
1. Tier 1 roles MUST align with the user's stated targets. If targeting software/AI/engineering, recommend those — not CS or sales.
2. Tier 2 roles should be adjacent stepping stones toward those same targets.
3. Tier 3 should be the stretch version of their stated goal.
4. If library skill data was provided above, use it to calculate readiness scores precisely. Otherwise use your best judgement.

TIER DEFINITIONS:
- tier_1: Roles they can apply for NOW (readiness > 0.60)
- tier_2: Roles achievable with 3-6 months upskilling (readiness 0.30-0.60)
- tier_3: Stretch goals (readiness < 0.30)

Return a JSON object:
{
  "qualification_level": "string (e.g. 'Junior', 'Mid-Level', 'Senior')",
  "overall_assessment": "string (2-3 sentence overall career assessment)",
  "skill_gaps": ["gap1", "gap2"],
  "roles": [
    {
      "title": "string",
      "tier": "tier_1|tier_2|tier_3",
      "readiness_score": number (0.0-1.0),
      "matched_skills": ["skill1"],
      "missing_skills": ["skill1"],
      "reasoning": "string (why this tier, referencing their actual skills)",
      "action_items": ["action1", "action2"],
      "alignment_to_goal": "string (how this role connects to their 5-year target)"
    }
  ]
}

Return ONLY valid JSON. Include 4-6 roles spanning all tiers, all within the user's target domain.`

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(45000),
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      }),
    })

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text()
      await serviceClient.rpc('log_error', {
        p_user_id: user.id,
        p_function_name: 'generate-career-analysis',
        p_error_message: 'OpenAI API error',
        p_error_details: { status: openaiResponse.status, details: errText },
      })
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const completion = await openaiResponse.json()
    let result: Record<string, unknown>
    try {
      result = JSON.parse(completion.choices?.[0]?.message?.content || '{}')
    } catch {
      return new Response(JSON.stringify({ error: 'AI returned an invalid response format. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!Array.isArray(result.roles) || result.roles.length === 0) {
      return new Response(JSON.stringify({ error: 'AI returned an unexpected response structure. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const VALID_TIERS = ['tier_1', 'tier_2', 'tier_3']
    result.roles = (result.roles as any[]).filter(
      (r) => typeof r.title === 'string' && r.title.trim() && VALID_TIERS.includes(r.tier)
    )
    if (result.roles.length === 0) {
      return new Response(JSON.stringify({ error: 'AI returned roles with invalid structure. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    try {
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )
      await serviceClient.rpc('log_error', {
        p_user_id: null,
        p_function_name: 'generate-career-analysis',
        p_error_message: error.message,
        p_error_details: null,
      })
    } catch { /* best-effort */ }
    return new Response(JSON.stringify({ error: 'An unexpected error occurred.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
