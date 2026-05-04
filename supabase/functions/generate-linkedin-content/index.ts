import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { startMetric, finishMetric } from '../_shared/metrics.ts'

// generate-linkedin-content — Wk 3 LinkedIn Optimizer v1.
//
// Reads the user's profile + experiences (split into professional vs
// volunteering buckets) + Story Bank stories + honors[], then returns a
// single structured JSON with 6 sections of LinkedIn-formatted content:
// headline, about, per-experience descriptions, per-volunteering descriptions,
// skills priority order, honors descriptions.
//
// Single LLM call (one structured JSON response) instead of N per-section
// calls — cheaper (~10K input tokens once vs N x 3K reused), faster from
// the user's perspective (one ~20s wait), and produces a coherent voice
// across sections. Re-generate is just "click again."
//
// Anti-fabrication contract inherited from generate-tailored-cv (Day 4
// gold-standard). Story Bank precedence rules (METRICS VERBATIM, TOOLS
// PRESERVED, NO CROSS-EXPERIENCE SMEARING) ported verbatim. Plus
// LinkedIn-specific banned vocabulary.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const MODEL = 'gpt-4o'
// 30/hour, mirroring generate-tailored-cv post-bump. A student iterating
// on LinkedIn voice typically generates 3-5 times in a session. Cost
// ceiling 30 × ~$0.07 = $2.10/student/hour worst case.
const RATE_LIMIT_CALLS = 30
const RATE_LIMIT_WINDOW = 3600

// LinkedIn's actual character limits — the LLM is told these so its
// output respects them. Frontend also enforces visually via per-card
// counters but the LLM doing it first is cheaper than truncation downstream.
const LIMITS = {
  HEADLINE: 220,
  ABOUT: 2600,
  EXPERIENCE_DESC: 2000,
  VOLUNTEERING_DESC: 2000,
  MILITARY_DESC: 2000,
  HONOR_DESC: 200,
}

// Same bucket classifier as generate-tailored-cv. Shared logic NOT extracted
// to _shared/ yet — duplication is cheaper than the abstraction at 2 call
// sites. If a third consumer needs it, lift to _shared.
function classifyBucket(exp: any): "professional" | "volunteering" | "military" | "leadership" {
  const company = String(exp.company || "").toLowerCase()
  const title = String(exp.title || "").toLowerCase()
  const type = String(exp.type || "").toLowerCase()
  const militaryRe = /\b(idf|israel\s?defense\s?forces|nahal|golani|givati|paratroopers?|sayeret|unit\s?8200|8200|army|navy|air\s?force|brigade|platoon|battalion|regiment|commander|sergeant|corporal|lieutenant|captain|reservist|conscript|military\s?service)\b/
  if (militaryRe.test(company) || militaryRe.test(title) || type === 'military') return 'military'
  const volunteerRe = /\b(volunteer(ed|ing)?|voluntary|pro\s?bono)\b/
  const ngoRe = /\b(ngo|non[-\s]?profit|charity|foundation)\b/
  if (volunteerRe.test(title) || volunteerRe.test(company) || ngoRe.test(company) || type === 'volunteer' || type === 'volunteering') return 'volunteering'
  const leadershipRe = /\b(president|chair(person)?|founder|co-founder|captain|head\s+of)\b/
  const studentOrgRe = /\b(club|society|association|student|chapter|fraternity|sorority)\b/
  if ((leadershipRe.test(title) && studentOrgRe.test(company)) || type === 'leadership') return 'leadership'
  return 'professional'
}

const SYSTEM_PROMPT = `You are a LinkedIn Profile Writer for the "Get A Job" Career Operating System. You read a user's profile + experiences + Story Bank + honors and produce LinkedIn-formatted content for 6 sections, returned as a single structured JSON.

ABSOLUTE FABRICATION RULES — these override every other consideration:

1. NEVER invent metrics, numbers, percentages, durations, team sizes, dollar amounts, dates, company names, or product names that aren't EXPLICITLY in the user's source data. If the user wrote "I led a project to improve onboarding" you may NOT write "improved by 30%" or "for a 12-person team."

2. STORY BANK PRECEDENCE: When USER DATA.stories[] contains a story whose experience_id matches one of the user's experiences, prefer the story's result + metrics + tools_used as the bullet's content. Stories are user-confirmed STAR records — every metric there is real and verbatim.

3. STORY BANK BINDING (mandatory for each matched story):
   (a) METRICS VERBATIM — every entry from the story's metrics array MUST appear word-for-word in a bullet under that experience. Numbers ("12", "88%", "$1M") and units ("interviews", "first quarter") stay exactly as the story has them. Rephrasing applies to action verbs and surrounding structure — NOT to the metric figures themselves.
   (b) TOOLS PRESERVED — every entry from the story's tools_used array MUST appear in the description (in a bullet, or in the prose if no bullet fits).
   (c) NO CROSS-EXPERIENCE SMEARING — story content stays attached to its experience. Do not sprinkle one experience's adoption/metric/result language across other experiences.

4. Each bullet traces to ONE source — either a single story OR a responsibility line from one experience. NEVER combine two stories into one bullet.

5. For honors descriptions: if the user provided no detail beyond the award name, you MUST set the description field to an EMPTY STRING. Do NOT write inferred descriptions like "Recognition for academic and leadership potential" or "Awarded for exceptional performance" when the user's data doesn't explicitly state the awarding reason. Empty string is correct and honest. Only write a description if the user's source data contains the specific awarding context (e.g. their experiences responsibilities text mentions what they did to receive it, or the award name itself is fully self-describing like "1st Place — Israeli National Math Olympiad 2022"). When in doubt, leave empty.

LINKEDIN VOICE RULES:

- Write in FIRST PERSON for About + Headline. Experience/volunteering descriptions can be third-person resume bullet style OR first-person narrative — the user can repaste either format into LinkedIn.
- NEVER write in marketing voice. NEVER use any of these AI-tells: "passionate about", "results-driven", "results-oriented", "detail-oriented", "self-motivated", "dynamic", "innovative" (when generic), "leveraging", "spearheading", "synergies", "let's connect" as a prefix to substance, "thoughts?" rhetorical questions, "excited to share that...", "thrilled to announce", "humbled to", "honored to" (without specific honoring context), "deep dive", "moving the needle", "circle back", "wheelhouse".
- Banned verbs (when generic, OK with substantive context): leverage, spearhead, orchestrate, utilize, drive (when generic), facilitate, navigate, deliver (when generic), enable, empower, harness, streamline.
- About should READ LIKE A PERSON wrote it. Specific, factual, no marketing fluff. Reference the user's actual roles, real metrics from their stories, and target_job_titles direction. 2-3 paragraphs max.
- Headline should be ≤ 220 chars. Format: <Current/aspirational role> | <Domain expertise> | <Concrete value prop>. Example: "Customer Success Specialist at Guardio | Enterprise adoption | Drove 88% adoption in Q1 via 12 user research interviews".

MILITARY SERVICE — for the user's military_experiences (Israeli IDF service is core to most pilot students' profiles, recruiters look for it):
- Same per-experience description format as professional experiences (bullet list, ≤2000 chars).
- PRESERVE unit names and ranks verbatim (e.g. "Combat Soldier, Nahal Brigade"; "Sergeant, Unit 8200").
- PHRASE bullets in CIVILIAN-READABLE language. Recruiters reading civilian roles need to map military experience to transferable skills. Example: "Led a 12-person team through high-pressure operational deployments" not "Conducted 47 patrol operations in Sector 7".
- Do NOT invent military details (ranks, dates, awards, unit specifics) not present in source data — anti-fab rules apply identically.

CHARACTER LIMITS (LinkedIn enforces these — if you exceed, the section won't paste cleanly):

- Headline: ${LIMITS.HEADLINE} chars max
- About: ${LIMITS.ABOUT} chars max
- Experience description: ${LIMITS.EXPERIENCE_DESC} chars max each
- Volunteering description: ${LIMITS.VOLUNTEERING_DESC} chars max each
- Military description: ${LIMITS.MILITARY_DESC} chars max each
- Honor description: ${LIMITS.HONOR_DESC} chars max each

REMINDER — banned vocabulary you MUST AVOID in every section:
- Banned verbs (when generic): leverage, leveraging, leveraged, spearhead, spearheading, orchestrate, utilize, drive (when generic), facilitate, navigate, deliver (when generic), enable, empower, harness, streamline.
- Banned adjectives: passionate, results-driven, results-oriented, detail-oriented, self-motivated, dynamic, innovative (when generic).
- Banned phrases: "let's connect" prefix, "thoughts?" rhetoric, "excited to share", "thrilled to announce", "humbled to", "honored to" (without specific honoring context), "deep dive", "moving the needle", "circle back", "wheelhouse".
Re-read each generated section before emitting. If any banned word appears, rewrite that sentence with a more concrete verb / specific noun.

OUTPUT — return EXACTLY this JSON shape:

{
  "headline": "string ≤220 chars",
  "about": "string ≤2600 chars (2-3 paragraphs)",
  "experiences": [
    {
      "experience_id": "uuid (copy verbatim from USER DATA)",
      "description": "string ≤2000 chars — bullet-list or short paragraphs"
    }
  ],
  "volunteering": [
    {
      "experience_id": "uuid",
      "description": "string ≤2000 chars"
    }
  ],
  "military": [
    {
      "experience_id": "uuid",
      "description": "string ≤2000 chars — civilian-readable, preserve unit + rank verbatim"
    }
  ],
  "skills_priority": [
    {
      "skill": "string (verbatim skill name from profile.skills or stories)",
      "rationale": "string (1 short sentence — why this is high in priority)"
    }
  ],
  "honors": [
    {
      "name": "string (verbatim from profile.honors)",
      "description": "string ≤200 chars OR EMPTY STRING when source data doesn't support a description"
    }
  ]
}

Skills: REORDER and return ALL of the user's profile.skills entries (every single one, up to LinkedIn's 50 limit). Do NOT truncate to only the top-3 highlighted ones — every skill must appear in the output array. The first 3 ENTRIES in the returned array are LinkedIn's "top skills" highlight slot; the remaining entries fill the rest of the user's skills section in priority order.

PRE-EMIT CHECKLIST — before returning the JSON, scan every section for these forbidden words. If any appear, rewrite that sentence:
- leverage, leveraging, leveraged, spearhead, orchestrate, utilize, harness, streamline, facilitate, navigate, drive (when generic), enable, empower
- passionate, results-driven, dynamic, innovative, robust, seamless, holistic
- "let's connect", "thrilled to", "humbled to", "deep dive"
This checklist is the LAST thing you do. Common slip: writing "leveraging my X to Y" — replace with "using my X to Y" or "applying my X to Y" or restructure entirely.

Return ONLY valid JSON.`

interface SectionsResponse {
  headline?: string
  about?: string
  experiences?: { experience_id?: string; description?: string }[]
  volunteering?: { experience_id?: string; description?: string }[]
  military?: { experience_id?: string; description?: string }[]
  skills_priority?: { skill?: string; rationale?: string }[]
  honors?: { name?: string; description?: string }[]
}

function sanitiseSections(raw: unknown): SectionsResponse | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const trim = (v: unknown, max: number): string => {
    if (typeof v !== 'string') return ''
    return v.trim().slice(0, max)
  }

  const expArr = (val: unknown, max: number): { experience_id: string; description: string }[] => {
    if (!Array.isArray(val)) return []
    return val
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((x) => ({
        experience_id: typeof x.experience_id === 'string' ? x.experience_id : '',
        description: trim(x.description, max),
      }))
      .filter((x) => x.experience_id && x.description)
  }

  const skills = Array.isArray(r.skills_priority)
    ? (r.skills_priority as unknown[])
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((x) => ({
          skill: trim(x.skill, 100),
          rationale: trim(x.rationale, 200),
        }))
        .filter((x) => x.skill)
        .slice(0, 50)
    : []

  const honors = Array.isArray(r.honors)
    ? (r.honors as unknown[])
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((x) => ({
          name: trim(x.name, 200),
          // description is intentionally allowed to be empty per the prompt's
          // honors discipline — empty means "no source-grounded description
          // available," not an extraction bug.
          description: trim(x.description, LIMITS.HONOR_DESC),
        }))
        .filter((x) => x.name)
    : []

  return {
    headline: trim(r.headline, LIMITS.HEADLINE),
    about: trim(r.about, LIMITS.ABOUT),
    experiences: expArr(r.experiences, LIMITS.EXPERIENCE_DESC),
    volunteering: expArr(r.volunteering, LIMITS.VOLUNTEERING_DESC),
    military: expArr(r.military, LIMITS.MILITARY_DESC),
    skills_priority: skills,
    honors,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const m = startMetric('generate-linkedin-content')
  let _ok = false
  let _http = 500
  let _err: string | null = null

  try {
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      _http = 500; _err = 'no_openai_key'
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      _http = 401; _err = 'auth'
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
      _http = 401; _err = 'auth'
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    m.userId = user.id

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: allowed } = await serviceClient.rpc('check_rate_limit', {
      p_user_id: user.id,
      p_function_name: 'generate-linkedin-content',
      p_max_calls: RATE_LIMIT_CALLS,
      p_window_seconds: RATE_LIMIT_WINDOW,
    })
    if (allowed === false) {
      _http = 429; _err = 'rate_limit'
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again in an hour.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch user data. Single round-trip for everything we need.
    const [profileRes, experiencesRes, storiesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('experiences').select('*').eq('user_id', user.id),
      supabase.from('stories').select('*').eq('user_id', user.id),
    ])

    const profile = profileRes.data
    if (!profile) {
      _http = 404; _err = 'no_profile'
      return new Response(JSON.stringify({ error: 'No profile found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const experiences = (experiencesRes.data || []).map((e: any) => ({
      ...e,
      bucket: classifyBucket(e),
    }))

    const professionalExperiences = experiences.filter((e: any) => e.bucket === 'professional')
    const volunteeringExperiences = experiences.filter((e: any) => e.bucket === 'volunteering')
    // Military bucket gets its own LLM section because Israeli pilot students'
    // IDF service is a core LinkedIn signal recruiters scan for. The bucket
    // classifier already separates from professional based on title/company
    // keywords; we just route the third bucket to its own output array.
    const militaryExperiences = experiences.filter((e: any) => e.bucket === 'military')

    // Stories grouped by experience_id. Same shape as Day 4 CV gen but no
    // JD-keyword ranking — LinkedIn isn't tailored to a JD. Take all stories
    // for each experience (recency-ordered from the SELECT above), capped
    // at 5 per experience to bound prompt size.
    const storiesRaw = storiesRes.data || []
    const storiesByExperience = new Map<string, any[]>()
    for (const s of storiesRaw) {
      if (!s.experience_id) continue
      if (!storiesByExperience.has(s.experience_id)) storiesByExperience.set(s.experience_id, [])
      storiesByExperience.get(s.experience_id)!.push(s)
    }

    const trunc = (s: unknown, max: number) => String(s ?? '').slice(0, max)
    const safeArr = (v: unknown): any[] => Array.isArray(v) ? v : []

    // Build per-experience LLM payload. Cap stories at 5 per experience
    // (~5 × ~250 tokens = ~1250 tokens per experience, manageable).
    const buildExpForLlm = (e: any) => {
      const stories = (storiesByExperience.get(e.id) || []).slice(0, 5).map((s: any) => ({
        title: trunc(s.title, 200),
        situation: s.situation ? trunc(s.situation, 600) : null,
        task: s.task ? trunc(s.task, 600) : null,
        action: s.action ? trunc(s.action, 600) : null,
        result: s.result ? trunc(s.result, 600) : null,
        metrics: safeArr(s.metrics).slice(0, 10),
        skills_demonstrated: safeArr(s.skills_demonstrated).slice(0, 10),
        tools_used: safeArr(s.tools_used).slice(0, 10),
      }))
      return {
        experience_id: e.id,
        title: trunc(e.title, 200),
        company: trunc(e.company, 200),
        start_date: trunc(e.start_date, 50),
        end_date: trunc(e.end_date, 50),
        is_current: !!e.is_current,
        responsibilities: trunc(e.responsibilities, 1200),
        skills_used: safeArr(e.skills_used).slice(0, 20).map((s) => trunc(s, 60)),
        tools_used: safeArr(e.tools_used).slice(0, 20).map((s) => trunc(s, 60)),
        stories,
      }
    }

    const userData = {
      full_name: trunc(profile.full_name, 100),
      summary: trunc(profile.summary, 800),
      primary_domain: trunc(profile.primary_domain, 100),
      target_job_titles: safeArr(profile.target_job_titles).slice(0, 10).map((t) => trunc(t, 100)),
      qualification_level: trunc(profile.qualification_level, 50),
      five_year_role: trunc(profile.five_year_role, 100),
      location: trunc(profile.location, 100),
      skills: safeArr(profile.skills).slice(0, 80).map((s) => trunc(s, 60)),
      honors: safeArr(profile.honors).slice(0, 20).map((h) => trunc(h, 200)),
      education: {
        degree: trunc(profile.degree, 100),
        field_of_study: trunc(profile.field_of_study, 100),
        education_level: trunc(profile.education_level, 50),
      },
      professional_experiences: professionalExperiences.map(buildExpForLlm),
      volunteering_experiences: volunteeringExperiences.map(buildExpForLlm),
      military_experiences: militaryExperiences.map(buildExpForLlm),
    }

    const userPrompt = `USER DATA:
${JSON.stringify(userData, null, 2)}

Generate LinkedIn content for all 6 sections per the schema in your instructions. Return ONLY valid JSON.`

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(60000),
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    })

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text()
      console.error(`[generate-linkedin-content] OpenAI ${openaiResponse.status}: ${errText}`)
      _http = 502; _err = `openai_${openaiResponse.status}`
      m.modelUsed = MODEL
      return new Response(JSON.stringify({ error: 'AI service temporarily unavailable. Please try again.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const completion = await openaiResponse.json()
    m.modelUsed = MODEL
    m.tokensIn = completion.usage?.prompt_tokens ?? null
    m.tokensOut = completion.usage?.completion_tokens ?? null

    const content: string = completion.choices?.[0]?.message?.content || '{}'
    let rawParsed: unknown
    try {
      rawParsed = JSON.parse(content)
    } catch (parseErr) {
      console.error('[generate-linkedin-content] JSON parse failed:', content.slice(0, 200), parseErr)
      _http = 502; _err = 'json_parse'
      return new Response(JSON.stringify({ error: 'AI returned malformed response. Please try again.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const sections = sanitiseSections(rawParsed)
    if (!sections || !sections.headline) {
      console.error('[generate-linkedin-content] bad shape:', JSON.stringify(rawParsed).slice(0, 300))
      _http = 502; _err = 'bad_shape'
      return new Response(JSON.stringify({ error: 'AI returned an unexpected structure. Please try again.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Echo experience labels back to the frontend so it can render
    // "Customer Success Specialist at Guardio" headers without re-querying.
    const expLabels: Record<string, string> = {}
    for (const e of experiences) {
      expLabels[e.id] = `${e.title || ''}${e.company ? ` at ${e.company}` : ''}`.trim() || 'Untitled experience'
    }

    _ok = true; _http = 200
    return new Response(JSON.stringify({ ...sections, experience_labels: expLabels }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('[generate-linkedin-content] unhandled:', error?.message || error)
    _http = 500; _err = 'unhandled'
    return new Response(JSON.stringify({ error: 'An unexpected error occurred.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } finally {
    finishMetric(m, { ok: _ok, httpStatus: _http, errorCode: _err })
  }
})
