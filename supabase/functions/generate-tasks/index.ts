import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- Load JSON Libraries ---
import { roleLibrary } from "./shared/libraries/00_role_library.ts";
import { roleSkillMapping } from "./shared/libraries/04_role_skill_mapping.ts";
import { taskGenerationLogic } from "./shared/libraries/011_task_generation_logic.ts";
import { courseRecommendationLogic } from "./shared/libraries/012_course_recommendation_logic.ts";
import { jobSearchStageLogic } from "./shared/libraries/013_job_search_stage_logic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'gpt-4o-mini'
const RATE_LIMIT_CALLS = 10
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
      p_function_name: 'generate-tasks',
      p_max_calls: RATE_LIMIT_CALLS,
      p_window_seconds: RATE_LIMIT_WINDOW,
    })
    if (!allowed) {
      await serviceClient.rpc('log_error', {
        p_user_id: user.id,
        p_function_name: 'generate-tasks',
        p_error_message: 'Rate limit exceeded',
        p_error_details: null,
      }).catch(() => {});
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again in an hour.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rawBody = await req.text();
    if (rawBody.length > 10_000) {
      return new Response(JSON.stringify({ error: 'Request payload too large.' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { context } = JSON.parse(rawBody);
    if (context !== undefined && typeof context !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid context field.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const VALID_CONTEXTS = ['weekly action plan', 'onboarding initial tasks'];
    const safeContext = (typeof context === 'string' && VALID_CONTEXTS.includes(context)) ? context : null;

    // --- Fetch full profile data ---
    const { data: profiles } = await supabase.from('profiles').select('*').eq('id', user.id)
    const { data: careerRoles } = await supabase.from('career_roles').select('*').eq('user_id', user.id)
    const { data: applications } = await supabase.from('applications').select('*').eq('user_id', user.id)
    const { data: experiences } = await supabase.from('experiences').select('*').eq('user_id', user.id)
    const { data: projects } = await supabase.from('projects').select('*').eq('user_id', user.id)
    const { data: certifications } = await supabase.from('certifications').select('*').eq('user_id', user.id)

    const profile = profiles?.[0]

    const trunc = (s: unknown, max: number) => String(s ?? '').slice(0, max);

    // --- Determine job search stage from tracker data ---
    const totalApplications = (applications || []).length
    const activeApplications = (applications || []).filter(a => a.status !== 'rejected')
    const interviewingApplications = (applications || []).filter(a => a.status === 'interviewing')
    const lateStageApplications = (applications || []).filter(a => a.interview_stage === 'final_round')
    const noResponseApplications = (applications || []).filter(a => a.status === 'applied')

    let jobSearchStage = 'not_started'
    if (lateStageApplications.length > 0) jobSearchStage = 'late_stage_no_offer'
    else if (interviewingApplications.length > 0) jobSearchStage = 'active_interviewing'
    else if (noResponseApplications.length >= 3) jobSearchStage = 'applying_no_response'
    else if (totalApplications > 0) jobSearchStage = 'early_search'
    else if (profile?.employment_status === 'employed') jobSearchStage = 'transitioning_while_employed'

    // --- Build sanitised user data ---
    const sanitisedProfile = {
      full_name: trunc(profile?.full_name, 100),
      skills: (profile?.skills || []).slice(0, 50).map((s: unknown) => trunc(s, 60)),
      five_year_role: trunc(profile?.five_year_role, 100),
      target_job_titles: (profile?.target_job_titles || []).slice(0, 10).map((t: unknown) => trunc(t, 100)),
      employment_status: trunc(profile?.employment_status, 50),
      biggest_challenge: trunc(profile?.biggest_challenge, 300),
      role_clarity_score: profile?.role_clarity_score ?? null,
      cv_tailoring_strategy: trunc(profile?.cv_tailoring_strategy, 100),
      linkedin_outreach_strategy: trunc(profile?.linkedin_outreach_strategy, 100),
      skill_gaps: (profile?.skill_gaps || []).slice(0, 20).map((s: unknown) => trunc(s, 100)),
      location: trunc(profile?.location, 100),
    }

    const sanitisedExperiences = (experiences || []).slice(0, 10).map((e: any) => ({
      title: trunc(e.title, 100),
      company: trunc(e.company, 100),
      responsibilities: trunc(e.responsibilities, 300),
      skills_used: (e.skills_used || []).slice(0, 20).map((s: unknown) => trunc(s, 60)),
      type: trunc(e.type, 50),
    }))

    const sanitisedProjects = (projects || []).slice(0, 10).map((p: any) => ({
      name: trunc(p.name, 100),
      description: trunc(p.description, 200),
      skills_demonstrated: (p.skills_demonstrated || []).slice(0, 10).map((s: unknown) => trunc(s, 60)),
    }))

    const sanitisedCerts = (certifications || []).slice(0, 10).map((c: any) => ({
      name: trunc(c.name, 100),
      issuer: trunc(c.issuer, 100),
    }))

    const sanitisedRoles = (careerRoles || []).slice(0, 6).map((r: any) => ({
      title: trunc(r.title, 100),
      tier: trunc(r.tier, 20),
      readiness_score: r.readiness_score ?? null,
      missing_skills: (r.missing_skills || []).slice(0, 10).map((s: unknown) => trunc(s, 60)),
    }))

    const sanitisedApplications = activeApplications.slice(0, 10).map((a: any) => ({
      role_title: trunc(a.role_title, 100),
      company: trunc(a.company, 100),
      status: trunc(a.status, 50),
      interview_stage: trunc(a.interview_stage, 50),
    }))

    // --- Build System Prompt with Library Context ---
    const systemPrompt = `You are a Task Generation Engine for the "Get A Job" Career Operating System.

You have access to the following logic libraries. Use them as your source of truth when generating tasks ΓÇö do not invent task types, categories, or priorities outside of what these libraries define.

TASK GENERATION LOGIC (use these rules to generate stage-aware, personalized tasks):
${JSON.stringify(taskGenerationLogic, null, 2)}

COURSE RECOMMENDATION LOGIC (use this when deciding whether to recommend a course or project task):
${JSON.stringify(courseRecommendationLogic, null, 2)}

JOB SEARCH STAGE LOGIC (use this to understand what stage the user is in and what tasks are most relevant):
${JSON.stringify(jobSearchStageLogic, null, 2)}

ROLE LIBRARY (use to ensure tasks reference real, standardized role titles):
${JSON.stringify(roleLibrary, null, 2)}

ROLE-SKILL MAPPING (use to identify which skills are most important to close for each target role):
${JSON.stringify(roleSkillMapping, null, 2)}

TASK GENERATION RULES:
- Always determine the user's job_search_stage first ΓÇö it drives which tasks are most relevant
- Tasks must be real and immediately actionable ΓÇö not vague or generic
- Tasks must be personalized to this specific user's profile, gaps, and behavior
- Mix quick wins with high-impact actions ΓÇö never all easy or all hard
- Maximum 5-8 tasks total ΓÇö do not overwhelm
- If the user shows overwhelm signals (low clarity score, low activity), limit to 3 top-priority tasks
- Only recommend course tasks for structured skill gaps (technical, tools, frameworks) ΓÇö not behavioral gaps
- Always end with at least one networking or application task unless the user is in interview stage
- Use the task structure format exactly: task_title, task_description, suggested_specific_action, reason, category, priority

TASK CATEGORIES (use exactly these):
- application ΓÇö applying to roles, finding opportunities
- cv ΓÇö CV improvement, tailoring, updating
- skill ΓÇö learning a specific skill, taking a course
- project ΓÇö building something to demonstrate a skill
- networking ΓÇö outreach, referrals, relationship building
- interview_prep ΓÇö preparing for an upcoming interview (only if active interviews exist)
- clarity_positioning ΓÇö defining direction, updating LinkedIn, positioning work

PRIORITY LEVELS:
- urgent_now ΓÇö blocking job search, time-sensitive, critical next step
- this_week ΓÇö important but not blocking, momentum-building
- longer_term ΓÇö skill building, strategic positioning`

    const userPrompt = `USER PROFILE:
- Name: ${sanitisedProfile.full_name || 'Not provided'}
- Employment Status: ${sanitisedProfile.employment_status || 'Not provided'}
- Location: ${sanitisedProfile.location || 'Not provided'}
- 5-Year Goal: ${sanitisedProfile.five_year_role || 'Not provided'}
- Target Job Titles: ${JSON.stringify(sanitisedProfile.target_job_titles)}
- Skills: ${JSON.stringify(sanitisedProfile.skills)}
- Skill Gaps: ${JSON.stringify(sanitisedProfile.skill_gaps)}
- Biggest Challenge: ${sanitisedProfile.biggest_challenge || 'Not provided'}
- Role Clarity Score: ${sanitisedProfile.role_clarity_score ?? 'Not provided'} (1=no idea, 5=very clear)
- CV Tailoring Strategy: ${sanitisedProfile.cv_tailoring_strategy || 'Not provided'}
- LinkedIn Outreach Behavior: ${sanitisedProfile.linkedin_outreach_strategy || 'Not provided'}

CAREER ROLES (tiered role recommendations):
${JSON.stringify(sanitisedRoles)}

EXPERIENCES:
${JSON.stringify(sanitisedExperiences)}

PROJECTS:
${JSON.stringify(sanitisedProjects)}

CERTIFICATIONS:
${JSON.stringify(sanitisedCerts)}

JOB SEARCH ACTIVITY:
- Total Applications: ${totalApplications}
- Active Applications: ${activeApplications.length}
- Currently Interviewing: ${interviewingApplications.length}
- Late Stage (Final Round): ${lateStageApplications.length}
- Applied with No Response: ${noResponseApplications.length}
- Detected Job Search Stage: ${jobSearchStage}
- Active Applications Detail: ${JSON.stringify(sanitisedApplications)}

CONTEXT: ${safeContext || 'weekly action plan'}

TASK:
Using the task generation logic and job search stage logic from your system prompt, generate a personalized set of tasks for this user.

Steps:
1. Confirm the user's job_search_stage based on their tracker activity
2. Identify the biggest blocking factor right now
3. Identify the most urgent skill gaps relative to their Tier 1 target roles
4. Generate tasks that directly address the stage + gaps + behavior
5. Assign priorities based on what is most blocking right now
6. Apply overwhelm handling if clarity score is low or activity is low

Return a JSON object:
{
  "detected_stage": "string (the job search stage you detected)",
  "tasks": [
    {
      "title": "string (short, actionable task title)",
      "description": "string (what to do ΓÇö 1-2 sentences)",
      "suggested_specific_action": "string (concrete example of how to do it)",
      "reason": "string (why this matters right now for this specific user)",
      "category": "application|cv|skill|project|networking|interview_prep|clarity_positioning",
      "priority": "urgent_now|this_week|longer_term",
      "role_title": "string (target role this relates to, if any ΓÇö use exact title from role library)"
    }
  ]
}

Return ONLY valid JSON. Generate 5-8 tasks unless overwhelm signals are present, in which case limit to 3.`

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(45000),
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.4,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      }),
    })

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text()
      await serviceClient.rpc('log_error', {
        p_user_id: user.id,
        p_function_name: 'generate-tasks',
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
      result = JSON.parse(completion.choices?.[0]?.message?.content || '{"tasks":[]}');
    } catch {
      return new Response(JSON.stringify({ error: 'AI returned an invalid response format. Please try again.' }), {
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
        p_function_name: 'generate-tasks',
        p_error_message: error.message,
        p_error_details: null,
      })
    } catch { /* best-effort logging */ }
    return new Response(JSON.stringify({ error: 'An unexpected error occurred.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
