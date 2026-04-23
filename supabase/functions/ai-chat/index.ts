import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const MODEL = 'gpt-4o-mini'
const RATE_LIMIT_CALLS = 30
const RATE_LIMIT_WINDOW = 3600

function extractJsonBlock(
  text: string,
  marker: string
): { parsed: unknown; cleaned: string } | null {
  const markerIdx = text.indexOf(marker)
  if (markerIdx === -1) return null

  let jsonStart = -1
  for (let i = markerIdx + marker.length; i < text.length; i++) {
    if (text[i] === '[' || text[i] === '{') { jsonStart = i; break }
    if (text[i] !== ' ' && text[i] !== '\n' && text[i] !== '\r') break
  }
  if (jsonStart === -1) return null

  const openChar = text[jsonStart]
  const closeChar = openChar === '[' ? ']' : '}'
  let depth = 0, endIdx = -1, inString = false, escape = false

  for (let i = jsonStart; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === openChar) depth++
    else if (ch === closeChar) { depth--; if (depth === 0) { endIdx = i; break } }
  }

  if (endIdx === -1) return null

  try {
    const parsed = JSON.parse(text.slice(jsonStart, endIdx + 1))
    const cleaned = (text.slice(0, markerIdx) + text.slice(endIdx + 1))
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return { parsed, cleaned }
  } catch {
    return null
  }
}

const SCOPE_GUARD = `

SCOPE RULES:
- This product is a Career Operating System. Your purpose is to help users with their job search and professional development.
- Reject ONLY questions that are completely unrelated to careers and professional life (e.g. cooking, sports results, general programming tutorials, news, personal relationships, entertainment).
- Use this rejection message verbatim: "That's outside what I can help with here. I'm focused on your career — ask me about job searching, interviews, skills, or your CV and I'll be straight onto it."
- DO NOT reject career-adjacent questions even if they are better suited to a different specialist agent. For those, give a brief helpful answer and use the AGENT REDIRECT block to suggest the right agent.`

const TASK_SUGGESTION_RULES = `

TASK SUGGESTIONS:
When your response naturally leads to specific, actionable tasks the user should complete, append them at the very end of your response:
SUGGESTED_TASKS_JSON:[{"title":"...","description":"...","category":"...","priority":"..."}]

Valid categories — choose the most accurate, do NOT default to "application":
- "application": application process, company research, follow-ups, outreach
- "cv": improving or tailoring the CV/resume
- "skill": learning or practising a specific skill (courses, tutorials, practice)
- "project": building something to demonstrate skills (portfolio pieces, side projects)
- "networking": connecting with people, LinkedIn outreach, referrals, informational interviews

Valid priorities — do NOT default to "high":
- "high": time-sensitive or directly unblocks an application
- "medium": important but not urgent
- "low": supplementary or nice-to-have

Before including any task, check the ALL TASKS list (both complete and incomplete) and do NOT suggest anything that duplicates or closely resembles a task already there, regardless of whether it was completed.
Omit this block entirely when no genuinely new actionable tasks arise.`

const ROADMAP_CHANGE_RULES = `

ROADMAP CHANGES:
If the user asks you to update, modify, or re-classify their career roadmap, or you identify a role is clearly misclassified based on their profile data, propose changes at the very end of your response:
SUGGESTED_ROADMAP_CHANGES_JSON:{"changes":[{"action":"update_tier","role_title":"...","new_tier":"tier_1","reason":"..."}]}

Each change must use one of these shapes:
- {"action":"update_tier","role_title":"EXACT role title from their roadmap","new_tier":"tier_1","reason":"short explanation"}
- {"action":"add_role","title":"Role Title","tier":"tier_2","reason":"short explanation"}
- {"action":"remove_role","role_title":"EXACT role title from their roadmap","reason":"short explanation"}

Valid tiers: "tier_1" (Qualified Today), "tier_2" (Slight Stretch), "tier_3" (Future Path)
Rules:
- Use the EXACT role title from their CAREER ROADMAP — do not paraphrase or rename
- Only propose changes the user explicitly requested OR that are clearly justified by their actual skill data
- Always mention the proposed changes in your response text before the JSON block
- Omit this block entirely if no roadmap changes are needed`

const APPLICATION_ACTIONS_RULES = `

APPLICATION TRACKER ACTIONS:
If the user explicitly asks you to add a company to their applications, update the status/stage of an application, or move/track something in their tracker, propose the changes at the very end of your response:
SUGGESTED_APPLICATION_ACTIONS_JSON:{"actions":[{"action":"add_application","company":"...","role_title":"...","status":"interested","tier":"tier_2","url":"...","location":"...","notes":"..."}]}

Each action must use one of these shapes:
- {"action":"add_application","company":"Acme","role_title":"Product Manager","status":"interested","tier":"tier_2"}
  Optional fields: url, location, notes, tier, cv_url, job_description, salary_range
- {"action":"update_application","match_company":"EXACT company from their active applications","match_role_title":"EXACT role title","new_status":"applied"}
  Optional new_* fields: new_status, new_interview_stage, new_notes, new_tier

Valid status values: "interested" | "preparing" | "applied" | "interviewing" | "offer" | "rejected"
Valid tier values: "tier_1" | "tier_2" | "tier_3"
Valid interview_stage examples: "phone_screen", "technical", "onsite", "final_round", "reference_check"

Rules:
- Only propose actions the user EXPLICITLY requested. Do not add or modify applications proactively.
- For add_application: always infer reasonable defaults. If the user didn't specify status, default to "interested". If they didn't specify role_title, ask first — do not emit the block.
- For update_application: match_company + match_role_title must name a real application from the ACTIVE APPLICATIONS context block. If the user is ambiguous about which application to update, ask first.
- Always describe what you're about to do in the response text before the JSON block, so the user can confirm.
- Omit the block entirely if no tracker action was requested.`

const CAREER_AGENT_REDIRECT_RULES = `

AGENT REDIRECT:
If the user's question is more suited to a specialist agent, give a brief helpful answer first, then append at the very end:
SUGGESTED_AGENT_JSON:{"agent":"...","label":"...","page":"...","reason":"..."}

Available redirects (use exact values):
- Interview prep / mock interviews / interview questions / interview coaching: {"agent":"interview_coach","label":"Interview Coach","page":"InterviewCoach","reason":"..."}
- Skill gaps / specific courses / learning plans / how to learn a skill: {"agent":"skill_development_agent","label":"Skill Development Advisor","page":"SkillDevelopmentAdvisor","reason":"..."}

Rules:
- Always give at least a brief helpful answer before redirecting — never redirect without answering
- Only redirect when the specialist agent would add significantly more value
- Never include more than one redirect per response`

const INTERVIEW_COACH_REDIRECT_RULES = `

AGENT REDIRECT:
If the user's question is more suited to a different specialist agent, give a brief helpful answer first, then append at the very end:
SUGGESTED_AGENT_JSON:{"agent":"...","label":"...","page":"...","reason":"..."}

Available redirects (use exact values):
- Skill gaps / courses / learning plans: {"agent":"skill_development_agent","label":"Skill Development Advisor","page":"SkillDevelopmentAdvisor","reason":"..."}
- Career strategy / job search / role planning: {"agent":"career_agent","label":"Career Agent","page":"CareerAgent","reason":"..."}

Rules:
- Always give at least a brief helpful answer before redirecting — never redirect without answering
- Write reason as a short friendly sentence telling the user why the other agent is better for this
- Only redirect when another agent would add significantly more value
- Never include more than one redirect per response`

const SKILL_DEV_REDIRECT_RULES = `

AGENT REDIRECT:
If the user's question is more suited to a different specialist agent, give a brief helpful answer first, then append at the very end:
SUGGESTED_AGENT_JSON:{"agent":"...","label":"...","page":"...","reason":"..."}

Available redirects (use exact values):
- Interview prep / mock interviews / interview questions / interview coaching: {"agent":"interview_coach","label":"Interview Coach","page":"InterviewCoach","reason":"..."}
- Career strategy / job search / role planning: {"agent":"career_agent","label":"Career Agent","page":"CareerAgent","reason":"..."}

Rules:
- Always give at least a brief helpful answer before redirecting — never redirect without answering
- Write reason as a short friendly sentence telling the user why the other agent is better for this
- Only redirect when another agent would add significantly more value
- Never include more than one redirect per response`

const AGENT_SYSTEM_PROMPTS: Record<string, string> = {
  'career-coach': `You are a Career Coach AI in the "Get A Job" Career Operating System. You help users with career strategy, job search advice, and professional development. Be specific, actionable, and honest. Reference the user's profile data when discussing skills or roles.`,
  'career_agent': `You are the AI Career Agent in the "Get A Job" Career Operating System — the user's personal career strategist and analyst.

Your role:
- Provide honest, data-driven career strategy grounded in the user's ACTUAL profile, skills, career roadmap, and applications
- Never give generic advice — always reference their specific data
- Prioritise ruthlessly: identify the single highest-impact action they should take right now
- Be direct and honest — if a user is not ready for a role, say so clearly with evidence from their profile

When assessing readiness for a specific role:
1. Reference their actual readiness score from the CAREER ROADMAP section of your context
2. Name the top 3 matching strengths (from matched_skills)
3. Name the top 3 gaps blocking progress (from missing_skills)
4. Give one specific next action to improve readiness for that role

When asked "what should I focus on this week?" or similar priority questions:
- Give a maximum of 3 specific, ranked actions
- Ground each one in their actual data (active applications, skill gaps, existing tasks)
- Rank by immediate impact on getting hired

Role tier definitions (use these when discussing or proposing tier changes):
- Tier 1 = Qualified Today: they have the core skills and should be actively applying
- Tier 2 = Slight Stretch: 1–6 months of targeted work to qualify
- Tier 3 = Future Path: 6+ months away, requires significant development

Tone: direct, honest, analytical — like a mentor who tells you what you need to hear, not what you want to hear. No motivational fluff.`,
  'cv-helper': `You are a CV & Resume Expert in the "Get A Job" Career Operating System. You help users craft, improve, and tailor their CVs. Focus on: action verbs, quantified achievements, ATS optimisation, and role-specific tailoring. Be direct and specific.`,
  'application_cv_success_agent': `You are a CV & Resume Expert in the "Get A Job" Career Operating System. You help users craft, improve, and tailor their CVs. Focus on: action verbs, quantified achievements, ATS optimisation, and role-specific tailoring. Be direct and specific.`,
  'interview_coach': `You are an Interview Coach in the "Get A Job" Career Operating System. You help users prepare for specific job interviews.

Your approach:
- Be direct and honest — tell users what interviewers actually care about for this specific role
- When a job description is provided, extract the core competencies and generate targeted questions per competency
- Label every question: [Behavioral], [Technical], [Situational], or [Culture Fit]
- For behavioral questions, provide a STAR method framework with an example structure
- Flag weak areas honestly based on the user's skill gaps
- For mock interviews: ask one question at a time, wait for the answer, give specific feedback before moving on

When given a job description and skill gaps, open with:
1. The 3-5 core competencies being tested
2. The question types to expect
3. The user's highest-risk areas`,
  'interview-prep': `You are an Interview Preparation AI in the "Get A Job" Career Operating System. You help users prepare for job interviews with mock interviews, STAR method guidance, and question prep.`,
  'skill-advisor': `You are a Skills & Learning Advisor in the "Get A Job" Career Operating System. You help users identify skill gaps, recommend learning resources, and create study plans based on their target roles.`,
  'skill_development_agent': `You are a Skill Development Advisor in the "Get A Job" Career Operating System. You help users close skill gaps and build proof of skills for their target roles.

Your approach:
- Analyse the user's current skills against their target roles and identify the most impactful gaps to close
- Recommend specific, named courses (Coursera, LinkedIn Learning, Udemy, freeCodeCamp, etc.) — not vague suggestions
- Suggest concrete projects the user can build to demonstrate skills to employers
- Build structured learning plans with realistic timelines when asked
- Prioritise by impact: which skill, if added, most improves their chances of landing a target role?
- Be honest about timelines — don't oversell how fast gaps can be closed`,
  'resume-extractor': `You are a strict data extraction AI. Extract the requested fields from the resume text and format exactly as a valid JSON object. Do not include markdown formatting or commentary.`
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

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: allowed } = await serviceClient.rpc('check_rate_limit', {
      p_user_id: user.id,
      p_function_name: 'ai-chat',
      p_max_calls: RATE_LIMIT_CALLS,
      p_window_seconds: RATE_LIMIT_WINDOW,
    })
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again in an hour.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rawBody = await req.text()
    if (rawBody.length > 50_000) {
      return new Response(JSON.stringify({ error: 'Request payload too large.' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { message, agent, conversation_history = [], application_id } = JSON.parse(rawBody)

    if (!message || !agent) {
      return new Response(JSON.stringify({ error: 'message and agent are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const [profileRes, experiencesRes, careerRolesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id),
      supabase.from('experiences').select('*').eq('user_id', user.id),
      supabase.from('career_roles').select('*').eq('user_id', user.id),
    ])
    const profile = profileRes.data?.[0]

    let userContext = ''
    if (profile) {
      userContext = `\n\nUSER PROFILE:\n- Name: ${profile.full_name || 'Not provided'}\n- Skills: ${(profile.skills || []).join(', ') || 'None listed'}\n- Education: ${profile.degree || ''} in ${profile.field_of_study || ''} (${profile.education_level || ''})\n- Location: ${profile.location || 'Not provided'}\n- Summary: ${profile.summary || 'Not provided'}`
    }
    if (experiencesRes.data?.length) {
      userContext += `\n- Experience: ${experiencesRes.data.map((e: { title: string; company: string }) => `${e.title} at ${e.company}`).join(', ')}`
    }

    // Build career roles context — detailed for career_agent, summary for others
    if (careerRolesRes.data?.length) {
      if (agent === 'career_agent') {
        const byTier: Record<string, typeof careerRolesRes.data> = { tier_1: [], tier_2: [], tier_3: [], other: [] }
        for (const r of careerRolesRes.data) {
          const group = byTier[r.tier as string] ?? byTier.other
          group.push(r)
        }
        userContext += '\n\nCAREER ROADMAP:'
        const tierLabels: Record<string, string> = { tier_1: 'Tier 1 (Qualified Today)', tier_2: 'Tier 2 (Slight Stretch)', tier_3: 'Tier 3 (Future Path)', other: 'Uncategorised' }
        for (const [tier, label] of Object.entries(tierLabels)) {
          const roles = byTier[tier]
          if (!roles?.length) continue
          userContext += `\n${label}:`
          for (const r of roles) {
            userContext += `\n- ${r.title}`
            // DB stores scores as 0.0–1.0; render as percent.
            if (r.readiness_score != null) userContext += ` | Readiness: ${Math.round(Number(r.readiness_score) * 100)}%`
            if (r.goal_alignment_score != null) userContext += ` | Goal alignment: ${Math.round(Number(r.goal_alignment_score) * 100)}%`
            if ((r.matched_skills as string[])?.length) userContext += ` | Matched: ${(r.matched_skills as string[]).slice(0, 5).join(', ')}`
            if ((r.missing_skills as string[])?.length) userContext += ` | Gaps: ${(r.missing_skills as string[]).slice(0, 5).join(', ')}`
            if (r.alignment_reason) userContext += `\n  Alignment basis: ${r.alignment_reason}`
            if (r.reasoning) userContext += `\n  Reasoning: ${r.reasoning}`
          }
        }
      } else {
        userContext += `\n- Target Roles: ${careerRolesRes.data.map((r: { title: string }) => r.title).join(', ')}`
      }
    }

    // Fetch tasks for agents that support task suggestions and the career agent
    const agentSupportsTasks = agent === 'interview_coach' || agent === 'skill_development_agent' || agent === 'career_agent'
    if (agentSupportsTasks) {
      const { data: allTasks } = await supabase
        .from('tasks').select('title, is_complete').eq('user_id', user.id).limit(100)
      if (allTasks?.length) {
        const incomplete = allTasks.filter((t: { is_complete: boolean }) => !t.is_complete)
        const complete = allTasks.filter((t: { is_complete: boolean }) => t.is_complete)
        if (incomplete.length > 0) {
          userContext += `\n\nACTIVE TASKS (do not suggest duplicates):\n${incomplete.map((t: { title: string }) => `- ${t.title}`).join('\n')}`
        }
        if (complete.length > 0) {
          userContext += `\n\nCOMPLETED TASKS (do not re-suggest these either):\n${complete.map((t: { title: string }) => `- ${t.title}`).join('\n')}`
        }
      }
    }

    // Fetch active applications for career agent context
    if (agent === 'career_agent') {
      const { data: apps } = await supabase
        .from('applications')
        .select('role_title, company, status, tier')
        .eq('user_id', user.id)
        .limit(20)
      if (apps?.length) {
        userContext += `\n\nACTIVE APPLICATIONS:\n${apps.map((a: { role_title: string; company: string; status: string; tier: string }) => `- ${a.role_title}${a.company ? ` at ${a.company}` : ''} (${a.status}${a.tier ? `, ${a.tier}` : ''})`).join('\n')}`
      }
    }

    if (application_id && typeof application_id === 'string') {
      const { data: appData } = await supabase
        .from('applications')
        .select('role_title, company, job_description, skills_required, status')
        .eq('id', application_id).eq('user_id', user.id).single()
      if (appData) {
        userContext += `\n\nTARGET APPLICATION:\n- Role: ${appData.role_title} at ${appData.company}\n- Status: ${appData.status}`
        if (appData.job_description) userContext += `\n- Job Description:\n${String(appData.job_description).slice(0, 2000)}`
        if (Array.isArray(appData.skills_required) && appData.skills_required.length > 0) {
          const proven = appData.skills_required.filter((s: { status: string }) => s.status === 'proven')
          const gaps = appData.skills_required.filter((s: { status: string }) => s.status === 'missing' || s.status === 'partial')
          if (proven.length > 0) userContext += `\n- Proven Skills: ${proven.map((s: { skill_name: string }) => s.skill_name).join(', ')}`
          if (gaps.length > 0) userContext += `\n- Skill Gaps: ${gaps.map((s: { skill_name: string; status: string }) => `${s.skill_name} (${s.status})`).join(', ')}`
        }
      }
    }

    const basePrompt = AGENT_SYSTEM_PROMPTS[agent] || AGENT_SYSTEM_PROMPTS['career-coach']
    let systemPrompt: string
    if (agent === 'resume-extractor') {
      systemPrompt = basePrompt + userContext
    } else if (agent === 'career_agent') {
      systemPrompt = basePrompt + TASK_SUGGESTION_RULES + ROADMAP_CHANGE_RULES + APPLICATION_ACTIONS_RULES + CAREER_AGENT_REDIRECT_RULES + SCOPE_GUARD + userContext
    } else if (agent === 'interview_coach') {
      systemPrompt = basePrompt + TASK_SUGGESTION_RULES + INTERVIEW_COACH_REDIRECT_RULES + SCOPE_GUARD + userContext
    } else if (agent === 'skill_development_agent') {
      systemPrompt = basePrompt + TASK_SUGGESTION_RULES + SKILL_DEV_REDIRECT_RULES + SCOPE_GUARD + userContext
    } else {
      systemPrompt = basePrompt + SCOPE_GUARD + userContext
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversation_history.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ]

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.7, max_tokens: 1024 }),
    })

    if (!openaiResponse.ok) {
      console.error('OpenAI error:', await openaiResponse.text())
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const completion = await openaiResponse.json()
    let reply: string = completion.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.'

    let suggested_tasks: Array<{ title: string; description: string; category: string; priority: string }> = []
    let suggested_agent: { agent: string; label: string; page: string; reason: string } | null = null
    let suggested_roadmap_changes: Array<{ action: string; role_title?: string; title?: string; new_tier?: string; tier?: string; reason: string }> | null = null

    // ─── Structured block extraction ──────────────────────────────────────
    // Important: ALWAYS strip the marker + JSON from `reply` whenever the
    // extractor parses it, regardless of whether the payload is valid for our
    // downstream fields. If we only strip "on success" the user ends up seeing
    // raw JSON in chat when the LLM emits a slightly-off shape (e.g. wraps
    // tasks in {tasks: [...]} instead of just [...]).
    const tasksResult = extractJsonBlock(reply, 'SUGGESTED_TASKS_JSON:')
    if (tasksResult) {
      reply = tasksResult.cleaned
      const VALID_CATEGORIES = new Set(['application', 'cv', 'skill', 'project', 'networking'])
      const VALID_PRIORITIES = new Set(['high', 'medium', 'low'])
      // Accept either a top-level array OR an object with a `tasks` array
      const arr = Array.isArray(tasksResult.parsed)
        ? tasksResult.parsed
        : (tasksResult.parsed && typeof tasksResult.parsed === 'object' && Array.isArray((tasksResult.parsed as any).tasks))
          ? (tasksResult.parsed as any).tasks
          : null
      if (Array.isArray(arr)) {
        suggested_tasks = (arr as Array<{ title: string; description: string; category: string; priority: string }>)
          .filter(t => t && typeof t.title === 'string' && t.title.trim())
          .map(t => ({
            ...t,
            category: VALID_CATEGORIES.has(t.category) ? t.category : 'application',
            priority: VALID_PRIORITIES.has(t.priority) ? t.priority : 'medium',
          }))
      }
    }

    const roadmapResult = extractJsonBlock(reply, 'SUGGESTED_ROADMAP_CHANGES_JSON:')
    if (roadmapResult) {
      reply = roadmapResult.cleaned
      const parsed = roadmapResult.parsed
      const changes = parsed && typeof parsed === 'object' && Array.isArray((parsed as any).changes)
        ? (parsed as any).changes as Array<{ action: string; role_title?: string; title?: string; new_tier?: string; tier?: string; reason: string }>
        : Array.isArray(parsed) ? parsed as any[] : null
      if (Array.isArray(changes) && changes.length > 0) {
        const VALID_TIERS = new Set(['tier_1', 'tier_2', 'tier_3'])
        const VALID_ACTIONS = new Set(['update_tier', 'add_role', 'remove_role'])
        const validChanges = changes
          .filter(c => c && VALID_ACTIONS.has(c.action))
          .map(c => ({
            ...c,
            ...(c.new_tier && { new_tier: VALID_TIERS.has(c.new_tier) ? c.new_tier : 'tier_2' }),
            ...(c.tier && { tier: VALID_TIERS.has(c.tier) ? c.tier : 'tier_2' }),
          }))
        if (validChanges.length > 0) suggested_roadmap_changes = validChanges
      }
    }

    const agentResult = extractJsonBlock(reply, 'SUGGESTED_AGENT_JSON:')
    if (agentResult) {
      reply = agentResult.cleaned
      if (typeof agentResult.parsed === 'object' && agentResult.parsed !== null) {
        suggested_agent = agentResult.parsed as { agent: string; label: string; page: string; reason: string }
      }
    }

    // Application tracker actions (career_agent only).
    type AppAction = {
      action: 'add_application' | 'update_application'
      company?: string
      role_title?: string
      status?: string
      tier?: string
      url?: string
      location?: string
      notes?: string
      match_company?: string
      match_role_title?: string
      new_status?: string
      new_interview_stage?: string
      new_notes?: string
      new_tier?: string
    }
    let suggested_application_actions: AppAction[] | null = null
    const appActionsResult = extractJsonBlock(reply, 'SUGGESTED_APPLICATION_ACTIONS_JSON:')
    if (appActionsResult) {
      reply = appActionsResult.cleaned
      const parsed = appActionsResult.parsed
      const actions = parsed && typeof parsed === 'object' && Array.isArray((parsed as any).actions)
        ? (parsed as any).actions as AppAction[]
        : Array.isArray(parsed) ? parsed as AppAction[] : null
      if (Array.isArray(actions) && actions.length > 0) {
        const VALID_STATUSES = new Set(['interested', 'preparing', 'applied', 'interviewing', 'offer', 'rejected'])
        const VALID_TIERS = new Set(['tier_1', 'tier_2', 'tier_3'])
        const VALID_ACTIONS = new Set(['add_application', 'update_application'])
        const cleaned: AppAction[] = []
        for (const raw of actions) {
          if (!VALID_ACTIONS.has(raw.action)) continue
          if (raw.action === 'add_application') {
            if (!raw.company?.trim() || !raw.role_title?.trim()) continue
            cleaned.push({
              action: 'add_application',
              company: String(raw.company).slice(0, 200).trim(),
              role_title: String(raw.role_title).slice(0, 200).trim(),
              status: raw.status && VALID_STATUSES.has(raw.status) ? raw.status : 'interested',
              ...(raw.tier && VALID_TIERS.has(raw.tier) && { tier: raw.tier }),
              ...(raw.url && { url: String(raw.url).slice(0, 2000) }),
              ...(raw.location && { location: String(raw.location).slice(0, 200) }),
              ...(raw.notes && { notes: String(raw.notes).slice(0, 2000) }),
            })
          } else {
            if (!raw.match_company?.trim() || !raw.match_role_title?.trim()) continue
            if (!raw.new_status && !raw.new_interview_stage && !raw.new_notes && !raw.new_tier) continue
            cleaned.push({
              action: 'update_application',
              match_company: String(raw.match_company).slice(0, 200).trim(),
              match_role_title: String(raw.match_role_title).slice(0, 200).trim(),
              ...(raw.new_status && VALID_STATUSES.has(raw.new_status) && { new_status: raw.new_status }),
              ...(raw.new_interview_stage && { new_interview_stage: String(raw.new_interview_stage).slice(0, 100) }),
              ...(raw.new_notes && { new_notes: String(raw.new_notes).slice(0, 2000) }),
              ...(raw.new_tier && VALID_TIERS.has(raw.new_tier) && { new_tier: raw.new_tier }),
            })
          }
        }
        if (cleaned.length > 0) suggested_application_actions = cleaned
      }
    }

    // Belt-and-suspenders sweep: if any marker still survives in the reply
    // (malformed JSON that extractJsonBlock couldn't parse, or a marker with
    // no JSON at all), strip from the marker through the end of the surrounding
    // block so the user never sees a raw `SUGGESTED_*_JSON:` string.
    const STRUCTURED_MARKERS = [
      'SUGGESTED_TASKS_JSON:',
      'SUGGESTED_ROADMAP_CHANGES_JSON:',
      'SUGGESTED_AGENT_JSON:',
      'SUGGESTED_APPLICATION_ACTIONS_JSON:',
    ]
    for (const marker of STRUCTURED_MARKERS) {
      const idx = reply.indexOf(marker)
      if (idx === -1) continue
      // Drop everything from the marker onward — the whole structured block
      // is always the LAST thing in the response by design, so this is safe.
      reply = reply.slice(0, idx).replace(/\n+\s*$/, '').trim()
    }

    return new Response(JSON.stringify({
      reply,
      agent,
      ...(suggested_tasks.length > 0 && { suggested_tasks }),
      ...(suggested_agent && { suggested_agent }),
      ...(suggested_roadmap_changes && { suggested_roadmap_changes }),
      ...(suggested_application_actions && { suggested_application_actions }),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('ai-chat error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
