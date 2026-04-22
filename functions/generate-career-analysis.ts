import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- Load Libraries ---
import { roleLibrary } from "./shared/libraries/00_role_library.ts";
import { roleSkillMapping } from "./shared/libraries/04_role_skill_mapping.ts";
import { fitScoringLogic } from "./shared/libraries/05_fit_scoring_logic.ts";
import { tierLogic } from "./shared/libraries/06_tier_logic.ts";
import { goalAlignmentLogic } from "./shared/libraries/09_goal_alignment_logic.ts";
import { agentDecisionLogic } from "./shared/libraries/010_agent_decision_logic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'gpt-4o-mini'
const RATE_LIMIT_CALLS = 50
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
      employment_status: trunc(profile.employment_status, 50),
      location: trunc(profile.location, 100),
    };
    const sanitisedExperiences = (experiences || []).slice(0, 10).map((e: any) => ({
      title: trunc(e.title, 100),
      company: trunc(e.company, 100),
      responsibilities: trunc(e.responsibilities, 300),
      skills_used: (e.skills_used || []).slice(0, 20).map((s: unknown) => trunc(s, 60)),
      tools_used: (e.tools_used || []).slice(0, 20).map((s: unknown) => trunc(s, 60)),
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

    // Merge stated targets: target_job_titles + five_year_role + dream_roles
    const allTargets = Array.from(new Set([
      ...sanitisedProfile.target_job_titles,
      ...dreamRolesForPrompt,
    ])).filter(Boolean);

    // --- Scoped Library Lookups ---
    // Match user's target titles against the role library (never dump full 382 KB library into prompt)
    const targetTitlesLower = allTargets.map(t => t.toLowerCase());
    const matchedRoles = (roleLibrary.roles as any[]).filter(role => {
      const titleLower = (role.standardized_title as string).toLowerCase();
      const altLower = ((role.alternate_titles as string[]) || []).map(t => t.toLowerCase());
      return targetTitlesLower.some(t =>
        titleLower.includes(t) || t.includes(titleLower) ||
        altLower.some(a => a.includes(t) || t.includes(a))
      );
    }).slice(0, 15);

    // Fall back to including all roles if no matches (e.g. user has no stated targets yet)
    const rolesToUse = matchedRoles.length > 0 ? matchedRoles : (roleLibrary.roles as any[]).slice(0, 30);
    const matchedRoleIds = new Set(rolesToUse.map((r: any) => r.id));
    const matchedSkillMappings = (roleSkillMapping.role_skill_mapping as any[]).filter(
      m => matchedRoleIds.has(m.role_id)
    );

    const systemPrompt = `You are a Career Analysis Engine for the "Get A Job" Career Operating System.

You have access to the following libraries. Use them as your source of truth when recommending roles, scoring readiness, and assigning tiers.

FIT SCORING LOGIC (use these weights to compute readiness scores):
${JSON.stringify(fitScoringLogic, null, 2)}

TIER LOGIC (use these definitions to assign tier_1/tier_2/tier_3):
${JSON.stringify(tierLogic, null, 2)}

GOAL ALIGNMENT LOGIC (use to score how well each role aligns with the user's 5-year goal):
${JSON.stringify(goalAlignmentLogic, null, 2)}

AGENT DECISION LOGIC (use this to make the final tier assignment combining readiness + goal alignment):
${JSON.stringify(agentDecisionLogic, null, 2)}

RELEVANT ROLES FROM ROLE LIBRARY (roles matched to user's stated targets — recommend only from this list):
${JSON.stringify(rolesToUse, null, 2)}

ROLE-SKILL MAPPINGS FOR MATCHED ROLES (core/secondary/differentiator skills per role):
${JSON.stringify(matchedSkillMappings, null, 2)}

CRITICAL RULES:
- All role recommendations MUST come from the "RELEVANT ROLES" list above. Do not invent roles.
- Use the fit scoring weights (core 60%, secondary 30%, differentiator 10%) to compute readiness_score.
- Use the tier logic thresholds to assign tiers — do not deviate from the defined boundaries.
- Use the goal alignment logic to populate alignment_to_goal for each role.
- Apply the agent decision logic to make the final tier call when readiness and goal alignment conflict.`

    const userPrompt = `USER PROFILE:
- Name: ${sanitisedProfile.full_name || 'Not provided'}
- Employment Status: ${sanitisedProfile.employment_status || 'Not provided'}
- Location: ${sanitisedProfile.location || 'Not provided'}
- Skills: ${JSON.stringify(sanitisedProfile.skills)}
- Education: ${sanitisedProfile.degree} in ${sanitisedProfile.field_of_study} (${sanitisedProfile.education_level})
- Summary: ${sanitisedProfile.summary || 'Not provided'}
- 5-Year Target Role: ${sanitisedProfile.five_year_role || 'Not provided'}
- Target Job Titles: ${JSON.stringify(sanitisedProfile.target_job_titles)}
- Stated Career Targets: ${allTargets.length ? allTargets.join(', ') : 'Not provided'}
- Experiences: ${JSON.stringify(sanitisedExperiences)}
- Projects: ${JSON.stringify(sanitisedProjects)}
- Certifications: ${JSON.stringify(sanitisedCerts)}

TASK:
Using the libraries in your system prompt, generate a career analysis for this user.

Steps:
1. For each role in the RELEVANT ROLES list, compute a readiness_score using the fit scoring weights against the user's skills
2. Apply the tier logic thresholds to assign each role a tier
3. Apply the goal alignment logic to score alignment with the user's 5-year target
4. Apply the agent decision logic to finalize tier assignments
5. Select 4-6 roles to include in the response, spanning all tiers

Return a JSON object:
{
  "qualification_level": "string (e.g. 'Junior', 'Mid-Level', 'Senior')",
  "overall_assessment": "string (2-3 sentence overall career assessment)",
  "skill_gaps": ["gap1", "gap2"],
  "roles": [
    {
      "title": "string (use exact standardized_title from role library)",
      "tier": "tier_1|tier_2|tier_3",
      "readiness_score": number (0.0-1.0),
      "matched_skills": ["skill1"],
      "missing_skills": ["skill1"],
      "reasoning": "string (why this tier, referencing their actual skills and the scoring logic)",
      "action_items": ["action1", "action2"],
      "alignment_to_goal": "string (how this role connects to their 5-year target)"
    }
  ]
}

Return ONLY valid JSON.`

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 2048,
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
