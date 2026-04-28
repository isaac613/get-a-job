import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Source-controlled in commit fixing H1-H4. The deployed function previously
// existed only in the dashboard — this file imports it back into the repo
// alongside two behavioural fixes:
//
// 1. (H2) prompt now requests matched_requirements/missing_requirements as
//    arrays of {requirement, reason} / {requirement, gap} objects so the
//    JobMatchChecker.jsx renderer (which dereferences .requirement and
//    .reason / .gap on each item) actually displays content instead of
//    blanks with literal " — " separators.
//
// 2. (H3) URL-only mode (no pasted job_description) now returns an explicit
//    400 instead of letting the LLM hallucinate a fake job posting. Edge
//    runtimes can't fetch most job-board pages (auth walls, JS rendering,
//    bot protection) and the previous "inform the user you need text" prompt
//    instruction was unreliable — gpt-4o-mini frequently fabricated rather
//    than refused.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'gpt-4o-mini'

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

    const authHeader = req.headers.get('Authorization')!
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

    const { job_description, job_url, mode } = await req.json()

    if (!job_description && !job_url) {
      return new Response(JSON.stringify({ error: 'job_description or job_url is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // H3: refuse URL-only requests rather than fabricating analysis.
    if (mode === 'url' && !job_description) {
      return new Response(JSON.stringify({
        error: "Can't fetch job posting URLs (most boards require login). Please paste the job description text instead.",
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: profiles } = await supabase.from('profiles').select('*').eq('id', user.id)
    const { data: experiences } = await supabase.from('experiences').select('*').eq('user_id', user.id)
    const profile = profiles?.[0]

    const userSkills = (profile?.skills || []).join(', ')
    const expSummary = (experiences || []).map((e: any) => `${e.title} at ${e.company}`).join(', ')
    const fiveYearRole = profile?.five_year_role || ''
    const primaryDomain = profile?.primary_domain || ''
    const qualLevel = profile?.qualification_level || ''
    const hasGoal = !!fiveYearRole.trim()

    // When the user has a 5-year goal, ask the LLM for a goal_alignment_score
    // alongside match_score so the tracker can derive tier from BOTH signals
    // (mirrors assignTierWithGoal in generate-career-analysis). Without this,
    // a high-fit-but-off-path role like an SDR scored 0.75 for a Product
    // Manager target and was wrongly assigned tier_1.
    const goalBlock = hasGoal
      ? `\nUSER CAREER TARGET:
- 5-year goal: ${fiveYearRole}
- Current domain: ${primaryDomain || 'unspecified'}
- Current level: ${qualLevel || 'unspecified'}\n`
      : ''

    const goalSchemaLine = hasGoal
      ? `\n  "goal_alignment_score": number (0-100, how well pursuing this role progresses the user toward their 5-year goal — see rubric below),`
      : ''

    const goalRubric = hasGoal
      ? `\n\nGOAL ALIGNMENT RUBRIC (0-100): Score how much pursuing this role would advance the user toward their 5-year goal of "${fiveYearRole}".
- 80-100: Direct stepping stone — same role family, or a well-known transfer path that builds the exact skills/experience the goal role demands.
- 60-79: Adjacent role that develops a meaningful subset of goal-relevant skills; transition would still be plausible.
- 40-59: Tangentially useful — some transferable skills, but not a recognised path; would require a deliberate pivot later.
- 20-39: Unrelated — pursuing it would pull the user sideways and add little goal-relevant signal to their CV.
- 0-19: Actively contradicts the trajectory (e.g. an SDR/sales role for a Product Manager target — different function, different career ladder).
Do NOT conflate "the user could do this job" with "this job moves them toward Product/Marketing/etc." Match score and goal alignment are independent signals.`
      : ''

    const prompt = `You are a Job Match Analyzer for the "Get A Job" Career Operating System.

JOB DESCRIPTION:
${job_description}

USER PROFILE:
- Skills: ${userSkills || 'Not provided'}
- Experience: ${expSummary || 'Not provided'}
- Education: ${profile?.degree || ''} in ${profile?.field_of_study || ''}
- Summary: ${profile?.summary || 'Not provided'}${goalBlock}
ANALYZE the job posting against the user's profile and return a JSON object with EXACTLY this schema:
{
  "job_title": "string (extracted from posting)",
  "company": "string (extracted from posting)",
  "job_description": "string (brief summary of the role)",
  "match_score": number (0-100, how well the user matches THIS JOB's requirements — pure fit, ignore career trajectory),${goalSchemaLine}
  "verdict": "string (1-2 sentence overall assessment)",
  "matched_requirements": [
    { "requirement": "the requirement from the JD", "reason": "specific evidence from the user's profile that they meet it (cite their skill, experience, or education)" }
  ],
  "missing_requirements": [
    { "requirement": "the requirement from the JD", "gap": "what's missing and how big the gap is (e.g. needs 1 specific course, needs 2 years more experience)" }
  ],
  "recommendation": "string (actionable advice for improving their candidacy)",
  "source_url": "${job_url || ''}"
}

Each item in matched_requirements MUST be an object with both "requirement" and "reason" keys.
Each item in missing_requirements MUST be an object with both "requirement" and "gap" keys.
Do NOT return arrays of plain strings.

Do not invent specific statistics, study citations, or company-specific interview practices. Cite only the user's stated profile data and the job description text.${goalRubric}

Return ONLY valid JSON.`

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      }),
    })

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text()
      // D2 — keep upstream detail server-side only; client gets generic message.
      // Raw OpenAI error bodies can include API key fragments, internal paths,
      // schema info, or rate limit metadata that shouldn't reach the browser.
      console.error(`[analyze-job-match] OpenAI ${openaiResponse.status}: ${errText}`)
      return new Response(JSON.stringify({ error: 'AI service temporarily unavailable. Please try again.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const completion = await openaiResponse.json()
    const result = JSON.parse(completion.choices?.[0]?.message?.content || '{}')

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
