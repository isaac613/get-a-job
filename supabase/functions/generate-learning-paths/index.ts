import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const MODEL = 'gpt-4o-mini'
const RATE_LIMIT_CALLS = 10
const RATE_LIMIT_WINDOW = 3600

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
      p_function_name: 'generate-learning-paths',
      p_max_calls: RATE_LIMIT_CALLS,
      p_window_seconds: RATE_LIMIT_WINDOW,
    })
    if (allowed === false) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again in an hour.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse request body defensively
    const rawBody = await req.text()
    if (rawBody.length > 50_000) {
      return new Response(JSON.stringify({ error: 'Request payload too large.' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    let body: Record<string, unknown> = {}
    if (rawBody.trim().length > 0) {
      try { body = JSON.parse(rawBody) } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }
    const skill_gaps = Array.isArray(body.skill_gaps) ? body.skill_gaps : undefined
    const target_roles = Array.isArray(body.target_roles) ? body.target_roles : undefined

    // Fetch user data for context
    const [{ data: profiles }, { data: careerRoles }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id),
      supabase.from('career_roles').select('*').eq('user_id', user.id),
    ])

    const profile = profiles?.[0]
    const roles: string[] = (target_roles && target_roles.length ? target_roles : (careerRoles || []).map((r: any) => r.title))
      .filter((x: any) => typeof x === 'string')
    const gaps: string[] = (skill_gaps && skill_gaps.length ? skill_gaps : (careerRoles || []).flatMap((r: any) => r.skills_gap || []))
      .filter((x: any) => typeof x === 'string')

    // Guardrail: if there are no gaps at all, return an empty set — don't bother the LLM.
    if (gaps.length === 0) {
      return new Response(JSON.stringify({ learning_paths: [], courses: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const trunc = (s: unknown, max: number) => String(s ?? '').slice(0, max)
    const profileSkills = (profile?.skills || []).slice(0, 50).map((s: unknown) => trunc(s, 60))
    const safeGaps = gaps.slice(0, 8).map(s => trunc(s, 80))
    const safeRoles = roles.slice(0, 10).map(s => trunc(s, 100))

    const prompt = `You are a Learning Path Generator for the "Get A Job" Career Operating System.

USER CONTEXT:
- Current Skills: ${JSON.stringify(profileSkills)}
- Skill Gaps: ${JSON.stringify(safeGaps)}
- Target Roles: ${safeRoles.join(', ') || 'General career development'}
- Education: ${trunc(profile?.degree, 100)} in ${trunc(profile?.field_of_study, 100)}

TASK: Generate learning paths to help close the user's skill gaps and prepare for their target roles.

For each skill gap, recommend:
- Specific free or affordable courses (prioritize: Coursera, Udemy, freeCodeCamp, YouTube, edX)
- A capstone project idea that proves the skill
- Estimated time commitment

KEEP RESPONSES COMPACT so the JSON fits. Return EXACTLY 1 resource per skill — not 2, not more. Keep ALL strings under 100 characters each.

Return a JSON object with this exact shape:
{
  "learning_paths": [
    {
      "skill": "string (the skill gap)",
      "why_important": "string (1 sentence)",
      "resources": [
        {
          "title": "string",
          "platform": "string",
          "url": "string (actual course URL if known, or search URL)",
          "type": "course|tutorial|book|project",
          "time_commitment": "string (e.g. '4 hours', '2 weeks')"
        }
      ],
      "capstone_project": {
        "title": "string",
        "description": "string (1–2 sentences)",
        "why_it_proves": "string (1 sentence)"
      }
    }
  ]
}

Return ONLY valid JSON.`

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(55000),
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    })

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text()
      return new Response(JSON.stringify({ error: 'AI service error', details: errText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const completion = await openaiResponse.json()
    const rawContent = completion.choices?.[0]?.message?.content ?? ''
    const finishReason = completion.choices?.[0]?.finish_reason ?? 'unknown'

    // If the model got truncated by max_tokens, JSON.parse will fail. Surface a clear error.
    if (finishReason === 'length') {
      return new Response(JSON.stringify({
        error: 'Your learning plan was too long to generate in one pass. Reduce the number of skill gaps and try again.',
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let result: { learning_paths?: unknown } = { learning_paths: [] }
    try {
      result = JSON.parse(rawContent || '{"learning_paths":[]}')
    } catch (parseErr) {
      console.error('[learning-paths] JSON.parse failed:', (parseErr as Error).message)
      return new Response(JSON.stringify({ error: 'AI returned an invalid response format. Please try again.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!Array.isArray(result.learning_paths)) result.learning_paths = []

    // Synthesize the flat `courses` array from learning_paths so existing
    // consumers (e.g. SkillGapCourses.jsx) keep working without asking the
    // LLM to emit the duplicate structure.
    const flatCourses: any[] = [];
    for (const lp of (result.learning_paths as any[])) {
      for (const r of (lp?.resources || [])) {
        flatCourses.push({
          skill_gap: lp?.skill || '',
          course_title: r?.title || '',
          platform: r?.platform || '',
          description: r?.type ? `${r.type}: ${r?.title || ''}` : (r?.title || ''),
          time_commitment: r?.time_commitment || '',
          relevance: lp?.why_important || '',
        });
      }
    }
    const responseBody = { learning_paths: result.learning_paths, courses: flatCourses };

    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = (error as Error)?.message || String(error)
    console.error('generate-learning-paths error:', message, (error as Error)?.stack)
    return new Response(JSON.stringify({ error: message || 'An unexpected error occurred.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
