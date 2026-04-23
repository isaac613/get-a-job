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
const RATE_LIMIT_CALLS = 10
const RATE_LIMIT_WINDOW = 3600

// Map a free-text location string to a JSearch ISO country code.
// JSearch defaults to the US when no country is given — wrong for non-US users.
function locationToCountryCode(loc: string | null | undefined): string {
  const s = String(loc ?? '').toLowerCase()
  if (!s) return 'us'
  if (s.includes('israel')) return 'il'
  if (s.includes('united kingdom') || s.includes(' uk') || s.endsWith(' uk')) return 'gb'
  if (s.includes('germany')) return 'de'
  if (s.includes('france')) return 'fr'
  if (s.includes('netherlands')) return 'nl'
  if (s.includes('spain')) return 'es'
  if (s.includes('canada')) return 'ca'
  if (s.includes('australia')) return 'au'
  if (s.includes('india')) return 'in'
  if (s.includes('ireland')) return 'ie'
  if (s.includes('singapore')) return 'sg'
  return 'us'
}

// Resolve an Israeli city to its metro/region label so JSearch queries use
// the hub name (which indices actually contain), not the specific town.
// Tel Aviv & Central districts are treated as one market (Gush Dan / Merkaz).
const IL_METRO_CITIES: Record<string, string> = {
  // Tel Aviv & Central
  'tel aviv': 'Tel Aviv', 'ramat gan': 'Tel Aviv', 'bnei brak': 'Tel Aviv',
  'holon': 'Tel Aviv', 'bat yam': 'Tel Aviv', 'herzliya': 'Tel Aviv',
  'petah tikva': 'Tel Aviv', "petach tikva": 'Tel Aviv', "ra'anana": 'Tel Aviv',
  'raanana': 'Tel Aviv', 'kfar saba': 'Tel Aviv', 'netanya': 'Tel Aviv',
  'rishon lezion': 'Tel Aviv', "rishon le zion": 'Tel Aviv', 'rehovot': 'Tel Aviv',
  'hod hasharon': 'Tel Aviv', "modi'in": 'Tel Aviv', 'modiin': 'Tel Aviv',
  // Haifa
  'haifa': 'Haifa', 'yokneam': 'Haifa', 'caesarea': 'Haifa', 'krayot': 'Haifa',
  // Jerusalem
  'jerusalem': 'Jerusalem',
  // North
  'nazareth': 'Nazareth', 'karmiel': 'Nazareth', 'tiberias': 'Nazareth',
  'galilee': 'Nazareth', 'golan': 'Nazareth',
  // South
  'beer sheva': 'Beer Sheva', "be'er sheva": 'Beer Sheva',
  'ashdod': 'Beer Sheva', 'ashkelon': 'Beer Sheva', 'eilat': 'Beer Sheva',
};

// Given a free-text location like "Herzliya, Israel", return the resolved metro
// (e.g. "Tel Aviv"). Returns null if we don't have a mapping.
function resolveIsraeliMetro(loc: string): string | null {
  const s = loc.toLowerCase()
  for (const [city, metro] of Object.entries(IL_METRO_CITIES)) {
    if (s.includes(city)) return metro
  }
  return null
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
      p_function_name: 'generate-job-suggestions',
      p_max_calls: RATE_LIMIT_CALLS,
      p_window_seconds: RATE_LIMIT_WINDOW,
    })
    if (allowed === false) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again in an hour.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse body defensively — currently only used for force_refresh from the frontend
    const rawBody = await req.text()
    if (rawBody.length > 10_000) {
      return new Response(JSON.stringify({ error: 'Request payload too large.' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (rawBody.trim().length > 0) {
      try { JSON.parse(rawBody) } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // 1. Fetch user data
    const { data: profiles } = await supabase.from('profiles').select('*').eq('id', user.id)
    const { data: experiences } = await supabase.from('experiences').select('*').eq('user_id', user.id)
    const profile = profiles?.[0]

    if (!profile) {
      return new Response(JSON.stringify({ error: 'No profile found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userLocation: string = (profile.location || '').trim()
    const countryCode = locationToCountryCode(userLocation)

    const trunc = (s: unknown, max: number) => String(s ?? '').slice(0, max)
    const targetTitles: string[] = profile.target_job_titles || []
    const fallbackTitle: string = profile.five_year_role || profile.field_of_study || 'Software Developer'

    // Primary role term — prefer first explicit target, fall back to five_year_role.
    // If it's a single very short word like "product", pad it so it reads like a job title.
    const rawRoleTerm = (targetTitles[0] || fallbackTitle).trim()
    const roleTerm = (rawRoleTerm.length > 0 && rawRoleTerm.split(/\s+/).length === 1 && rawRoleTerm.length <= 10)
      ? `${rawRoleTerm} manager`
      : rawRoleTerm

    // Resolve to a metro/region hub so the query uses a name JSearch actually indexes.
    // For Israel: Herzliya → "Tel Aviv". For other countries, keep the raw location.
    const israeliMetro = countryCode === 'il' ? resolveIsraeliMetro(userLocation) : null
    const locHub = israeliMetro || userLocation.split(',').map(s => s.trim()).filter(Boolean).join(' ')

    // Cascade of queries: most specific first, then broaden. First one that returns
    // >= 3 jobs wins. JSearch coverage outside the US is patchy; putting the location
    // in the query text often works better than the country filter alone.
    const candidates: Array<{ query: string; country?: string; label: string }> = []

    // 1. Role + metro hub in query text (best for non-US: "Product Manager Tel Aviv")
    if (locHub) {
      candidates.push({ query: `${roleTerm} ${locHub}`.trim(), label: 'role+metro' })
    }
    // 2. Role + country filter
    candidates.push({ query: roleTerm, country: countryCode, label: 'role+country-filter' })
    // 3. Broader fallback: role + country name in query
    if (countryCode === 'il') {
      candidates.push({ query: `${roleTerm} Israel`, label: 'role+country-in-query' })
    }
    // 4. Remote international jobs — user can work from anywhere
    candidates.push({ query: `${roleTerm} remote`, label: 'role+remote' })
    // 5. Global role-only fallback — guarantees at least something
    candidates.push({ query: roleTerm, label: 'role-only-global' })

    // 2. Fetch live jobs. For Israel we prefer Fantastic.Jobs LinkedIn Job Search API
    //    (much better IL coverage). For everyone else, JSearch is fine.
    let liveJobs: any[] = []
    let usedQuery = ''
    const jsearchKey = Deno.env.get('RAPIDAPI_KEY') || Deno.env.get('JSEARCH_API_KEY')
    const linkedinKey = Deno.env.get('LINKEDIN_JOBS_API_KEY') || Deno.env.get('RAPIDAPI_KEY')

    // --- JSearch mapper/fetcher (US + fallback) ---
    const mapJSearchJob = (job: any) => ({
      id: job.job_id,
      title: job.job_title,
      company: job.employer_name,
      description: job.job_description,
      location: `${job.job_city || ''}, ${job.job_state || ''}`.replace(/^, | , $/g, '').trim(),
      job_url: job.job_apply_link,
      salary_min: job.job_min_salary,
      salary_max: job.job_max_salary,
      is_remote: Boolean(job.job_is_remote),
      seniority: null,
      date_posted: job.job_posted_at_datetime_utc || null,
      source: 'jsearch',
    })

    const fetchJSearch = async (query: string, country?: string): Promise<any[]> => {
      if (!jsearchKey) return []
      const base = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}&num_pages=1`
      const url = country ? `${base}&country=${country}` : base
      try {
        const res = await fetch(url, {
          headers: { 'X-RapidAPI-Key': jsearchKey, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) {
          console.warn(`[job-suggestions] JSearch ${res.status} for query="${query}" country="${country ?? 'global'}"`)
          return []
        }
        const data = await res.json()
        return Array.isArray(data?.data) ? data.data : []
      } catch (err) {
        console.error(`[job-suggestions] JSearch fetch error for query="${query}":`, (err as Error).message)
        return []
      }
    }

    // --- Fantastic.Jobs LinkedIn Job Search mapper/fetcher (best for IL) ---
    // Response: flat array. Fields in the 7d retention window endpoint:
    // id, title, organization, locations_derived[], url, description_text,
    // date_posted, remote_derived, seniority, employment_type[], etc.
    const mapLinkedInJob = (job: any) => {
      const loc = Array.isArray(job?.locations_derived) && job.locations_derived.length
        ? job.locations_derived[0]
        : (Array.isArray(job?.cities_derived) && job.cities_derived.length ? job.cities_derived[0] : '')
      return {
        id: String(job?.id ?? job?.linkedin_id ?? ''),
        title: job?.title || '',
        company: job?.organization || '',
        description: job?.description_text || '',
        location: loc,
        job_url: job?.url || '',
        salary_min: null,
        salary_max: null,
        is_remote: Boolean(job?.remote_derived),
        seniority: job?.seniority || null,
        date_posted: job?.date_posted || null,
        source: 'linkedin',
      }
    }

    const fetchLinkedInJobs = async (titleFilter: string, locationFilter: string): Promise<any[]> => {
      if (!linkedinKey) return []
      const qs = new URLSearchParams({
        limit: '10',
        offset: '0',
        description_type: 'text',
        title_filter: `"${titleFilter}"`,
        location_filter: `"${locationFilter}"`,
      })
      const url = `https://linkedin-job-search-api.p.rapidapi.com/active-jb-7d?${qs.toString()}`
      try {
        const res = await fetch(url, {
          headers: {
            'x-rapidapi-host': 'linkedin-job-search-api.p.rapidapi.com',
            'x-rapidapi-key': linkedinKey,
          },
          signal: AbortSignal.timeout(12000),
        })
        if (!res.ok) {
          console.warn(`[job-suggestions] LinkedIn ${res.status} for title="${titleFilter}" loc="${locationFilter}"`)
          return []
        }
        const data = await res.json()
        return Array.isArray(data) ? data : []
      } catch (err) {
        console.error(`[job-suggestions] LinkedIn fetch error:`, (err as Error).message)
        return []
      }
    }

    // --- Cascade: LinkedIn for IL first, then JSearch, then remote fallback ---
    if (countryCode === 'il') {
      // A. LinkedIn: metro (Tel Aviv) — best local match
      if (locHub) {
        const jobs = await fetchLinkedInJobs(roleTerm, locHub)
        console.log(`[job-suggestions] linkedin metro title="${roleTerm}" loc="${locHub}" → ${jobs.length}`)
        if (jobs.length > 0) {
          // Prioritise user's metro, then include other IL districts
          const metroFirst = jobs.sort((a: any, b: any) => {
            const la = ((a?.locations_derived?.[0]) || '').toLowerCase()
            const lb = ((b?.locations_derived?.[0]) || '').toLowerCase()
            const metroLower = locHub.toLowerCase()
            const aScore = la.includes(metroLower) ? 0 : 1
            const bScore = lb.includes(metroLower) ? 0 : 1
            return aScore - bScore
          })
          liveJobs = metroFirst.slice(0, 10).map(mapLinkedInJob)
          usedQuery = 'linkedin-metro'
        }
      }
      // B. LinkedIn: broader Israel query if metro came back empty
      if (liveJobs.length === 0) {
        const jobs = await fetchLinkedInJobs(roleTerm, 'Israel')
        console.log(`[job-suggestions] linkedin country title="${roleTerm}" loc="Israel" → ${jobs.length}`)
        if (jobs.length > 0) {
          liveJobs = jobs.slice(0, 10).map(mapLinkedInJob)
          usedQuery = 'linkedin-israel'
        }
      }
    }

    // Non-IL countries (or IL with no LinkedIn hits) — JSearch cascade
    if (liveJobs.length === 0 && jsearchKey) {
      for (const c of candidates) {
        const jobs = await fetchJSearch(c.query, c.country)
        console.log(`[job-suggestions] jsearch ${c.label} "${c.query}" country="${c.country ?? 'global'}" → ${jobs.length}`)
        if (jobs.length >= 3) {
          liveJobs = jobs.slice(0, 10).map(mapJSearchJob)
          usedQuery = `jsearch-${c.label}`
          break
        }
        if (c === candidates[candidates.length - 1] && jobs.length > 0) {
          liveJobs = jobs.slice(0, 10).map(mapJSearchJob)
          usedQuery = `jsearch-${c.label}-partial`
        }
      }
    }
    console.log(`[job-suggestions] FINAL used=${usedQuery || 'none'} liveJobs=${liveJobs.length}`)

    // 3. Scoped library lookup — only match roles relevant to the user's targets
    // Never dump the full role library into the prompt (it's 382 KB and biased toward CS/ops roles)
    const allTargetStrings = [...targetTitles, fallbackTitle]
    const targetTitlesLower = allTargetStrings.map(t => t.toLowerCase())

    // 69 of 170 library roles use `title` instead of `standardized_title` after
    // the sector merges — fall back to either so the filter doesn't crash.
    const matchedRoles = (roleLibrary.roles as any[]).filter(role => {
      const rawTitle = (role.standardized_title ?? role.title) as string | undefined
      if (!rawTitle) return false
      const titleLower = rawTitle.toLowerCase()
      const altLower = ((role.alternate_titles as string[]) || []).map(t => (t || '').toLowerCase())
      return targetTitlesLower.some(t =>
        t && (titleLower.includes(t) || t.includes(titleLower) ||
        altLower.some(a => a && (a.includes(t) || t.includes(a))))
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
      `- LOCATION: The user is based in ${userLocation || 'an unspecified market'}${israeliMetro ? ` (${israeliMetro} metro — Israel's ${israeliMetro === 'Tel Aviv' ? 'main tech hub covering Gush Dan / Merkaz: Tel Aviv, Ramat Gan, Herzliya, Petah Tikva, Netanya, Ra\'anana' : israeliMetro + ' region'})` : ''}. When recommending generic roles or naming target companies, prefer employers hiring in that metro over US-centric defaults. Reference local tech companies and offices of multinationals present in the region.`,
      '- LIVE JOB INCLUSION POLICY: If the provided live jobs are remote-friendly or located outside the user\'s preferred metro, INCLUDE them anyway — the user would rather see remote/international opportunities than nothing. Mention in match_reason that the role is remote or outside their metro. Score at least 2-4 jobs unless truly none of them match the target domain at all.',
      '- Do not reject a job solely for being outside the user\'s metro. Only reject for genuine domain mismatch (e.g. a data engineering job for a product management candidate).',
    ].join('\n')

    const userPrompt = `USER PROFILE:
- Location: ${userLocation || 'Not provided'} (country code: ${countryCode}${israeliMetro ? `, metro: ${israeliMetro}` : ''})
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
1. Score each live job against the user's profile using the fit scoring weights.
2. Select the top 3-4 best-matching live jobs by score. Include jobs with score >= 30. It is better to show the user the best available jobs than an empty list. If all provided jobs are remote or outside their metro, include them anyway and note this in match_reason.
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
      signal: AbortSignal.timeout(55000),
    })

    if (!openaiResponse.ok) {
      return new Response(JSON.stringify({ error: 'AI service error', details: await openaiResponse.text() }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const completion = await openaiResponse.json()
    const rawContent = completion.choices?.[0]?.message?.content ?? ''
    const finishReason = completion.choices?.[0]?.finish_reason ?? 'unknown'
    if (finishReason === 'length') {
      return new Response(JSON.stringify({
        error: 'Response was truncated. Try again or reduce your target roles.',
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    let result: any
    try {
      // Strip markdown fences in case the model wraps its JSON
      const cleaned = rawContent.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
      result = JSON.parse(cleaned || '{}')
    } catch (parseErr) {
      console.error('[job-suggestions] JSON.parse failed:', (parseErr as Error).message)
      return new Response(JSON.stringify({ error: 'AI returned an invalid response format. Please try again.' }), {
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
