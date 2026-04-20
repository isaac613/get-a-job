import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- Load JSON Libraries ---
import roleLibrary from "../data/00_role_library.json" assert { type: "json" };
import roleSkillMapping from "../data/04_role_skill_mapping.json" assert { type: "json" };
import fitScoringLogic from "../data/05_fit_scoring_logic.json" assert { type: "json" };
import tierLogic from "../data/06_tier_logic.json" assert { type: "json" };
import goalAlignmentLogic from "../data/09_goal_alignment_logic.json" assert { type: "json" };
import agentDecisionLogic from "../data/010_agent_decision_logic.json" assert { type: "json" };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'gpt-4o-mini'
const RATE_LIMIT_CALLS = 5
const RATE_LIMIT_WINDOW = 3600 // 1 hour

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

    // --- Build System Prompt with Library Context ---
    const systemPrompt = `You are a Career Analysis Engine for the "Get A Job" Career Operating System.

You have access to the following standardized libraries. Use them as your source of truth — do not invent role titles, skill names, or scoring logic outside of what these libraries define.

ROLE LIBRARY (use these standardized role titles and their defined skill requirements):
${JSON.stringify(roleLibrary, null, 2)}

ROLE-SKILL MAPPING (core, secondary, and differentiator skills per role — use to score fit accurately):
${JSON.stringify(roleSkillMapping, null, 2)}

FIT SCORING LOGIC (use this exact weighting system to calculate readiness scores):
${JSON.stringify(fitScoringLogic, null, 2)}

TIER LOGIC (use these exact definitions when assigning roles to tiers):
${JSON.stringify(tierLogic, null, 2)}

GOAL ALIGNMENT LOGIC (use this to score how well each role aligns to the user's 5-year goal):
${JSON.stringify(goalAlignmentLogic, null, 2)}

AGENT DECISION LOGIC (use these rules to determine which tier each role belongs to):
${JSON.stringify(agentDecisionLogic, null, 2)}

SCORING RULES:
- Use the fit_scoring_logic weights exactly: core skills = 60%, secondary = 30%, differentiator = 10%
- Skill strength scores: strong = 1.0, medium = 0.6, weak = 0.3, missing = 0.0
- Tier 1 minimum thresholds: readiness >= 0.72 AND goal alignment >= 0.68
- Tier 2 minimum threshold: readiness >= 0.62
- Tier 3 minimum threshold: goal alignment >= 0.72
- A role can only be Tier 1 if it is both immediately realistic AND strongly aligned to the 5-year goal
- Do not force roles into tiers if they do not meet the minimum thresholds
- Return variable number of roles per tier based on quality — tiers can be empty if no role qualifies

ROLE SELECTION RULES:
- Only recommend roles that exist in the role library
- Use the standardized role titles from the library exactly as written
- Match the user's experience and skills against the role's core_skills, secondary_skills, and differentiator_skills
- Consider the user's location, employment status, and openness to lateral moves when scoring
- Cross-sector transitions are allowed but require strong transferable proof signals
- Entry level roles allow more flexibility for cross-sector moves than senior roles`;

    const userPrompt = `USER PROFILE:
- Name: ${sanitisedProfile.full_name || 'Not provided'}
- Skills: ${JSON.stringify(sanitisedProfile.skills)}
- Education: ${sanitisedProfile.degree} in ${sanitisedProfile.field_of_study} (${sanitisedProfile.education_level})
- Summary: ${sanitisedProfile.summary || 'Not provided'}
- 5-Year Goal: ${sanitisedProfile.five_year_role || 'Not provided'}
- Target Job Titles: ${JSON.stringify(sanitisedProfile.target_job_titles)}
- Target Industries: ${JSON.stringify(sanitisedProfile.target_industries)}
- Location: ${sanitisedProfile.location || 'Not provided'}
- Employment Status: ${sanitisedProfile.employment_status || 'Not provided'}
- Open to Lateral Roles: ${sanitisedProfile.open_to_lateral}
- Open to Roles Outside Degree: ${sanitisedProfile.open_to_outside_degree}
- Experiences: ${JSON.stringify(sanitisedExperiences)}
- Projects: ${JSON.stringify(sanitisedProjects)}
- Certifications: ${JSON.stringify(sanitisedCerts)}
${dreamRolesForPrompt.length ? `- Dream Roles: ${dreamRolesForPrompt.join(', ')}` : ''}

TASK:
Analyze this user's profile using the role library and scoring logic provided in your system prompt. Generate a career analysis with tiered role recommendations.

For each recommended role:
- Use the exact role title from the role library
- Calculate readiness_score using the fit scoring logic (weighted average of core/secondary/differentiator skill scores)
- Calculate goal_alignment_score using the goal alignment logic
- Assign to tier using the agent decision logic thresholds
- List matched_skills (skills the user demonstrably has for this role)
- List missing_skills (core and secondary skills the user lacks)
- Write reasoning explaining why this role is in this tier for this specific user
- Write action_items as concrete next steps to improve readiness for this role

Return a JSON object:
{
  "qualification_level": "string (Entry / Mid / Senior based on experience depth)",
  "overall_assessment": "string (2-3 sentence honest assessment of the user's current position and strongest signals)",
  "skill_gaps": ["gap1", "gap2"],
  "roles": [
    {
      "title": "string (exact title from role library)",
      "tier": "tier_1|tier_2|tier_3",
      "readiness_score": number (0.0-1.0),
      "goal_alignment_score": number (0.0-1.0),
      "matched_skills": ["skill1"],
      "missing_skills": ["skill1"],
      "reasoning": "string (why this tier for this specific user)",
      "action_items": ["action1", "action2"],
      "alignment_to_goal": "string (how this role connects to their 5-year goal)"
    }
  ]
}

Return ONLY valid JSON. Include 4-6 roles spanning available tiers. Do not include roles that fail minimum thresholds.`

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 3000,
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
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(completion.choices?.[0]?.message?.content || '{}');
    } catch {
      return new Response(JSON.stringify({ error: 'AI returned an invalid response format. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!Array.isArray(result.roles) || result.roles.length === 0) {
      return new Response(JSON.stringify({ error: 'AI returned an unexpected response structure. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const VALID_TIERS = ['tier_1', 'tier_2', 'tier_3'];
    result.roles = (result.roles as any[]).filter(
      (r) => typeof r.title === 'string' && r.title.trim() && VALID_TIERS.includes(r.tier)
    );
    if (result.roles.length === 0) {
      return new Response(JSON.stringify({ error: 'AI returned roles with invalid structure. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(result), {
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
        p_error_message: error.message,
        p_error_details: null,
      })
    } catch { /* best-effort logging */ }
    return new Response(JSON.stringify({ error: 'An unexpected error occurred.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
