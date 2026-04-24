import { createClient } from "npm:@supabase/supabase-js@2";
import { jsPDF } from "npm:jspdf@2.5.2";

// --- Load JSON Libraries ---
import { roleLibrary } from "./shared/libraries/00_role_library.ts";
import { skillLibrary } from "./shared/libraries/01_skill_library.ts";
import { proofSignalLibrary } from "./shared/libraries/02_proof_signal_library.ts";
import { roleSkillMapping } from "./shared/libraries/04_role_skill_mapping.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// Helper so every response path picks up CORS headers without having to thread
// them manually. Replaces Response.json() — which does NOT merge custom headers
// the way we need for cross-origin browser calls from the Vite dev server.
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Defensive array coercer. Profile columns are inconsistent in this DB: some
// are proper Postgres ARRAY/jsonb (JS array), others like profiles.honors are
// text storing JSON ("[]" / "[\"Dean's List\"]"), and some users paste plain
// text ("Presidential Award, Heseg Scholarship"). Accept all three shapes.
function safeArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return [];
    // Try JSON first (["a","b"] or [])
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
    // Fall back to CSV / line-separated plain text so a user who typed
    // "Presidential Award, Heseg Scholarship" still gets rendered.
    return trimmed
      .split(/\r?\n|,|;/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

Deno.serve(async (req) => {
  // CORS preflight. Must come before any other logic — without this the browser
  // aborts the POST with "Failed to send a request to the Edge Function".
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const rawBody = JSON.stringify(body);
    if (rawBody.length > 50_000) {
      return json({ error: 'Request payload too large.' }, 413);
    }
    const { job_description, target_role, application_id } = body;
    const safeTargetRole = String(target_role ?? '').slice(0, 200);
    let safeJobDescription = String(job_description ?? '').slice(0, 5000);
    let targetCompany = ""; // populated from the linked application when available

    if (!safeTargetRole) {
      return json({ error: "target_role is required" }, 400);
    }
    if (application_id !== undefined && typeof application_id !== 'string') {
      return json({ error: 'Invalid application_id.' }, 400);
    }

    const { data: allowed } = await serviceClient.rpc('check_rate_limit', {
      p_user_id: user.id,
      p_function_name: 'generate-tailored-cv',
      p_max_calls: 10,
      p_window_seconds: 3600,
    });
    if (!allowed) {
      return json({ error: 'Rate limit exceeded. Try again in an hour.' }, 429);
    }

    const [profileRes, experiencesRes, projectsRes, certificationsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("experiences").select("*").eq("user_id", user.id),
      supabase.from("projects").select("*").eq("user_id", user.id),
      supabase.from("certifications").select("*").eq("user_id", user.id),
    ]);

    const profile = profileRes.data;
    if (!profile) {
      return json({ error: "No user profile found" }, 404);
    }

    const experiences = experiencesRes.data || [];
    const projects = projectsRes.data || [];
    const certifications = certificationsRes.data || [];

    // If an application is linked, use it as an additional context source.
    // The client often omits job_description from the body (because it doesn't
    // have it); the tracker row usually does. Also capture the company so we
    // can ask the LLM to reference it in the About Me.
    if (application_id) {
      const { data: app } = await supabase
        .from("applications")
        .select("company, role_title, job_description, notes")
        .eq("id", application_id)
        .eq("user_id", user.id)
        .single();
      if (app) {
        targetCompany = String(app.company ?? '').slice(0, 200);
        if (!safeJobDescription && app.job_description) {
          safeJobDescription = String(app.job_description).slice(0, 5000);
        }
        // `notes` sometimes holds the JD when the user pasted it there instead.
        if (!safeJobDescription && app.notes) {
          safeJobDescription = String(app.notes).slice(0, 5000);
        }
      }
    }

    const trunc = (s: unknown, max: number) => String(s ?? '').slice(0, max);

    // Classify each experience into professional / military / volunteering /
    // leadership. `experiences.type` is unreliable across this DB (legacy rows
    // are tagged "full_time" even when they're clearly military or
    // volunteering), so we infer from the COMPANY and TITLE fields only —
    // never from the free-form responsibilities text (which once caused a
    // false "military" positive on a Program Coordinator role whose curriculum
    // mentioned "military benefits").
    type Bucket = "military" | "volunteering" | "leadership" | "professional";
    const classifyExperience = (exp: any): Bucket => {
      const company = String(exp.company || "").toLowerCase();
      const title = String(exp.title || "").toLowerCase();
      const type = String(exp.type || "").toLowerCase();

      const militaryKeywords =
        /\b(idf|israel\s?defense\s?forces|nahal|golani|givati|paratroopers?|sayeret|unit\s?8200|8200|army|navy|air\s?force|brigade|platoon|battalion|regiment|commander|sergeant|corporal|lieutenant|captain|staff\s?sergeant|reservist|conscript|military\s?service|military\s?role)\b/;
      const looksMilitary = militaryKeywords.test(company) || militaryKeywords.test(title) || type === "military";

      const volunteerKeywords = /\b(volunteer(ed|ing)?|voluntary|pro\s?bono)\b/;
      const ngoCompany = /\b(ngo|non[-\s]?profit|charity|foundation)\b/;
      const looksVolunteering =
        volunteerKeywords.test(title) ||
        volunteerKeywords.test(company) ||
        ngoCompany.test(company) ||
        type === "volunteering" ||
        type === "volunteer";

      // Leadership bucket: explicit type tag OR title pattern like
      // "President of X Club", "Editor of ...", "Captain of ..." — used for
      // student leadership roles that aren't paid work. Intentionally narrow.
      const looksLeadership = type === "leadership" ||
        /\b(president of|editor of|captain of|head of student|club president|society president|student council)\b/.test(title);

      // Precedence: if the title says "Volunteer" AND the company looks
      // military (e.g. "Volunteer Reservist"), prefer volunteering. Otherwise
      // military > volunteering > leadership > professional.
      if (looksMilitary && volunteerKeywords.test(title)) return "volunteering";
      if (looksMilitary) return "military";
      if (looksVolunteering) return "volunteering";
      if (looksLeadership) return "leadership";
      return "professional";
    };

    const mapExperience = (exp: any) => ({
      title: trunc(exp.title, 100),
      company: trunc(exp.company, 100),
      start_date: trunc(exp.start_date, 20),
      end_date: trunc(exp.end_date, 20),
      is_current: exp.is_current,
      responsibilities: trunc(exp.responsibilities, 1200),
      skills_used: safeArray(exp.skills_used).slice(0, 20).map((s) => trunc(s, 60)),
      tools_used: safeArray(exp.tools_used).slice(0, 20).map((s) => trunc(s, 60)),
      type: trunc(exp.type, 50),
      bucket: classifyExperience(exp), // "military" | "volunteering" | "professional"
    });

    const allExperiences = safeArray(experiences).slice(0, 15).map(mapExperience);
    const professionalExperiences = allExperiences.filter((e: any) => e.bucket === "professional");
    const militaryExperiences = allExperiences.filter((e: any) => e.bucket === "military");
    const volunteeringExperiences = allExperiences.filter((e: any) => e.bucket === "volunteering");
    const leadershipExperiences = allExperiences.filter((e: any) => e.bucket === "leadership");

    // Hebrew inference: any Israeli location signal is treated as a hint that
    // the candidate is very likely fluent/native in Hebrew. The LLM sees this
    // as a HINT (not a fact), so it can incorporate it into languages[] when
    // the source data is silent. Users who aren't Israeli simply won't have
    // this hint injected.
    const locationHint = String(profile.location || "").toLowerCase();
    const likelyLanguages: string[] = [];
    if (/\b(israel|tel aviv|jerusalem|haifa|herzliya|ramat|netanya|rehovot|beer sheva|be'?er sheva|eilat|ashdod|petah tikva)\b/.test(locationHint)) {
      likelyLanguages.push("Hebrew (likely native or fluent — candidate is based in Israel)");
    }

    const userContext = {
      full_name: trunc(profile.full_name, 100),
      email: trunc(user.email, 200),
      phone_number: trunc(profile.phone_number, 30),
      location: trunc(profile.location, 100),
      linkedin_url: trunc(profile.linkedin_url, 200),
      summary: trunc(profile.summary, 800),
      primary_domain: trunc(profile.primary_domain, 100),
      cv_tailoring_strategy: trunc(profile.cv_tailoring_strategy, 600),
      skills: safeArray(profile.skills).slice(0, 50).map((s) => trunc(s, 60)),
      // Pre-bucketed experiences — the LLM MUST honor these groupings and
      // must preserve `title` and `company` verbatim from each entry.
      professional_experiences: professionalExperiences,
      military_experiences: militaryExperiences,
      volunteering_experiences: volunteeringExperiences,
      leadership_experiences: leadershipExperiences,
      // If the user is in Israel and has nothing explicit about languages in
      // their skills list, this hint lets the LLM include Hebrew in languages[].
      language_hints: likelyLanguages,
      projects: safeArray(projects).slice(0, 10).map((p: any) => ({
        name: trunc(p.name, 100),
        description: trunc(p.description, 500),
        skills_demonstrated: safeArray(p.skills_demonstrated).slice(0, 20).map((s) => trunc(s, 60)),
      })),
      certifications: safeArray(certifications).slice(0, 10).map((c: any) => ({
        name: trunc(c.name, 100),
        issuer: trunc(c.issuer, 100),
        date_earned: trunc(c.date_earned, 20),
      })),
      education: {
        degree: trunc(profile.degree, 100),
        field_of_study: trunc(profile.field_of_study, 100),
        education_level: trunc(profile.education_level, 50),
        gpa: trunc(profile.gpa, 10),
        honors: safeArray(profile.honors).slice(0, 15).map((h) => trunc(h, 200)),
        relevant_coursework: safeArray(profile.relevant_coursework).slice(0, 20).map((c) => trunc(c, 100)),
      },
      // Optional pre-university / high-school entry. Users without one will
      // see this as null and the renderer will skip the entry cleanly.
      secondary_education: profile.secondary_education && typeof profile.secondary_education === "object"
        ? {
            institution: trunc((profile.secondary_education as any).institution, 200),
            location: trunc((profile.secondary_education as any).location, 200),
            dates: trunc((profile.secondary_education as any).dates, 40),
            highlights: safeArray((profile.secondary_education as any).highlights).slice(0, 6).map((h) => trunc(h, 200)),
          }
        : null,
      // Rich pre-scored evidence from the onboarding analyzer. Helps the LLM
      // pick which experiences to emphasize without inventing metrics.
      proof_signals: safeArray(profile.proof_signals).slice(0, 20),
      target_application: application_id ? {
        company: targetCompany,
        role_title: safeTargetRole,
      } : null,
    };

    // --- Deterministic role lookup (replaces full library dump) ---
    const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, " ").trim();
    const targetNormalized = normalize(safeTargetRole);

    const targetRoleDef = (roleLibrary as any).roles.find((r: any) =>
      r.role_id === safeTargetRole ||
      r.id === safeTargetRole ||
      (r.title && normalize(r.title) === targetNormalized) ||
      (r.standardized_title && normalize(r.standardized_title) === targetNormalized)
    );

    const targetMapping = (roleSkillMapping as any).role_skill_mapping.find((m: any) =>
      m.role_id === (targetRoleDef?.role_id || targetRoleDef?.id || safeTargetRole)
    );

    const library_match = Boolean(targetRoleDef);

    // Collect skill IDs from both possible mapping schemas
    const allSkillIds = new Set<string>();
    if (targetMapping) {
      const flatBuckets = [
        ...(targetMapping.core_skills || []),
        ...(targetMapping.secondary_skills || []),
        ...(targetMapping.differentiator_skills || []),
      ];
      const nested = targetMapping.skills || {};
      const nestedBuckets = [
        ...(nested.core || []),
        ...(nested.secondary || []),
        ...(nested.differentiator || []),
      ];
      [...flatBuckets, ...nestedBuckets].forEach((entry: any) => {
        if (typeof entry === "string") allSkillIds.add(entry);
        else if (entry && typeof entry.skill_id === "string") allSkillIds.add(entry.skill_id);
      });
    }

    const relevantSkills = (skillLibrary as any).skill_library.filter(
      (s: any) => allSkillIds.has(s.skill_id || s.id)
    );

    const relevantSignals = (proofSignalLibrary as any).proof_signal_library.filter(
      (ps: any) => {
        const signalSkills = ps.mapped_skills || ps.skills || ps.skill_ids || [];
        return signalSkills.some((sid: any) => {
          if (typeof sid === "string") return allSkillIds.has(sid);
          if (sid && typeof sid.skill_id === "string") return allSkillIds.has(sid.skill_id);
          return false;
        });
      }
    );

    // --- Build System Prompt with Scoped Library Context ---
    // This prompt is built in three zones:
    //   1) TRUTHFULNESS — the most important rules, stated first and last.
    //   2) Structure & tailoring — what sections to produce and how to tailor
    //      to the target role / JD / company.
    //   3) Role-library context (only when a library match exists) — gives the
    //      LLM a controlled vocabulary of skills and proof signals.
    const TRUTHFULNESS_RULES = `ABSOLUTE TRUTHFULNESS & PRESERVATION RULES — THESE OVERRIDE EVERY OTHER RULE:

A. Factual integrity (no invention):
1. NEVER invent, fabricate, or estimate any metrics, percentages, numbers, dollar amounts, team sizes, or durations that aren't EXPLICITLY in the user's source data. No "reduced response time by 20%", no "managed a team of 15", no "drove $1M in pipeline" unless those exact figures appear in the source.
2. NEVER add a quantified achievement unless the user's own data contains that exact number. If a bullet would be stronger with a metric, leave it without. Weaker-but-truthful beats strong-but-false.
3. NEVER add skills, tools, certifications, experiences, education entries, or awards the user doesn't actually have in the source data. If the JD asks for SQL and the user has no SQL anywhere, do not add it.

B. Preservation (don't drop, don't paraphrase identifiers):
4. Use the EXACT job titles from the source data. Never shorten, generalize, or paraphrase a title — "Supervised and trained teams of soldiers" stays "Supervised and trained teams of soldiers", never "Soldier". "Senior Customer Success Manager" stays "Senior Customer Success Manager", never "CS Manager".
5. Use the EXACT company / institution / organization names from the source data. Don't re-capitalize, abbreviate, or translate them.
6. Preserve every bullet from the source responsibilities. Rephrase for clarity and role alignment, but do not drop content. Five source bullets in → five bullets out.
7. Include EVERY experience, education entry, certification, award, and language present in USER DATA. Do not silently omit entries because they feel less relevant — reorder them, but include them all.

C. Surfacing awards and honors:
8. If a responsibility line mentions an award (e.g. "Awarded Presidential Award for Excellence"), keep it in the bullet AND surface the award in honors_and_awards[] so it appears in a dedicated Honors & Awards section.

D. What you MAY do:
9. MAY rephrase and tighten bullets for stronger action verbs, ATS keywords, and role alignment — while preserving facts.
10. MAY reorder experiences and bullets so the most role-relevant lead.
11. MAY write a tailored About Me that connects the user's real experience to the target role and (when provided) the target company by name.
`;

    const STRUCTURE_RULES = `OUTPUT STRUCTURE:
- Produce a single JSON document (see schema below). The PDF renderer reads it verbatim.
- Omit any section the user has no data for. Do NOT return empty arrays of placeholders.
- Experiences are pre-bucketed in USER DATA. You MUST honor those buckets — route each one into the correct output array:
    • bucket === "professional" → professional_experiences[]
    • bucket === "military"     → military_experiences[]
    • bucket === "volunteering" → volunteering_experiences[]
    • bucket === "leadership"   → leadership_experiences[]
- About Me: 2-3 sentences. Tailored to the target role; if a company name is given, reference it by name. Third person is fine.
- Experience bullets: action verb + what you did. Factual, concrete. No invented metrics.
- Skills & Tools: categorize as Domain (role-specific capabilities) and Tools (software/platforms/systems). Languages do NOT go here.
- Languages: human spoken/written languages only. Draw them from the user's skills list if language-like entries are there; draw also from language_hints[] which flags likely languages based on location. Include a proficiency level (Native | Fluent | Professional | Conversational | Basic) when the source or hint supports it, otherwise omit level.
- Education: include every entry from USER DATA.education and — if present — USER DATA.secondary_education as a second education entry. Do not drop pre-university education.
- Honors & Awards: include USER DATA.education.honors verbatim and any awards mentioned inside experience responsibilities.
- Military Service: preserve unit names and ranks (titles), but phrase bullets in civilian-readable language.
- Never keyword-stuff. JD keywords appear only where they genuinely apply to real experience.
`;

    const TAILORING_RULES = `TAILORING RULES:
- If TARGET COMPANY is provided, reference it by name in About Me and lightly echo its domain (e.g. "trade finance", "B2B fintech") if the JD signals it.
- If JOB DESCRIPTION is provided, reorder experience bullets so those demonstrating JD-relevant skills come first within each role.
- If the JD names specific tools/skills, surface the user's matching tools/skills prominently in the Skills section — but only if they are actually in the user's profile.
- If the JD requires a qualification the user lacks (e.g. a specific degree), do NOT pretend they have it. The Fit Analysis section will honestly flag this.

STRONG ACTION VERBS TO USE:
Led, Built, Managed, Owned, Delivered, Launched, Developed, Implemented, Drove, Executed, Designed, Analyzed, Coordinated, Streamlined, Improved, Reduced, Increased, Generated, Negotiated, Trained, Supported, Collaborated
`;

    const LIBRARY_CONTEXT = library_match ? `ROLE-LIBRARY CONTEXT (controlled vocabulary — use to pick which of the user's real skills to emphasize; DO NOT use to invent skills the user doesn't have):

TARGET ROLE DEFINITION:
${JSON.stringify(targetRoleDef, null, 2)}

ROLE-SKILL MAPPING (core = must-haves, secondary = nice-to-haves, differentiator = standouts):
${JSON.stringify(targetMapping, null, 2)}

RELEVANT SKILLS (only the skills mapped to this role):
${JSON.stringify(relevantSkills, null, 2)}

RELEVANT PROOF SIGNALS (map user experiences to these signals when possible):
${JSON.stringify(relevantSignals, null, 2)}
` : `NOTE: The target role was not found in the standardized role library. Tailor strictly using the job description and the user's actual profile data.\n`;

    const systemPrompt =
      `You are a CV Generation Engine for the "Get A Job" Career Operating System. Your job is to produce a tailored, one-page, truthful CV as JSON. The CV WILL be sent to real employers — so every word must be grounded in the user's actual data.\n\n` +
      TRUTHFULNESS_RULES + `\n` +
      STRUCTURE_RULES + `\n` +
      TAILORING_RULES + `\n` +
      LIBRARY_CONTEXT + `\n` +
      `REMINDER: Truthfulness beats polish. If a bullet needs a metric to sound impressive but you have no metric in the source, leave it without. Do not invent.`;

    const userPrompt = `TARGET ROLE: ${safeTargetRole}
${targetCompany ? `TARGET COMPANY: ${targetCompany}` : ""}

${safeJobDescription ? `JOB DESCRIPTION:\n${safeJobDescription}\n` : "(No job description provided — tailor using the target role and user profile only.)"}

USER DATA:
${JSON.stringify(userContext, null, 2)}

TASK:
Produce a tailored, truthful, one-page CV for this user as JSON matching the exact schema below.

OUTPUT SCHEMA (JSON):
{
  "header": {
    "name": "string — exact full name from USER DATA",
    "title": "string — the target role title",
    "email": "string",
    "phone": "string — only if USER DATA.phone_number is non-empty",
    "location": "string",
    "linkedin": "string — linkedin URL or handle"
  },
  "about_me": "string — 2-3 sentences, tailored to the target role and (if given) target company. No invented metrics.",
  "professional_experiences": [
    { "title": "string — EXACT title from USER DATA", "company": "string — EXACT company from USER DATA", "dates": "string", "bullets": ["concrete factual action-verb statement"] }
  ],
  "military_experiences": [
    { "title": "string — EXACT role/rank from USER DATA", "unit": "string — EXACT unit from USER DATA", "dates": "string", "bullets": ["civilian-readable bullet"] }
  ],
  "volunteering_experiences": [
    { "title": "string — EXACT title from USER DATA", "organization": "string — EXACT org from USER DATA", "dates": "string", "bullets": ["what the user did"] }
  ],
  "leadership_experiences": [
    { "title": "string — EXACT title", "organization": "string — EXACT org", "dates": "string", "bullets": ["factual statement"] }
  ],
  "education": [
    { "institution": "string — EXACT institution", "degree": "string — EXACT degree/field", "dates": "string", "gpa": "string — only if explicitly in USER DATA and strong", "coursework": ["course1", "course2"], "highlights": ["leadership role, club, or position held DURING this education — NOT awards. Awards belong in honors_and_awards[] only."] }
  ],
  "skills": {
    "domain": ["role-specific capability 1", "role-specific capability 2"],
    "tools": ["software/platform 1", "software/platform 2"]
  },
  "languages": [
    { "language": "English", "level": "Native | Fluent | Professional | Conversational | Basic" }
  ],
  "honors_and_awards": ["verbatim award string"],
  "certifications": [
    { "name": "string", "issuer": "string", "date": "string" }
  ],
  "projects": [
    { "name": "string", "bullets": ["what was built and the result, factual only"] }
  ],
  "fit_analysis": {
    "skill_match_percentage": 0,
    "alignment": "Strong | Moderate | Weak",
    "major_gaps": ["gap1", "gap2"],
    "explanation": "honest 1-2 sentence assessment of fit"
  }
}

SPECIFIC OUTPUT RULES:
- "professional_experiences" contains ONLY entries whose \`bucket\` in USER DATA is "professional". Military → military_experiences[]. Volunteering → volunteering_experiences[]. Leadership → leadership_experiences[].
- Every experience title and company/unit/organization must be COPIED VERBATIM from USER DATA. Do not shorten, generalize, or paraphrase them. If the source title is "Supervised and trained teams of soldiers", that is the title you output.
- Every bullet must trace to something in the user's responsibilities text. Rephrase, don't invent.
- If a responsibility line mentions an award (e.g. "Awarded Presidential Award for Excellence"), keep the mention AND add the award to honors_and_awards[].
- If USER DATA.secondary_education is non-null, add it as a SECOND entry in education[] (institution, the secondary_education object's dates/highlights). Do not drop it because it's pre-university.
- Languages: include every language signal from USER DATA.skills, USER DATA.summary, and USER DATA.language_hints. A user based in Israel (language_hints will show this) should include Hebrew at a reasonable level. English is essentially always applicable for professional roles; infer a sensible level from the rest of the data.
- fit_analysis.skill_match_percentage is an integer 0-100. Compute honestly: how many of the JD's core requirements does this candidate actually meet? An entry-level candidate with clearly-transferable experience should score 40-70%. A perfect match should score 80-95%. Never output 0% unless the candidate has no overlap at all — 0% is almost never correct for a real candidate.
- Return ONLY valid JSON. No markdown, no prose outside the JSON object.`;

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return json({ error: "OpenAI API key not configured on server" }, 500);
    }

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(45000),
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2, // lower = less likely to invent metrics
        max_tokens: 4096,
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      return json({ error: `OpenAI error: ${err}` }, 500);
    }

    const openaiData = await openaiRes.json();
    let cvData: Record<string, any>;
    try {
      cvData = JSON.parse(openaiData.choices?.[0]?.message?.content || "{}");
    } catch {
      return json({ error: "AI returned an invalid response format. Please try again." }, 500);
    }

    // ─── Post-process: reconcile titles + companies against source data ───
    // The LLM sometimes shortens titles ("Supervised and trained teams of
    // soldiers" → "Soldier") or reformats company names. We match each output
    // entry back to its source experience by dates (cheapest stable key) and
    // force the DB's title/company/unit/organization onto the output. This
    // guarantees the "EXACT titles" rule even when the LLM paraphrases.
    const normDates = (s: unknown) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
    const matchSource = (outDates: string, sources: any[]) => {
      const key = normDates(outDates);
      if (!key) return null;
      // Exact-or-contains match on dates. Good enough given there are only a
      // handful of experiences per user; dates are distinctive.
      return sources.find((s) => {
        const srcKey = normDates(`${s.start_date} ${s.end_date || s.is_current ? "present" : ""}`) ||
                        normDates(`${s.start_date} - ${s.end_date}`);
        return srcKey === key || srcKey.includes(key) || key.includes(srcKey);
      }) || sources.find((s) => normDates(s.start_date) && key.includes(normDates(s.start_date)));
    };

    const reconcile = (outList: any[], sources: any[], titleField: string, orgField: string) => {
      if (!Array.isArray(outList)) return;
      for (const entry of outList) {
        const src = matchSource(entry.dates, sources);
        if (!src) continue;
        // Preserve source title (e.g. "Supervised and trained teams of soldiers").
        if (src.title) entry[titleField] = src.title;
        // Preserve source company / unit / organization.
        if (src.company) entry[orgField] = src.company;
      }
    };

    reconcile(cvData.professional_experiences, professionalExperiences, "title", "company");
    reconcile(cvData.military_experiences, militaryExperiences, "title", "unit");
    reconcile(cvData.volunteering_experiences, volunteeringExperiences, "title", "organization");
    reconcile(cvData.leadership_experiences, leadershipExperiences, "title", "organization");

    // Sanity-floor the fit percentage. The LLM very occasionally returns 0
    // for a candidate who does have overlap — we floor at a low but non-zero
    // value and recompute alignment bucket from the number. This never
    // inflates a genuine poor fit above "Weak", it just stops misleading 0s.
    const fa = (cvData.fit_analysis || {}) as any;
    let pct = Number(fa.skill_match_percentage);
    if (!Number.isFinite(pct) || pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    // Only floor if we have any experience/skills/projects at all — keep a
    // genuinely empty profile at 0.
    const hasAnyData = (allExperiences.length + (userContext.skills?.length || 0) + (userContext.projects?.length || 0)) > 0;
    if (pct === 0 && hasAnyData) pct = 20;
    fa.skill_match_percentage = Math.round(pct);
    if (!fa.alignment || typeof fa.alignment !== "string") {
      fa.alignment = pct >= 70 ? "Strong" : pct >= 40 ? "Moderate" : "Weak";
    }
    cvData.fit_analysis = fa;

    // --- Generate PDF (professional, single-page layout) ---
    // Typography is tuned so an entry-level CV (4-5 experiences + military +
    // volunteering + honors + languages) fits on one A4 page. If a user has
    // significantly more content the renderer will still paginate cleanly,
    // but the target is one page for the common case.
    const doc = new jsPDF();
    const leftMargin = 14;
    const rightMargin = 196;
    const pageWidth = rightMargin - leftMargin;
    const pageBottom = 285;
    const ACCENT: [number, number, number] = [37, 99, 235];
    const MUTED: [number, number, number] = [90, 90, 95];
    const SUBTLE: [number, number, number] = [130, 130, 135];
    const TOP_Y = 14;
    let y = TOP_Y;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageBottom) {
        doc.addPage();
        y = TOP_Y;
      }
    };
    const addSpace = (space = 1) => { y += space; };

    const setFont = (weight: "bold" | "normal", size: number, color: [number, number, number]) => {
      doc.setFont("helvetica", weight);
      doc.setFontSize(size);
      doc.setTextColor(color[0], color[1], color[2]);
    };

    const addSectionHeader = (title: string) => {
      ensureSpace(8);
      y += 1.5;
      setFont("bold", 9, ACCENT);
      doc.text(title.toUpperCase(), leftMargin, y);
      y += 1.3;
      doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
      doc.setLineWidth(0.35);
      doc.line(leftMargin, y, rightMargin, y);
      y += 3.5;
    };

    const addEntryHeader = (title: string, dates?: string, subtitle?: string) => {
      ensureSpace(subtitle ? 8.5 : 5);
      setFont("bold", 10, [0, 0, 0]);
      doc.text(String(title || ""), leftMargin, y);
      if (dates) {
        setFont("normal", 8.5, SUBTLE);
        doc.text(String(dates), rightMargin, y, { align: "right" });
      }
      y += 4.0;
      if (subtitle) {
        setFont("normal", 9, MUTED);
        doc.text(String(subtitle), leftMargin, y);
        y += 3.8;
      }
    };

    const addBullet = (text: string) => {
      const indent = 3.5;
      setFont("normal", 9, [20, 20, 20]);
      const lines = doc.splitTextToSize(String(text || ""), pageWidth - indent);
      lines.forEach((line: string, i: number) => {
        ensureSpace(4);
        const prefix = i === 0 ? "\u2022  " : "   ";
        doc.text(prefix + line, leftMargin + indent, y);
        y += 3.8;
      });
    };

    const addParagraph = (text: string, fontSize = 9.5, color: [number, number, number] = [25, 25, 25]) => {
      setFont("normal", fontSize, color);
      const lines = doc.splitTextToSize(String(text || ""), pageWidth);
      lines.forEach((line: string) => {
        ensureSpace(fontSize * 0.5 + 0.5);
        doc.text(line, leftMargin, y);
        y += fontSize * 0.5;
      });
    };

    // Label: value — wraps values onto continuation lines aligned after the label.
    const addLabelledLine = (label: string, values: string[] | string) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return;
      ensureSpace(5);
      setFont("bold", 9, [0, 0, 0]);
      const labelText = `${label}: `;
      doc.text(labelText, leftMargin, y);
      const labelWidth = doc.getTextWidth(labelText);
      setFont("normal", 9, [25, 25, 25]);
      const valueText = Array.isArray(values) ? values.join(", ") : String(values);
      const lines = doc.splitTextToSize(valueText, pageWidth - labelWidth);
      lines.forEach((line: string, i: number) => {
        ensureSpace(4);
        doc.text(line, i === 0 ? leftMargin + labelWidth : leftMargin + labelWidth, y);
        y += 3.8;
      });
    };

    // Sub-section heading inside a top-level section (e.g. "Professional
    // Experience" inside "EXPERIENCE"). Smaller + bold in black, no rule.
    const addSubsectionHeading = (text: string) => {
      ensureSpace(7);
      y += 1;
      setFont("bold", 9.5, [0, 0, 0]);
      doc.text(String(text), leftMargin, y);
      y += 3.6;
    };

    // --- Header (name / target role / contact) ---
    const header = (cvData.header || {}) as any;
    setFont("bold", 18, [0, 0, 0]);
    doc.text(String(header.name || userContext.full_name || ""), leftMargin, y);
    y += 6.5;

    if (header.title) {
      setFont("normal", 11, ACCENT);
      doc.text(String(header.title), leftMargin, y);
      y += 4.5;
    }

    // Only include contact bits that actually have a value — don't create
    // gaps. Each entry is trimmed and skipped if empty.
    const contactBits: string[] = [];
    const pushBit = (v: string | null | undefined) => {
      const s = (v ?? "").toString().trim();
      if (s) contactBits.push(s);
    };
    pushBit(header.location || userContext.location);
    pushBit(header.email || userContext.email);
    pushBit(header.phone || userContext.phone_number);
    pushBit(header.linkedin || userContext.linkedin_url);
    if (contactBits.length > 0) {
      setFont("normal", 8.5, MUTED);
      const contactLine = contactBits.join("  \u00B7  ");
      const lines = doc.splitTextToSize(contactLine, pageWidth);
      lines.forEach((line: string) => { doc.text(line, leftMargin, y); y += 3.6; });
    }

    y += 0.5;
    doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.setLineWidth(0.8);
    doc.line(leftMargin, y, rightMargin, y);
    y += 2.5;

    // --- About Me ---
    if (cvData.about_me) {
      addSectionHeader("About Me");
      addParagraph(String(cvData.about_me), 9.5);
    }

    // --- EXPERIENCE (umbrella section with sub-headings) ---
    // Pulls from four possible buckets. Each sub-heading is rendered only if
    // its bucket has at least one entry. Older schema variants are accepted
    // as fallbacks (e.g. military_service{} single-object, experiences[] as
    // "professional"), so older in-flight responses don't produce blanks.
    const professional: any[] = Array.isArray(cvData.professional_experiences)
      ? cvData.professional_experiences
      : (Array.isArray(cvData.experiences) ? cvData.experiences : []);
    const militaryList: any[] = Array.isArray(cvData.military_experiences)
      ? cvData.military_experiences
      : (cvData.military_service && cvData.military_service.unit ? [cvData.military_service] : []);
    const volunteeringList: any[] = Array.isArray(cvData.volunteering_experiences)
      ? cvData.volunteering_experiences
      : (Array.isArray(cvData.volunteering) ? cvData.volunteering : []);
    const leadershipList: any[] = Array.isArray(cvData.leadership_experiences)
      ? cvData.leadership_experiences
      : [];

    const hasAnyExperience =
      professional.length + militaryList.length + volunteeringList.length + leadershipList.length > 0;

    if (hasAnyExperience) {
      addSectionHeader("Experience");

      const renderEntries = (
        entries: any[],
        titleKey: string,
        subtitleKey: string,
      ) => {
        entries.forEach((exp: any, idx: number) => {
          addEntryHeader(exp[titleKey] || "", exp.dates, exp[subtitleKey]);
          (exp.bullets || []).forEach((bullet: string) => addBullet(bullet));
          if (idx < entries.length - 1) addSpace(1.2);
        });
      };

      if (professional.length > 0) {
        addSubsectionHeading("Professional Experience");
        renderEntries(professional, "title", "company");
      }
      if (militaryList.length > 0) {
        if (professional.length > 0) addSpace(1.2);
        addSubsectionHeading("Military Service");
        // Military entries use "unit" as the sub-line; the reconcile step
        // already wrote the DB company into .unit.
        renderEntries(militaryList, "title", "unit");
      }
      if (volunteeringList.length > 0) {
        if (professional.length + militaryList.length > 0) addSpace(1.2);
        addSubsectionHeading("Volunteering");
        renderEntries(volunteeringList, "title", "organization");
      }
      if (leadershipList.length > 0) {
        if (professional.length + militaryList.length + volunteeringList.length > 0) addSpace(1.2);
        addSubsectionHeading("Leadership");
        renderEntries(leadershipList, "title", "organization");
      }
    }

    // --- Education (university + secondary, rendered top-down) ---
    // The LLM emits education[] — we append the pre-university slot as a
    // second entry so any user who filled secondary_education in their
    // profile gets it on the CV. If the LLM already included it we'd have
    // duplicates, so we dedupe loosely by institution.
    const llmEducation: any[] = Array.isArray(cvData.education) ? cvData.education : [];
    const secondary = (userContext as any).secondary_education;
    const normInst = (s: unknown) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

    const mergedEducation: any[] = [...llmEducation];
    if (secondary && secondary.institution) {
      const already = mergedEducation.some((e) => normInst(e.institution) === normInst(secondary.institution));
      if (!already) {
        mergedEducation.push({
          institution: secondary.institution,
          degree: "", // secondary ed has no degree field
          dates: secondary.dates,
          coursework: [],
          highlights: secondary.highlights || [],
          _secondary_location: secondary.location,
        });
      }
    }

    if (mergedEducation.length > 0) {
      addSectionHeader("Education");
      // Pre-compute a normalized set of honors so we can dedupe any highlight
      // that's really an award — the LLM sometimes puts honors in both places.
      const honorsSet = new Set(
        safeArray(cvData.honors_and_awards)
          .map((s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase())
          .filter(Boolean),
      );
      mergedEducation.forEach((edu: any, idx: number) => {
        // Institution is the primary identifier for an education entry; the
        // degree + specialization sits below (or is empty for secondary ed).
        const topLine = edu.degree?.trim() ? edu.degree : edu.institution;
        const subLine = edu.degree?.trim() ? edu.institution : (edu._secondary_location || "");
        addEntryHeader(topLine || "", edu.dates, subLine);
        if (edu.gpa) addBullet(`GPA: ${edu.gpa}`);
        const coursework = safeArray(edu.coursework || edu.relevant_coursework);
        if (coursework.length > 0) {
          addBullet(`Relevant coursework: ${coursework.join(", ")}`);
        }
        // Skip any highlight that duplicates an entry in honors_and_awards[]
        // — those render in the dedicated Honors & Awards section below.
        safeArray(edu.highlights).forEach((h) => {
          const key = String(h || "").replace(/\s+/g, " ").trim().toLowerCase();
          if (key && !honorsSet.has(key)) addBullet(String(h));
        });
        // Legacy shape — render any loose details strings if present.
        safeArray(edu.details).forEach((d) => {
          const key = String(d || "").replace(/\s+/g, " ").trim().toLowerCase();
          if (key && !honorsSet.has(key)) addBullet(String(d));
        });
        if (idx < mergedEducation.length - 1) addSpace(1.2);
      });
    }

    // --- Skills & Tools ---
    const skills = (cvData.skills || {}) as any;
    const hasSkills = (skills.domain?.length || skills.tools?.length);
    if (hasSkills) {
      addSectionHeader("Skills & Tools");
      if (skills.domain?.length > 0) addLabelledLine("Domain", skills.domain);
      if (skills.tools?.length > 0) addLabelledLine("Tools", skills.tools);
    }

    // --- Languages (own section so they don't get lost inside Skills) ---
    // Accept both the new languages[{language, level}] shape and the legacy
    // skills.languages string[] shape.
    let languageLines: string[] = [];
    if (Array.isArray(cvData.languages)) {
      languageLines = (cvData.languages as any[])
        .map((l) => {
          if (!l) return "";
          if (typeof l === "string") return l;
          const lang = String(l.language || "").trim();
          const level = String(l.level || "").trim();
          return lang && level ? `${lang} (${level})` : lang;
        })
        .filter((s) => s.length > 0);
    } else if (Array.isArray(skills.languages)) {
      languageLines = (skills.languages as any[]).map((s) => String(s)).filter(Boolean);
    }
    if (languageLines.length > 0) {
      addSectionHeader("Languages");
      addLabelledLine("Languages", languageLines);
    }

    // --- Honors & Awards ---
    const honors = safeArray(cvData.honors_and_awards);
    if (honors.length > 0) {
      addSectionHeader("Honors & Awards");
      honors.forEach((h) => addBullet(String(h)));
    }

    // --- Certifications ---
    const certs = Array.isArray(cvData.certifications) ? cvData.certifications : [];
    if (certs.length > 0) {
      addSectionHeader("Certifications");
      certs.forEach((cert: any) => {
        const parts: string[] = [];
        if (cert.name) parts.push(String(cert.name));
        if (cert.issuer) parts.push(String(cert.issuer));
        const line = parts.join(" \u2014 ") + (cert.date ? `  (${cert.date})` : "");
        addParagraph(line, 9);
      });
    }

    // --- Projects ---
    const projectsOut = Array.isArray(cvData.projects) ? cvData.projects : [];
    if (projectsOut.length > 0) {
      addSectionHeader("Projects");
      projectsOut.forEach((proj: any, idx: number) => {
        addEntryHeader(proj.name || "", undefined, undefined);
        (proj.bullets || []).forEach((bullet: string) => addBullet(bullet));
        if (idx < projectsOut.length - 1) addSpace(1.2);
      });
    }

    const pdfBuffer = doc.output("arraybuffer");
    const safeRole = safeTargetRole.replace(/[^a-zA-Z0-9_\-]/g, "_");
    const fileName = `${user.id}/${safeRole}_CV_${Date.now()}.pdf`;

    const { error: uploadError } = await serviceClient.storage
      .from("cvs")
      .upload(fileName, pdfBuffer, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      return json({ error: `PDF upload failed: ${uploadError.message}` }, 500);
    }

    const { data: signedUrlData, error: signedUrlError } = await serviceClient.storage
      .from("cvs")
      .createSignedUrl(fileName, 315360000);

    if (signedUrlError || !signedUrlData) {
      return json({ error: "Failed to generate CV download URL" }, 500);
    }
    const cv_url = signedUrlData.signedUrl;

    let appRecord;
    if (application_id) {
      const { data } = await supabase.from("applications").update({
        cv_url,
        cv_status: "ready",
        cv_version_name: `${safeTargetRole} CV`,
        cv_skills_emphasized: (cvData.skills as any)?.domain || []
      }).eq("id", application_id).eq("user_id", user.id).select().single();
      if (!data) { return json({ error: "Application not found or not owned by user." }, 404); }
      appRecord = data;
    } else {
      const { data } = await supabase.from("applications").insert({
        user_id: user.id,
        role_title: safeTargetRole,
        cv_url,
        cv_status: "ready",
        cv_version_name: `${safeTargetRole} CV`,
        cv_skills_emphasized: (cvData.skills as any)?.domain || [],
        status: "interested"
      }).select().single();
      appRecord = data;
    }

    return json({
      cv_url,
      application_id: appRecord?.id,
      fit_analysis: cvData.fit_analysis,
      library_match,
      message: `CV generated for "${safeTargetRole}". Download it using the link, and it's been saved to your Application Tracker.`,
    });
  } catch (error) {
    console.error("generate-tailored-cv error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
