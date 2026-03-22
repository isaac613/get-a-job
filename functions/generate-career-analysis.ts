import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again in an hour.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { profile_data, dream_roles } = body

    const { data: profiles } = await supabase.from('profiles').select('*').eq('id', user.id)
    const { data: experiences } = await supabase.from('experiences').select('*').eq('user_id', user.id)
    const { data: projects } = await supabase.from('projects').select('*').eq('user_id', user.id)
    const { data: certifications } = await supabase.from('certifications').select('*').eq('user_id', user.id)

    const profile = profile_data || profiles?.[0]
    if (!profile) {
      return new Response(JSON.stringify({ error: 'No profile found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const prompt = `You are a Career Analysis Engine for the "Get A Job" Career Operating System.

USER PROFILE:
- Name: ${profile.full_name || 'Not provided'}
- Skills: ${JSON.stringify(profile.skills || [])}
- Education: ${profile.degree || ''} in ${profile.field_of_study || ''} (${profile.education_level || ''})
- Summary: ${profile.summary || 'Not provided'}
- Experiences: ${JSON.stringify((experiences || []).map(e => ({ title: e.title, company: e.company, responsibilities: e.responsibilities, skills_used: e.skills_used })))}
- Projects: ${JSON.stringify((projects || []).map(p => ({ name: p.name, description: p.description, skills_demonstrated: p.skills_demonstrated })))}
- Certifications: ${JSON.stringify((certifications || []).map(c => ({ name: c.name, issuer: c.issuer })))}
${dream_roles?.length ? `- Dream Roles: ${dream_roles.join(', ')}` : ''}

TASK: Analyze the user's profile and generate a career analysis with tiered role recommendations.

For each recommended role, categorize into tiers:
- tier_1: Roles they can apply for NOW (>60% readiness)
- tier_2: Roles achievable with 3-6 months upskilling (30-60% readiness)
- tier_3: Stretch goals requiring significant development (<30% readiness)

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
      "reasoning": "string (why this tier)",
      "action_items": ["action1", "action2"],
      "alignment_to_goal": "string"
    }
  ]
}

Return ONLY valid JSON. Include 4-6 roles spanning all tiers.`

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
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
      return new Response(JSON.stringify({ error: 'AI service error', details: errText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const completion = await openaiResponse.json()
    const result = JSON.parse(completion.choices?.[0]?.message?.content || '{}')

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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
