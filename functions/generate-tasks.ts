import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again in an hour.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { context } = await req.json()
    if (context !== undefined && typeof context !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid context field.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const VALID_CONTEXTS = ['weekly action plan', 'onboarding initial tasks'];
    const safeContext = (typeof context === 'string' && VALID_CONTEXTS.includes(context)) ? context : null;

    const { data: profiles } = await supabase.from('profiles').select('*').eq('id', user.id)
    const { data: careerRoles } = await supabase.from('career_roles').select('*').eq('user_id', user.id)
    const { data: applications } = await supabase.from('applications').select('*').eq('user_id', user.id)
    const { data: experiences } = await supabase.from('experiences').select('*').eq('user_id', user.id)

    const profile = profiles?.[0]
    const activeApplications = (applications || []).filter(a => a.status !== 'rejected').length

    const trunc = (s: unknown, max: number) => String(s ?? '').slice(0, max);
    const safeSkills = (profile?.skills || []).slice(0, 50).map((s: unknown) => trunc(s, 60));
    const safeRoles = (careerRoles || []).slice(0, 10).map(r => trunc(r.title, 100)).join(', ') || 'Not set';
    const safeExperiences = (experiences || []).slice(0, 10)
      .map(e => `${trunc(e.title, 100)} at ${trunc(e.company, 100)}`).join(', ') || 'None';

    const prompt = `You are a Task Generation Engine for the "Get A Job" Career Operating System.

USER PROFILE:
- Skills: ${JSON.stringify(safeSkills)}
- Target Roles: ${safeRoles}
- Active Applications: ${activeApplications}
- Experience: ${safeExperiences}
${safeContext ? `- Additional Context: ${safeContext}` : ''}

TASK: Generate a personalised weekly action plan of 5-8 tasks. Tasks should be:
- Specific and actionable
- Prioritized (high/medium/low)
- Categorized (application, cv, skill, project, networking)
- Related to the user's career goals and current situation

Return a JSON object:
{
  "tasks": [
    {
      "title": "string",
      "description": "string (1-2 sentences)",
      "category": "application|cv|skill|project|networking",
      "priority": "high|medium|low",
      "role_title": "string (target role this relates to, if any)"
    }
  ]
}

Return ONLY valid JSON.`

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 1024,
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
