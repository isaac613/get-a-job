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

// Normalise a free-text role title (e.g. a user's 5-year goal with typos) into
// the closest standardized_title from the role library. LinkedIn's title_filter
// is a strict phrase match — "Product managment" (typo) finds zero jobs even
// though "Product Manager" matches hundreds. We map via Jaccard-over-tokens
// with 5-char stem folding so misspellings still resolve cleanly.
const ROLE_TITLE_STOPWORDS = new Set([
  "the","a","an","of","to","and","or","in","on","for","with","at","by","from",
  "as","is","and","or","role"
]);
function _titleTokens(s: string): string[] {
  return (s || '').toLowerCase().match(/[a-z][a-z-]{2,}/g) || [];
}
function canonicalizeRoleTitle(raw: string): string {
  const input = String(raw || '').trim();
  if (!input) return input;
  const goalTokens = _titleTokens(input).filter(t => !ROLE_TITLE_STOPWORDS.has(t));
  if (goalTokens.length === 0) return input;

  const stemMatch = (a: string, b: string): boolean => {
    if (a === b) return true;
    const minLen = Math.min(a.length, b.length);
    return minLen >= 5 && a.slice(0, 5) === b.slice(0, 5);
  };

  let best: { title: string; score: number; stdHit: boolean } | null = null;
  const tryTitle = (title: string, isStd: boolean) => {
    const titleTokens = _titleTokens(title).filter(t => !ROLE_TITLE_STOPWORDS.has(t));
    if (titleTokens.length === 0) return;
    let overlap = 0;
    const used = new Set<number>();
    for (const gt of goalTokens) {
      for (let i = 0; i < titleTokens.length; i++) {
        if (used.has(i)) continue;
        if (stemMatch(gt, titleTokens[i])) { overlap++; used.add(i); break; }
      }
    }
    const denom = goalTokens.length + titleTokens.length - overlap;
    const score = denom > 0 ? overlap / denom : 0;
    if (score > 0 && (!best || score > best.score ||
        (score === best.score && isStd && !best.stdHit))) {
      best = { title, score, stdHit: isStd };
    }
  };

  for (const r of (roleLibrary as any).roles) {
    if (r.standardized_title) tryTitle(String(r.standardized_title), true);
    for (const alt of (r.alternate_titles || [])) {
      const a = String(alt);
      if (a.length >= 5) tryTitle(a, false);
    }
  }
  return best && best.score >= 0.30 ? best.title : input;
}

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

    // Parse body defensively — supports force_refresh and role_filter from the frontend.
    // role_filter lets the user target a specific career-roadmap role instead of
    // defaulting to the top Tier 1 role.
    const rawBody = await req.text()
    if (rawBody.length > 10_000) {
      return new Response(JSON.stringify({ error: 'Request payload too large.' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    let parsedBody: { role_filter?: string; force_refresh?: boolean } = {}
    if (rawBody.trim().length > 0) {
      try { parsedBody = JSON.parse(rawBody) } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }
    const roleFilterParam = typeof parsedBody?.role_filter === 'string'
      ? parsedBody.role_filter.trim().slice(0, 200)
      : ''

    // 1. Fetch user data
    const { data: profiles } = await supabase.from('profiles').select('*').eq('id', user.id)
    const { data: experiences } = await supabase.from('experiences').select('*').eq('user_id', user.id)
    const { data: careerRoles } = await supabase
      .from('career_roles')
      .select('title, tier, readiness_score, goal_alignment_score')
      .eq('user_id', user.id)
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

    // Role-term priority:
    //   1. Explicit role_filter from the request body (user picked from dropdown)
    //   2. Top Tier 1 role from career_roles (best immediate move per analysis)
    //   3. First profile.target_job_titles entry
    //   4. profile.five_year_role / field_of_study fallback
    // Career roles reflect the two-axis tier analysis the user already ran —
    // those are the titles they're actually qualified for or working toward,
    // which are a far better search target than a raw 5-year-goal string.
    const sortedRoles = (careerRoles || []).slice().sort((a, b) => {
      const rank = (t: string | null | undefined) =>
        t === 'tier_1' ? 0 : t === 'tier_2' ? 1 : t === 'tier_3' ? 2 : 3;
      const rd = rank(a?.tier) - rank(b?.tier);
      if (rd !== 0) return rd;
      return (Number(b?.readiness_score) || 0) - (Number(a?.readiness_score) || 0);
    });
    const topCareerRole = sortedRoles[0]?.title || '';
    const rawRoleTerm = (roleFilterParam || topCareerRole || targetTitles[0] || fallbackTitle).trim();
    const roleTerm = (rawRoleTerm.length > 0 && rawRoleTerm.split(/\s+/).length === 1 && rawRoleTerm.length <= 10)
      ? `${rawRoleTerm} manager`
      : rawRoleTerm
    console.log("[JOBS] roleTerm source:", roleFilterParam ? 'role_filter' : topCareerRole ? 'career_roles[top]' : targetTitles[0] ? 'target_job_titles[0]' : 'fallback', "→", rawRoleTerm)

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

    // 2. Fetch live jobs. For Israel we use Techmap's Daily International Job
    //    Postings API (best IL coverage by a large margin — sources include
    //    alljobs.co.il which JSearch and the now-disabled Fantastic.Jobs
    //    LinkedIn API both miss). For everyone else, JSearch is fine.
    let liveJobs: any[] = []
    let usedQuery = ''
    // Both keys are read defensively: trim whitespace/newlines that often
    // come along on copy-paste, and reject any value containing non-ASCII
    // bytes (smart quotes, em dashes, BOM) before we try to use it as an
    // HTTP header. Without this guard, fetch() throws a cryptic
    // "headers of RequestInit is not a valid ByteString" before the request
    // ever leaves the function — observed on Techmap calls after a manual
    // secret re-paste introduced a non-ASCII char into RAPIDAPI_KEY.
    const sanitizeKey = (v: string | undefined): string => {
      // Strip whitespace + leading/trailing quote chars (', ", `) that often
      // come along on copy-paste — observed live: a paste of the key with a
      // trailing ' made the value 51 chars and produced 403 "not subscribed"
      // from RapidAPI because the apostrophe got sent as part of the header.
      const s = (v || '').trim().replace(/^['"`]+|['"`]+$/g, '')
      return /^[\x21-\x7e]+$/.test(s) ? s : ''
    }
    const jsearchKey = sanitizeKey(Deno.env.get('RAPIDAPI_KEY') || Deno.env.get('JSEARCH_API_KEY'))
    const techmapKey = sanitizeKey(Deno.env.get('RAPIDAPI_KEY'))
    if (!jsearchKey && Deno.env.get('RAPIDAPI_KEY')) {
      console.warn('[job-suggestions] RAPIDAPI_KEY present but invalid (empty after trim, or contains non-ASCII characters). Job APIs disabled.')
    }
    // Diagnostic fingerprint so we can confirm the secret matches the key
    // intended without ever leaking the value. Compare against the value
    // pasted into a probe with the same masking format. Drop this line once
    // the API integration is stable.
    const fingerprint = (k: string) => k ? `${k.slice(0, 8)}...${k.slice(-4)} len=${k.length}` : '(empty)'
    console.log(`[JOBS] RAPIDAPI_KEY fingerprint: ${fingerprint(techmapKey)}`)

    // JS3 fix — drop jobs whose apply URL isn't actionable. JSearch's global
    // remote tier returns real company info but anonymised "https://example.com/job/<id>"
    // placeholder URLs that 404 when the user clicks Apply Now. Filtering these
    // out before AI scoring also frees up the cascade to fall through to the
    // next level when a query returns mostly-broken URLs.
    const isUsableJobUrl = (url: unknown): url is string => {
      if (typeof url !== "string" || url.length === 0) return false;
      try {
        const u = new URL(url);
        if (!/^https?:$/.test(u.protocol)) return false;
        if (u.hostname === "example.com" || u.hostname.endsWith(".example.com")) return false;
        return true;
      } catch {
        return false;
      }
    };

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

    // --- Techmap Daily International Job Postings (best for IL coverage) ---
    // Same RAPIDAPI_KEY auth. Response wrapper is { result: [...] } with each
    // job containing top-level summary fields plus a Schema.org-style jsonLD
    // payload. Sources include alljobs.co.il, LinkedIn, indeed.com etc., so
    // IL coverage is broad — a single-day "product manager" / countryCode=il
    // probe returned 88 matches against zero from JSearch+LinkedIn.
    const mapTechmapJob = (job: any) => {
      const ld = job?.jsonLD || {}
      const country = ld?.jobLocation?.address?.addressCountry
      const city = job?.city || ld?.jobLocation?.address?.addressLocality
      const location = [city, country].filter(Boolean).join(', ')
      return {
        id: String(ld?.identifier || job?.title || ''),
        title: job?.title || ld?.title || '',
        company: job?.company || ld?.hiringOrganization?.name || '',
        description: ld?.description || '',
        location,
        job_url: ld?.url || '',
        salary_min: ld?.baseSalary?.minValue ?? null,
        salary_max: ld?.baseSalary?.maxValue ?? null,
        is_remote: Array.isArray(job?.workPlace) && job.workPlace.includes('Remote'),
        seniority: Array.isArray(job?.careerLevel) ? job.careerLevel[0] : null,
        date_posted: ld?.datePosted || job?.dateCreated || null,
        source: job?.portal || 'techmap',
      }
    }

    // dateCreated is REQUIRED by Techmap. We query the past 7 days as a single
    // window using YYYY-MM (month) format — gives much better recall than a
    // single day, and is well within the API's supported syntax. The free tier
    // is 100 req/month so we keep this to one call per cascade level.
    const fetchTechmapJobs = async (title: string, country: string, city?: string): Promise<any[]> => {
      if (!techmapKey) return []
      const dateCreated = new Date().toISOString().slice(0, 7) // YYYY-MM
      const params = new URLSearchParams({
        dateCreated,
        page: '1',
        countryCode: country.toLowerCase(),
      })
      // Join multi-word titles with literal "+" — Techmap parses that as one
      // phrase token (verified against the live API: "product+manager"
      // returned 88 IL hits). The earlier "+token1 +token2 +token3" form was
      // wrong: Techmap split on whitespace into three separate match clauses,
      // each requiring an exact word, so a "Product Manager" job didn't match
      // an "Associate Product Manager" search and recall collapsed to zero.
      if (title) params.set('title', title.trim().split(/\s+/).join('+'))
      if (city) params.set('city', city)
      const url = `https://daily-international-job-postings.p.rapidapi.com/api/v2/jobs/search?${params}`
      try {
        const res = await fetch(url, {
          headers: {
            'x-rapidapi-host': 'daily-international-job-postings.p.rapidapi.com',
            'x-rapidapi-key': techmapKey,
          },
          signal: AbortSignal.timeout(12000),
        })
        if (!res.ok) {
          console.warn(`[job-suggestions] techmap ${res.status} for title="${title}" country="${country}" city="${city ?? '-'}"`)
          return []
        }
        const data = await res.json()
        return Array.isArray(data?.result) ? data.result : []
      } catch (err) {
        console.error(`[job-suggestions] techmap fetch error:`, (err as Error).message)
        return []
      }
    }

    // --- Cascade: Techmap for IL first (city → country), then JSearch global fallback ---
    if (countryCode === 'il') {
      const tmRoleTerm = canonicalizeRoleTitle(roleTerm)
      console.log("[JOBS] Entering Techmap cascade, metro:", locHub, "apiKey present:", !!techmapKey, "roleTerm:", roleTerm, "canonicalised:", tmRoleTerm);
      // A. Techmap: city (Tel Aviv) — best local match
      if (locHub) {
        const jobs = await fetchTechmapJobs(tmRoleTerm, 'il', locHub)
        const mapped = jobs.map(mapTechmapJob).filter(j => isUsableJobUrl(j.job_url))
        console.log(`[job-suggestions] techmap city title="${tmRoleTerm}" city="${locHub}" → ${jobs.length} (${mapped.length} usable)`)
        if (mapped.length > 0) {
          liveJobs = mapped.slice(0, 10)
          usedQuery = 'techmap-city'
        }
      }
      // B. Techmap: broader Israel query if city came back empty
      if (liveJobs.length === 0) {
        const jobs = await fetchTechmapJobs(tmRoleTerm, 'il')
        const mapped = jobs.map(mapTechmapJob).filter(j => isUsableJobUrl(j.job_url))
        console.log(`[job-suggestions] techmap country title="${tmRoleTerm}" country="il" → ${jobs.length} (${mapped.length} usable)`)
        if (mapped.length > 0) {
          liveJobs = mapped.slice(0, 10)
          usedQuery = 'techmap-israel'
        }
      }
    }

    // Non-IL countries (or IL with no LinkedIn hits) — JSearch cascade
    if (liveJobs.length === 0 && jsearchKey) {
      for (const c of candidates) {
        const jobs = await fetchJSearch(c.query, c.country)
        const mapped = jobs.map(mapJSearchJob).filter(j => isUsableJobUrl(j.job_url))
        console.log(`[job-suggestions] jsearch ${c.label} "${c.query}" country="${c.country ?? 'global'}" → ${jobs.length} (${mapped.length} usable)`)
        if (mapped.length >= 3) {
          liveJobs = mapped.slice(0, 10)
          usedQuery = `jsearch-${c.label}`
          break
        }
        if (c === candidates[candidates.length - 1] && mapped.length > 0) {
          liveJobs = mapped.slice(0, 10)
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

    // JS2 fix — explain when the cascade fell through to remote/global so the
    // user understands why they're seeing non-local jobs. The frontend renders
    // result.message verbatim above the role tabs, so prefixing it here is
    // enough — no UI changes needed.
    let cascadeMessage = ''
    if (liveJobs.length === 0) {
      cascadeMessage = userLocation
        ? `No live postings found for "${roleTerm}" in ${userLocation} right now. `
        : `No live postings found for "${roleTerm}" right now. `
    } else if (usedQuery.includes('remote') || usedQuery.includes('global')) {
      cascadeMessage = userLocation
        ? `No live postings in ${userLocation} for "${roleTerm}" — showing remote and international opportunities instead. `
        : `Showing remote and international opportunities for "${roleTerm}". `
    }
    if (cascadeMessage) {
      result.message = (cascadeMessage + (result.message || '')).trim()
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

    const finalResults = result.live_suggestions || []
    console.log("[JOBS] Final results:", finalResults?.length, "source breakdown:",
      JSON.stringify(finalResults?.map((r: any) => {
        const orig = liveJobs.find(j => j.id === r.id || j.title === r.title)
        return orig?.source || r.source || "unknown"
      }).reduce((acc: Record<string, number>, s: string) => { acc[s] = (acc[s] || 0) + 1; return acc }, {})))

    return new Response(JSON.stringify({
      suggestions: finalResults,
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
