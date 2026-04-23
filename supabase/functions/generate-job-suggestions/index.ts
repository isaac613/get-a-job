import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { roleLibrary } from './shared/libraries/00_role_library.ts'
import { roleSkillMapping } from './shared/libraries/04_role_skill_mapping.ts'
import { fitScoringLogic } from './shared/libraries/05_fit_scoring_logic.ts'
import { tierLogic } from './shared/libraries/06_tier_logic.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
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

    // 1. Fetch user data
    const { data: profiles } = await supabase.from('profiles').select('*').eq('id', user.id)
    const { data: experiences } = await supabase.from('experiences').select('*').eq('user_id', user.id)
    const profile = profiles?.[0]

    if (!profile) {
      return new Response(JSON.stringify({ error: 'No profile found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const trunc = (s: unknown, max: number) => String(s ?? '').slice(0, max)
    const targetTitles: string[] = profile.target_job_titles || []
    const fallbackTitle: string = profile.five_year_role || profile.field_of_study || 'Software Developer'

    // Build a smart JSearch query — combine up to 2 target titles so the search is broader
    const primaryTargets = targetTitles.slice(0, 2)
    const searchQuery = primaryTargets.length > 0
      ? primaryTargets.join(' OR ')
      : fallbackTitle

    // 2. Fetch live jobs from JSearch (RapidAPI)
    let liveJobs: any[] = []
    const jsearchKey = Deno.env.get('RAPIDAPI_KEY') || Deno.env.get('JSEARCH_API_KEY')
    if (jsearchKey) {
      try {
        const jsearchRes = await fetch(
          `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(searchQuery)}&num_pages=1`,
          {
            headers: {
              'X-RapidAPI-Key': jsearchKey,
              'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
            },
            signal: AbortSignal.timeout(10000),
          }
        )
        if (jsearchRes.ok) {
          const jData = await jsearchRes.json()
          liveJobs = (jData.data || []).slice(0, 10).map((job: any) => ({
            id: job.job_id,
            title: job.job_title,
            company: job.employer_name,
            description: job.job_description,
            location: `${job.job_city || ''}, ${job.job_state || ''}`.replace(/^, | , $/g, '').trim(),
            job_url: job.job_apply_link,
            salary_min: job.job_min_salary,
            salary_max: job.job_max_salary,
          }))
        } else {
          console.warn('JSearch failed:', await jsearchRes.text())
        }
      } catch (err) {
        console.error('JSearch error:', err)
      }
    }

    // 3. Scoped library lookup — only match roles relevant to the user's targets
    // Never dump the full role library into the prompt (it's 382 KB and biased toward CS/ops roles)
    const allTargetStrings = [...targetTitles, fallbackTitle]
    const targetTitlesLower = allTargetStrings.map(t => t.toLowerCase())

    const matchedRoles = (roleLibrary.roles as any[]).filter(role => {
      const titleLower = (role.standardized_title as string).toLowerCase()
      const altLower = ((role.alternate_titles as string[]) || []).map(t => t.toLowerCase())
      return targetTitlesLower.some(t =>
        titleLower.includes(t) || t.includes(titleLower) ||
        altLower.some(a => a.includes(t) || t.includes(a))
      )
    }).slice(0, 10)

    const matchedRoleIds = new Set(matchedRoles.map((r: any) => r.id))
    const matchedSkillMappings = (roleSkillMapping.role_skill_mapping as any[]).filter(
      m => matchedRoleIds.has(m.role_id)
    )

    const hasLibraryMatch = matchedRoles.length > 0

    // 4. Build prompts
    const librarySection = hasLibraryMatch
      ? 'MATCHED ROLES FROM LIBRARY (roles in our taxonomy that align with user\'s stated targets):\n' +
        JSON.stringify(matchedRoles, null, 2) +
        '\n\nROLE-SKILL MAPPINGS FOR MATCHED ROLES:\n' +
        JSON.stringify(matchedSkillMappings, null, 2)
      : 'NOTE: The user\'s target roles are outside the standard taxonomy (likely software/engineering/AI). Use your own knowledge to evaluate match quality and generate generic suggestions — do NOT suggest roles from unrelated fields like Customer Success or Operations.'

    const systemPrompt = [
      'You are the Get-A-Job Smart Match Engine. Your job is to score live job listings against a user\'s profile and generate personalised role recommendations.',
      '',
      'SCORING LOGIC (always apply these when computing match scores):',
      JSON.stringify(fitScoringLogic, null, 2),
      '',
      'TIER LOGIC (use to assign tier_1 / tier_2):',
      JSON.stringify(tierLogic, null, 2),
      '',
      librarySection,
      '',
      'RULES:',
      '- match_score must be a number 0-100. Use the fit scoring weights: core skills 60%, secondary 30%, differentiator 10%.',
      '- Only score jobs that genuinely align with the user\'s target domain. Do not suggest a CS job to a software developer.',
      '- For generic_suggestions: recommend roles the user is realistically ready for based on their actual skills — not roles that are easiest to fill from a library.',
      '- match_reason must reference specific skills from the user\'s profile, not generic statements.',
    ].join('\n')

    const userPrompt = `USER PROFILE:
- Target Roles: ${JSON.stringify(targetTitles)}
- 5-Year Goal: ${trunc(profile.five_year_role, 100) || 'Not provided'}
- Skills: ${JSON.stringify((profile.skills || []).slice(0, 50))}
- Summary: ${trunc(profile.summary, 300) || 'Not provided'}
- Experience Titles: ${JSON.stringify((experiences || []).slice(0, 10).map((e: any) => trunc(e.title, 80)))}
- Education: ${trunc(profile.degree, 80)} in ${trunc(profile.field_of_study, 80)} (${trunc(profile.education_level, 40)})

LIVE JOBS TO SCORE:
${JSON.stringify(liveJobs.map(j => ({
  id: j.id,
  title: j.title,
  company: j.company,
  location: j.location,
  snippet: trunc(j.description, 300),
})
))}

TASK:
1. Score each live job against the user's profile using the fit scoring weights. Keep only jobs that align with the user's target domain (score >= 40).
2. Select up to 4 best-matching live jobs and assign each a tier.
3. Generate 2-3 generic role suggestions the user should be searching for — based on their skills and stated targets, NOT defaulting to the library taxonomy if it doesn't match.

Return ONLY valid JSON:
{
  "live_suggestions": [
    {
      "id": "string (exact job id from input)",
      "title": "string",
      "company": "string",
      "tier": "tier_1|tier_2",
      "match_score": number (0-100),
      "matched_skills": ["skill1"],
      "missing_skills": ["skill1"],
      "match_reason": "string (1-2 sentences referencing specific skills)",
      "job_url": "string",
      "location": "string",
      "salary_min": number|null,
      "salary_max": number|null
    }
  ],
  "generic_suggestions": [
    {
      "title": "string",
      "tier": "tier_1|tier_2",
      "expected_match_score": number (0-100),
      "key_skills_to_highlight": ["skill1"],
      "why_good_fit": "string"
    }
  ],
  "message": "string (brief summary)"
}`

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(45000),
    })

    if (!openaiResponse.ok) {
      return new Response(JSON.stringify({ error: 'AI service error', details: await openaiResponse.text() }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const completion = await openaiResponse.json()
    let result: any
    try {
      result = JSON.parse(completion.choices?.[0]?.message?.content || '{}')
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid AI JSON' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Merge original job data back into AI suggestions (preserves job_url, salary, etc.)
    if (Array.isArray(result.live_suggestions)) {
      result.live_suggestions = result.live_suggestions.map((sug: any) => {
        const original = liveJobs.find(j => j.id === sug.id || j.title === sug.title)
        return original ? { ...original, ...sug } : sug
      })
    }

    // 5. Cache to DB using serviceClient (bypasses RLS)
    const now = new Date().toISOString()
    try {
      await serviceClient.from('job_suggestions').delete().eq('user_id', user.id)

      const liveRows = (result.live_suggestions || []).map((s: any) => ({
        user_id: user.id,
        suggestion_type: 'live',
        title: String(s.title || '').slice(0, 500),
        company: String(s.company || '').slice(0, 500),
        location: String(s.location || '').slice(0, 500),
        salary_min: s.salary_min || null,
        salary_max: s.salary_max || null,
        description_snippet: String(s.description || s.match_reason || '').slice(0, 2000),
        job_url: String(s.job_url || '').slice(0, 2000),
        match_score: typeof s.match_score === 'number' ? Math.round(s.match_score) : null,
        match_reason: String(s.match_reason || '').slice(0, 2000),
        matched_skills: Array.isArray(s.matched_skills) ? s.matched_skills : [],
        missing_skills: Array.isArray(s.missing_skills) ? s.missing_skills : [],
        fetched_at: now,
      }))

      const genericRows = (result.generic_suggestions || []).map((s: any) => ({
        user_id: user.id,
        suggestion_type: 'generic',
        title: String(s.title || '').slice(0, 500),
        company: '',
        location: '',
        salary_min: null,
        salary_max: null,
        description_snippet: String(s.why_good_fit || '').slice(0, 2000),
        job_url: '',
        match_score: typeof s.expected_match_score === 'number'
          ? Math.round(s.expected_match_score)
          : (s.tier === 'tier_1' ? 80 : 55),
        match_reason: String(s.why_good_fit || '').slice(0, 2000),
        matched_skills: Array.isArray(s.key_skills_to_highlight) ? s.key_skills_to_highlight : [],
        missing_skills: [],
        fetched_at: now,
      }))

      const allRows = [...liveRows, ...genericRows]
      if (allRows.length > 0) {
        const { error: insertError } = await serviceClient.from('job_suggestions').insert(allRows)
        if (insertError) console.error('Could not cache suggestions:', insertError)
      }
    } catch (e) {
      console.error('Cache write error:', e)
    }

    return new Response(JSON.stringify({
      suggestions: result.live_suggestions || [],
      generic_suggestions: result.generic_suggestions || [],
      message: result.message || null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('Edge function error:', error)
    return new Response(JSON.stringify({ error: 'An unexpected error occurred.', msg: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
