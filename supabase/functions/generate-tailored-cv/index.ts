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

    // Classify each experience into professional / military / volunteering.
    // `experiences.type` is unreliable here — every row for our test user is
    // tagged "full_time" even though one is clearly military and another is
    // volunteering. So we infer from the COMPANY and TITLE fields only.
    //
    // Key lesson from the first rev: do NOT match keywords inside the
    // responsibilities text. That caused a false positive where a Program
    // Coordinator role got classified as military because its curriculum
    // description mentioned "military benefits". The company/title fields are
    // structured; the responsibilities text is free-form and noisy.
    const classifyExperience = (exp: any): "military" | "volunteering" | "professional" => {
      const company = String(exp.company || "").toLowerCase();
      const title = String(exp.title || "").toLowerCase();
      const type = String(exp.type || "").toLowerCase();

      // Military: look for unit names, service branches, or ranks in company
      // or title. Intentionally strict — prefer missing a military role over
      // mis-tagging a civilian one (misclassification is dishonest).
      const militaryKeywords =
        /\b(idf|israel\s?defense\s?forces|nahal|golani|givati|paratroopers?|sayeret|unit\s?8200|8200|army|brigade|platoon|battalion|regiment|commander|sergeant|corporal|lieutenant|captain|staff\s?sergeant|reservist|conscript|military\s?service|military\s?role)\b/;
      const looksMilitary = militaryKeywords.test(company) || militaryKeywords.test(title) || type === "military";

      // Volunteering: keyword in title or an explicit volunteer/ngo signal in
      // the company name. "Volunteer Educator", "Volunteer Coordinator", etc.
      const volunteerKeywords = /\b(volunteer(ed|ing)?|voluntary|pro\s?bono)\b/;
      const ngoCompany = /\b(ngo|non[-\s]?profit|charity|foundation)\b/;
      const looksVolunteering =
        volunteerKeywords.test(title) ||
        volunteerKeywords.test(company) ||
        ngoCompany.test(company) ||
        type === "volunteering" ||
        type === "volunteer";

      // Precedence: military > volunteering > professional. But if a title says
      // "Volunteer …" AND matches military via company, prefer volunteering.
      if (looksMilitary && volunteerKeywords.test(title)) return "volunteering";
      if (looksMilitary) return "military";
      if (looksVolunteering) return "volunteering";
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
      // Pre-bucketed experiences — the LLM should honor these groupings.
      professional_experiences: professionalExperiences,
      military_experiences: militaryExperiences,
      volunteering_experiences: volunteeringExperiences,
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
    const TRUTHFULNESS_RULES = `ABSOLUTE TRUTHFULNESS RULES — THESE OVERRIDE EVERY OTHER RULE BELOW:
1. NEVER invent, fabricate, or estimate any metrics, percentages, numbers, dollar amounts, team sizes, durations, or statistics that are not EXPLICITLY present in the user's original resume or profile data. No "reduced response time by 20%", no "managed a team of 15", no "drove $1M in pipeline" unless those exact numbers appear in the source.
2. NEVER add a quantified achievement ("improved X by Y%", "reduced by Z%") unless the user's own data contains that exact number. If a bullet would be stronger with a metric, leave it without one. "Weaker but truthful" beats "strong but false".
3. You MAY rephrase, tighten, and restructure the user's existing bullet points to better align with the target role — but the factual content must be preserved. Same achievements, cleaner wording, stronger action verbs.
4. You MAY reorder experiences and emphasize different skills to align with the job description. Lead with the most relevant.
5. You MAY write a tailored About Me that connects the user's REAL experience to the target role and (if provided) the specific company.
6. NEVER add skills, tools, languages, certifications, or experiences the user doesn't actually have in the source data. If the JD asks for SQL and the user has no SQL anywhere in their profile, do not add it.
7. Preserve every bullet point from the user's original experiences — rephrase to align with the target role, but do not drop content. If an experience has 5 responsibilities in the source, your output should cover all 5.
8. If the user's experience responsibilities mention a specific award or honor (e.g. "Awarded Presidential Award for Excellence"), ALSO surface it in the honors[] output array so it appears in a dedicated Honors & Awards section.
`;

    const STRUCTURE_RULES = `CV STRUCTURE RULES:
- Sections in this order: Header → About Me → Professional Experience → Military Service → Volunteering → Education → Skills & Tools → Languages → Honors & Awards → Certifications → Projects.
- Omit any section the user has no data for (e.g. no military → no Military Service section).
- Do NOT merge Professional Experience, Military Service, and Volunteering into one section — they must be separate. Use the \`bucket\` field on each experience in USER DATA to decide which section it belongs in.
- About Me: 2-3 sentences. Third person is fine. Must be tailored to the target role and (if a company name is given) reference the company or its domain.
- Experience bullets: action verb + what you did. Factual and concrete. No invented metrics.
- Skills & Tools: categorize as Domain (role-specific skills), Tools (software/platforms). Do NOT put languages here.
- Languages: spoken/written human languages only (English, Spanish, Hebrew, etc.). Only include languages the user has actually listed somewhere in their data — check skills[] for language-like entries and the profile summary. Mark level when known.
- Honors & Awards: include the user's honors[] plus any awards mentioned inside experience responsibilities (e.g. "Presidential Award for Excellence" inside a military role).
- Military Service: preserve military terminology (Unit name, rank) but write responsibilities in civilian-readable language.
- Never keyword-stuff. Keywords from the JD should appear naturally only where they actually apply to the user's real experience.
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
    "name": "string",
    "title": "string — the target role title",
    "email": "string",
    "phone": "string",
    "location": "string",
    "linkedin": "string — linkedin URL or handle"
  },
  "about_me": "string — 2-3 sentences, tailored to the target role and (if given) target company. No invented metrics.",
  "experiences": [
    { "title": "string", "company": "string", "dates": "string — e.g. Oct 2025 – Present", "bullets": ["concrete factual action-verb statement"] }
  ],
  "military_experiences": [
    { "unit": "string — e.g. Nahal Brigade, IDF", "role": "string — rank/role", "dates": "string", "bullets": ["civilian-readable bullet"] }
  ],
  "volunteering": [
    { "title": "string", "organization": "string", "dates": "string", "bullets": ["what the user did"] }
  ],
  "education": [
    { "institution": "string", "degree": "string", "dates": "string", "gpa": "string — only if strong", "coursework": ["course1", "course2"] }
  ],
  "skills": {
    "domain": ["role-specific skill 1", "role-specific skill 2"],
    "tools": ["software/platform 1", "software/platform 2"]
  },
  "languages": [
    { "language": "English", "level": "Native | Fluent | Professional | Conversational" }
  ],
  "honors_and_awards": ["Presidential Award for Excellence (2022)", "Heseg Scholarship"],
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

RULES FOR THIS OUTPUT:
- Omit any section the user has no data for. Do NOT emit empty arrays filled with placeholder text.
- "experiences" contains ONLY entries whose \`bucket\` in USER DATA is "professional". Route "military" entries to "military_experiences" and "volunteering" entries to "volunteering".
- Every bullet must be traceable to something in the user's responsibilities text — do not invent achievements or metrics.
- If a user responsibility line mentions an award (e.g. "Awarded Presidential Award for Excellence"), keep the mention in the bullet AND also add the award to honors_and_awards.
- Languages: only include languages that appear somewhere in USER DATA. Infer levels only when the data supports it (e.g. native location/country, or an explicit "fluent" mention). Otherwise omit the level.
- If target company is given, the About Me should reference it by name.
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

    // --- Generate PDF (professional layout) ---
    const doc = new jsPDF();
    const leftMargin = 15;
    const rightMargin = 195;
    const pageWidth = rightMargin - leftMargin;
    const pageBottom = 282;
    const ACCENT: [number, number, number] = [37, 99, 235];
    const MUTED: [number, number, number] = [90, 90, 95];
    const SUBTLE: [number, number, number] = [130, 130, 135];
    let y = 18;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageBottom) {
        doc.addPage();
        y = 18;
      }
    };
    const addSpace = (space = 3) => { y += space; };

    const setFont = (weight: "bold" | "normal", size: number, color: [number, number, number]) => {
      doc.setFont("helvetica", weight);
      doc.setFontSize(size);
      doc.setTextColor(color[0], color[1], color[2]);
    };

    const addSectionHeader = (title: string) => {
      ensureSpace(10);
      y += 3;
      setFont("bold", 10, ACCENT);
      doc.text(title.toUpperCase(), leftMargin, y);
      y += 1.6;
      doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
      doc.setLineWidth(0.4);
      doc.line(leftMargin, y, rightMargin, y);
      y += 4.5;
    };

    // Two-line entry header: bold title on the left, muted dates right-aligned,
    // then a lighter subtitle (company / institution) under it.
    const addEntryHeader = (title: string, dates?: string, subtitle?: string) => {
      ensureSpace(subtitle ? 10.5 : 6);
      setFont("bold", 10.5, [0, 0, 0]);
      doc.text(String(title || ""), leftMargin, y);
      if (dates) {
        setFont("normal", 9, SUBTLE);
        doc.text(String(dates), rightMargin, y, { align: "right" });
      }
      y += 4.6;
      if (subtitle) {
        setFont("normal", 9.5, MUTED);
        doc.text(String(subtitle), leftMargin, y);
        y += 4.4;
      }
    };

    const addBullet = (text: string) => {
      const indent = 4;
      setFont("normal", 9.5, [20, 20, 20]);
      const lines = doc.splitTextToSize(String(text || ""), pageWidth - indent);
      lines.forEach((line: string, i: number) => {
        ensureSpace(5);
        const prefix = i === 0 ? "\u2022  " : "   ";
        doc.text(prefix + line, leftMargin + indent, y);
        y += 4.3;
      });
    };

    const addParagraph = (text: string, fontSize = 10, color: [number, number, number] = [25, 25, 25]) => {
      setFont("normal", fontSize, color);
      const lines = doc.splitTextToSize(String(text || ""), pageWidth);
      lines.forEach((line: string) => {
        ensureSpace(fontSize * 0.55 + 1);
        doc.text(line, leftMargin, y);
        y += fontSize * 0.55;
      });
    };

    // Label: value — wraps values onto continuation lines aligned after the label.
    const addLabelledLine = (label: string, values: string[] | string) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return;
      ensureSpace(6);
      setFont("bold", 9.5, [0, 0, 0]);
      const labelText = `${label}: `;
      doc.text(labelText, leftMargin, y);
      const labelWidth = doc.getTextWidth(labelText);
      setFont("normal", 9.5, [25, 25, 25]);
      const valueText = Array.isArray(values) ? values.join(", ") : String(values);
      const lines = doc.splitTextToSize(valueText, pageWidth - labelWidth);
      lines.forEach((line: string) => {
        ensureSpace(5);
        doc.text(line, leftMargin + labelWidth, y);
        y += 4.3;
      });
    };

    // --- Header (name / target role / contact on one line) ---
    const header = (cvData.header || {}) as any;
    setFont("bold", 20, [0, 0, 0]);
    doc.text(String(header.name || userContext.full_name || ""), leftMargin, y);
    y += 7.5;

    if (header.title) {
      setFont("normal", 12, ACCENT);
      doc.text(String(header.title), leftMargin, y);
      y += 5.5;
    }

    const contactBits: string[] = [];
    if (header.location || userContext.location) contactBits.push(String(header.location || userContext.location));
    if (header.email || userContext.email) contactBits.push(String(header.email || userContext.email));
    if (header.phone || userContext.phone_number) contactBits.push(String(header.phone || userContext.phone_number));
    if (header.linkedin || userContext.linkedin_url) contactBits.push(String(header.linkedin || userContext.linkedin_url));
    if (contactBits.length > 0) {
      setFont("normal", 9.2, MUTED);
      const contactLine = contactBits.join("  \u00B7  ");
      const lines = doc.splitTextToSize(contactLine, pageWidth);
      lines.forEach((line: string) => { doc.text(line, leftMargin, y); y += 4.2; });
    }

    y += 1.5;
    doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.setLineWidth(0.9);
    doc.line(leftMargin, y, rightMargin, y);
    y += 4;

    // --- About Me ---
    if (cvData.about_me) {
      addSectionHeader("Summary");
      addParagraph(String(cvData.about_me), 10);
      addSpace(2);
    }

    // --- Professional Experience ---
    const professional = Array.isArray(cvData.experiences) ? cvData.experiences : [];
    if (professional.length > 0) {
      addSectionHeader("Professional Experience");
      professional.forEach((exp: any, idx: number) => {
        addEntryHeader(exp.title || "", exp.dates, exp.company);
        (exp.bullets || []).forEach((bullet: string) => addBullet(bullet));
        if (idx < professional.length - 1) addSpace(2.5);
      });
      addSpace(2);
    }

    // --- Military Service (supports multiple roles) ---
    // Accept both the new array shape (military_experiences[]) and the legacy
    // single-object shape (military_service{}) in case the LLM falls back.
    const militaryList: any[] = Array.isArray(cvData.military_experiences)
      ? cvData.military_experiences
      : (cvData.military_service && cvData.military_service.unit ? [cvData.military_service] : []);
    if (militaryList.length > 0) {
      addSectionHeader("Military Service");
      militaryList.forEach((m: any, idx: number) => {
        addEntryHeader(m.role || "", m.dates, m.unit);
        (m.bullets || []).forEach((bullet: string) => addBullet(bullet));
        if (idx < militaryList.length - 1) addSpace(2.5);
      });
      addSpace(2);
    }

    // --- Volunteering ---
    const volunteering: any[] = Array.isArray(cvData.volunteering) ? cvData.volunteering : [];
    if (volunteering.length > 0) {
      addSectionHeader("Volunteering");
      volunteering.forEach((v: any, idx: number) => {
        addEntryHeader(v.title || "", v.dates, v.organization);
        (v.bullets || []).forEach((bullet: string) => addBullet(bullet));
        if (idx < volunteering.length - 1) addSpace(2.5);
      });
      addSpace(2);
    }

    // --- Education ---
    const educationList: any[] = Array.isArray(cvData.education) ? cvData.education : [];
    if (educationList.length > 0) {
      addSectionHeader("Education");
      educationList.forEach((edu: any, idx: number) => {
        addEntryHeader(edu.degree || "", edu.dates, edu.institution);
        if (edu.gpa) addBullet(`GPA: ${edu.gpa}`);
        const coursework = safeArray(edu.coursework || edu.relevant_coursework);
        if (coursework.length > 0) {
          addBullet(`Relevant coursework: ${coursework.join(", ")}`);
        }
        // Legacy shape — still render any loose details strings if present.
        const loose = safeArray(edu.details);
        loose.forEach((d) => addBullet(String(d)));
        if (idx < educationList.length - 1) addSpace(2.5);
      });
      addSpace(2);
    }

    // --- Skills & Tools ---
    const skills = (cvData.skills || {}) as any;
    const hasSkills = (skills.domain?.length || skills.tools?.length);
    if (hasSkills) {
      addSectionHeader("Skills & Tools");
      if (skills.domain?.length > 0) addLabelledLine("Domain", skills.domain);
      if (skills.tools?.length > 0) addLabelledLine("Tools", skills.tools);
      addSpace(2);
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
      addSpace(2);
    }

    // --- Honors & Awards ---
    const honors = safeArray(cvData.honors_and_awards);
    if (honors.length > 0) {
      addSectionHeader("Honors & Awards");
      honors.forEach((h) => addBullet(String(h)));
      addSpace(2);
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
        addParagraph(line, 9.5);
      });
      addSpace(2);
    }

    // --- Projects ---
    const projectsOut = Array.isArray(cvData.projects) ? cvData.projects : [];
    if (projectsOut.length > 0) {
      addSectionHeader("Projects");
      projectsOut.forEach((proj: any, idx: number) => {
        addEntryHeader(proj.name || "", undefined, undefined);
        (proj.bullets || []).forEach((bullet: string) => addBullet(bullet));
        if (idx < projectsOut.length - 1) addSpace(2.5);
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
