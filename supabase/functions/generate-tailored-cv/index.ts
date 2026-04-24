import { createClient } from "npm:@supabase/supabase-js@2";
// docx package produces a real .docx file the user can edit in Word/Google
// Docs and export to PDF themselves. Imported via esm.sh so Deno's edge
// runtime can resolve the full dependency tree. Version pinned for stability.
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LineRuleType,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TabStopPosition,
  TabStopType,
  TextRun,
  WidthType,
} from "https://esm.sh/docx@8.5.0";

// --- Load JSON Libraries ---
import { roleLibrary } from "./shared/libraries/00_role_library.ts";
import { skillLibrary } from "./shared/libraries/01_skill_library.ts";
import { proofSignalLibrary } from "./shared/libraries/02_proof_signal_library.ts";
import { roleSkillMapping } from "./shared/libraries/04_role_skill_mapping.ts";

// Built-in CV template library. Each template is a style bundle — the same
// docx structure is rendered with different font / size / accent / heading
// style. Custom uploaded templates (see cv_templates table) resolve to a
// base built-in via their extracted_structure before rendering.
type CVTemplate = {
  name: string;
  font: string;
  nameSize: number;       // half-points (48 = 24pt)
  headingSize: number;
  bodySize: number;
  bulletSize: number;
  entryTitleSize: number;
  accentColor: string;    // hex without #
  headingStyle: "uppercase-underline" | "bold-accent-line" | "small-caps-line" | "serif-elegant";
};
const CV_TEMPLATES: Record<string, CVTemplate> = {
  classic: {
    name: "Classic",
    font: "Calibri",
    nameSize: 48,
    headingSize: 22,
    bodySize: 20,
    bulletSize: 18,
    entryTitleSize: 20,
    accentColor: "444444",
    headingStyle: "uppercase-underline",
  },
  modern: {
    name: "Modern",
    font: "Aptos",
    nameSize: 44,
    headingSize: 24,
    bodySize: 20,
    bulletSize: 18,
    entryTitleSize: 20,
    accentColor: "2B579A",
    headingStyle: "bold-accent-line",
  },
  compact: {
    name: "Compact",
    font: "Arial Narrow",
    nameSize: 40,
    headingSize: 20,
    bodySize: 18,
    bulletSize: 16,
    entryTitleSize: 18,
    accentColor: "333333",
    headingStyle: "small-caps-line",
  },
  executive: {
    name: "Executive",
    font: "Georgia",
    nameSize: 52,
    headingSize: 24,
    bodySize: 22,
    bulletSize: 20,
    entryTitleSize: 22,
    accentColor: "1A1A1A",
    headingStyle: "serif-elegant",
  },
};

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

// Two-step LLM tailoring. The first pass extracts ATS-style keywords from
// the job description; those keywords then become a mandatory instruction
// layer in the main CV generation prompt. Without this, GPT-4o-mini's
// compliance with "tailor to the JD" was too weak — the output came back
// generic even when the user had a perfect JD. Returns an empty skeleton if
// the extraction call fails, so the rest of the pipeline still works.
type JDKeywords = {
  must_include_phrases: string[];
  action_verbs: string[];
  tools_and_platforms: string[];
  domain_terms: string[];
  soft_skill_keywords: string[];
};
async function extractJDKeywords(jd: string, openaiKey: string): Promise<JDKeywords> {
  const empty: JDKeywords = {
    must_include_phrases: [], action_verbs: [], tools_and_platforms: [],
    domain_terms: [], soft_skill_keywords: [],
  };
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 600,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are an ATS keyword extraction specialist. Extract the most important keywords and phrases from job descriptions that should appear in a tailored CV. Return JSON only, no markdown.",
          },
          {
            role: "user",
            content:
              `Extract keywords from this job description. Return JSON with these exact fields:
- must_include_phrases: 8-12 exact multi-word phrases from the JD that are core to the role (e.g. "operational excellence", "adoption dashboards", "GTM initiatives")
- action_verbs: 5-8 action verbs the JD uses (e.g. "own", "lead", "collaborate", "monitor")
- tools_and_platforms: all specific tools, platforms, technologies mentioned (e.g. "Data Cloud", "Tableau", "Agentforce")
- domain_terms: 5-8 domain/industry terms (e.g. "marketing analytics", "martech", "customer signals")
- soft_skill_keywords: 3-5 soft skill phrases (e.g. "cross-functional", "stakeholder management")

JOB DESCRIPTION:
${jd.slice(0, 6000)}`,
          },
        ],
      }),
    });
    if (!response.ok) return empty;
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<JDKeywords>;
    return {
      must_include_phrases: Array.isArray(parsed.must_include_phrases) ? parsed.must_include_phrases.slice(0, 15).map(String) : [],
      action_verbs: Array.isArray(parsed.action_verbs) ? parsed.action_verbs.slice(0, 10).map(String) : [],
      tools_and_platforms: Array.isArray(parsed.tools_and_platforms) ? parsed.tools_and_platforms.slice(0, 20).map(String) : [],
      domain_terms: Array.isArray(parsed.domain_terms) ? parsed.domain_terms.slice(0, 10).map(String) : [],
      soft_skill_keywords: Array.isArray(parsed.soft_skill_keywords) ? parsed.soft_skill_keywords.slice(0, 8).map(String) : [],
    };
  } catch (err) {
    console.warn("[CV] JD keyword extraction failed:", err instanceof Error ? err.message : err);
    return empty;
  }
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

    // Built-in template selection. Falls back to "classic" for unknown ids.
    const requestedTemplateId = typeof body.template_id === "string" ? body.template_id : "classic";
    const templateId: string = CV_TEMPLATES[requestedTemplateId] ? requestedTemplateId : "classic";
    let template: CVTemplate = CV_TEMPLATES[templateId];

    // Custom template (user-uploaded PDF). If present, overrides the built-in
    // style resolution further down based on the row's extracted_structure.
    const requestedCustomTemplateId = typeof body.custom_template_id === "string"
      ? body.custom_template_id
      : null;

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

    // Visibility log for which profile fields are present/absent. This shows
    // up in the Supabase edge-function log stream and is the fastest way to
    // diagnose "my phone isn't showing" style reports — the most common
    // cause is simply an empty string in the DB (CV extractor didn't capture
    // it, or the user hasn't filled in the profile yet).
    const phonePresent = !!String(profile.phone_number ?? "").trim();
    const emailPresent = !!String(user.email ?? "").trim();
    const linkedinPresent = !!String(profile.linkedin_url ?? "").trim();
    const locationPresent = !!String(profile.location ?? "").trim();
    const languagesPresent = Array.isArray(profile.languages) && profile.languages.length > 0;
    const educationDatesPresent = !!String(profile.education_dates ?? "").trim();
    console.log("generate-tailored-cv contact-fields", JSON.stringify({
      user_id: user.id,
      phone_number: phonePresent ? "present" : "MISSING (empty in DB)",
      email: emailPresent ? "present" : "MISSING",
      location: locationPresent ? "present" : "MISSING",
      linkedin: linkedinPresent ? "present" : "MISSING",
      languages_field: languagesPresent ? "present" : "MISSING (will infer)",
      education_dates: educationDatesPresent ? "present" : "MISSING",
    }));

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

    // ─── Custom template resolution ───
    // If custom_template_id was passed, fetch the row and use its cached
    // extracted_structure. Map font_style → built-in template so the
    // renderer still has a consistent style config to follow. Section order
    // is injected into the prompt so the LLM emits sections in the order
    // the user's uploaded template shows them.
    let customSectionOrder: string[] | null = null;
    if (requestedCustomTemplateId) {
      const { data: tpl } = await supabase
        .from("cv_templates")
        .select("id, extracted_structure")
        .eq("id", requestedCustomTemplateId)
        .eq("user_id", user.id)
        .single();
      if (tpl?.extracted_structure) {
        const es = tpl.extracted_structure as any;
        if (Array.isArray(es.sections)) customSectionOrder = es.sections.slice(0, 12);
        // Pick base style from font + density hints
        const fontStyle = String(es.font_style || "").toLowerCase();
        const density = String(es.density || "").toLowerCase();
        if (fontStyle.includes("serif")) template = CV_TEMPLATES.executive;
        else if (density === "compact") template = CV_TEMPLATES.compact;
        else if (density === "spacious") template = CV_TEMPLATES.executive;
        else template = CV_TEMPLATES.modern;
      }
    }

    // ─── Step 1 of two-step tailoring: extract ATS keywords from the JD ───
    // Without explicit keywords injected into the main prompt, the generator
    // produces a generic CV. Pass-through of OPENAI_API_KEY happens inside the
    // helper. We read the secret once here so both calls share it.
    const _openaiKeyForExtraction = Deno.env.get("OPENAI_API_KEY");
    const jdKeywords: JDKeywords | null = (safeJobDescription && _openaiKeyForExtraction)
      ? await extractJDKeywords(safeJobDescription, _openaiKeyForExtraction)
      : null;
    if (jdKeywords) {
      console.log("[CV] JD keywords extracted", JSON.stringify({
        phrases: jdKeywords.must_include_phrases.length,
        verbs: jdKeywords.action_verbs.length,
        tools: jdKeywords.tools_and_platforms.length,
        domain: jdKeywords.domain_terms.length,
        soft: jdKeywords.soft_skill_keywords.length,
      }));
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

    // Language resolution. Prefer the user's explicitly stored languages
    // (new profiles.languages jsonb). Only fall back to inference when the
    // profile is silent — inferring can get proficiency levels wrong
    // (American-Israeli students are typically English-native + Hebrew-fluent,
    // not the other way round).
    const storedLanguagesRaw = Array.isArray(profile.languages) ? profile.languages : [];
    const storedLanguages = storedLanguagesRaw
      .map((l: any) => {
        if (!l) return null;
        if (typeof l === "string") return { language: l.trim(), proficiency: "" };
        const lang = String(l.language || l.name || "").trim();
        if (!lang) return null;
        const prof = String(l.proficiency || l.level || "").trim();
        return { language: lang, proficiency: prof };
      })
      .filter(Boolean) as Array<{ language: string; proficiency: string }>;

    const locationHint = String(profile.location || "").toLowerCase();
    const inferredLanguages: string[] = [];
    if (storedLanguages.length === 0) {
      // Only infer when the profile has zero languages stored — otherwise
      // inference could contradict explicit user data.
      if (/\b(israel|tel aviv|jerusalem|haifa|herzliya|ramat|netanya|rehovot|beer sheva|be'?er sheva|eilat|ashdod|petah tikva)\b/.test(locationHint)) {
        inferredLanguages.push("Hebrew (likely fluent — candidate is based in Israel; proficiency should be inferred conservatively)");
      }
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
      // Explicit languages (from profile.languages) — when non-empty, the
      // LLM must use these verbatim and NOT infer. language_hints is only
      // populated when stored_languages is empty.
      stored_languages: storedLanguages,
      language_hints: inferredLanguages,
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
        // Dates are stored as free text ("2023 - Present", "Sep 2021 - Jun
        // 2024", etc.) — the LLM echoes this through as-is.
        dates: trunc(profile.education_dates, 40),
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

B. Preservation (don't drop, don't paraphrase identifiers — BUT fix obvious typos):
4. Use the EXACT job titles from the source data. Never shorten, generalize, or paraphrase a title — "Supervised and trained teams of soldiers" stays "Supervised and trained teams of soldiers", never "Soldier". "Senior Customer Success Manager" stays "Senior Customer Success Manager", never "CS Manager".
5. Use the EXACT company / institution / organization names from the source data. Don't re-capitalize, abbreviate, or translate them.
6. EXCEPTION to rules 4 and 5 — you MUST silently correct obvious spelling mistakes in degree names, field-of-study strings, institution names, and company names. "specilization" → "specialization". "Reichmann" → "Reichman". "Mangement" → "Management". "Engeering" → "Engineering". Only fix clear typos; never rephrase, re-order words, translate, or expand abbreviations. The user will be embarrassed if the CV goes to an employer with a misspelled degree or school.
7. Preserve every bullet from the source responsibilities. Rephrase for clarity and role alignment, but do not drop content. Five source bullets in → five bullets out.
8. Include EVERY experience, education entry, certification, award, and language present in USER DATA. Do not silently omit entries because they feel less relevant — reorder them, but include them all.

C. Surfacing awards and honors:
8. If a responsibility line mentions an award (e.g. "Awarded Presidential Award for Excellence"), keep it in the bullet AND surface the award in honors_and_awards[] so it appears in a dedicated Honors & Awards section.
9. CAPITALIZATION — all degree names, specializations, field-of-study strings, and institution names must use TITLE CASE. "bachelor's degree in business administration-specialization in digital innovation" becomes "Bachelor's Degree in Business Administration - Specialization in Digital Innovation". Small connector words like "in", "of", "and", "the", "a", "at" stay lowercase unless they're the first word. Apply this silently during the typo-correction step (rule 6) — the reader should never see a sentence-case or lower-case degree.

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
- About Me: 2-3 descriptive sentences. Write in FACTUAL style with no pronouns (no "he", "she", "his", "her") and no candidate-speak ("strong candidate", "well-suited", "eager to", "making him/her a great fit"). Describe the user's actual skills and current work as facts and tie them to the target role through CONTENT, not self-promotion. Example to emulate: "Business Administration student specializing in Digital Innovation with hands-on experience in VIP customer success, operational leadership, and cross-functional coordination. Currently supporting high-value users at a cybersecurity startup while leading educational programs. Strong ability to understand user needs through direct interaction and communicate insights across teams." Referencing the target company by name is fine where it fits naturally, but do NOT say "strong candidate for X role at Y".
- Experience bullets: action verb + what you did. Factual, concrete. No invented metrics.
- Skills & Tools: categorize as Domain (role-specific capabilities) and Tools (software/platforms/systems). Languages do NOT go here.
- Languages: human spoken/written languages only. Draw them from the user's skills list if language-like entries are there; draw also from language_hints[] which flags likely languages based on location. Include a proficiency level (Native | Fluent | Professional | Conversational | Basic) when the source or hint supports it, otherwise omit level.
- Education: include every entry from USER DATA.education and — if present — USER DATA.secondary_education as a second education entry. Do not drop pre-university education.
- Honors & Awards: include USER DATA.education.honors verbatim and any awards mentioned inside experience responsibilities.
- Military Service: preserve unit names and ranks (titles), but phrase bullets in civilian-readable language.
- Never keyword-stuff. JD keywords appear only where they genuinely apply to real experience.
`;

    const TAILORING_RULES = `
TAILORING (apply aggressively — this is the most important part of your job):
- REPHRASE every bullet point to use language from the job description. "Managed customer cases" becomes "Owned customer relationships and drove adoption" if the JD uses those terms.
- REORDER bullets within each experience: put the most JD-relevant responsibility first.
- About Me must read like it was written FOR this specific role. Reference the company's domain and the role's core focus.
- Skills section must lead with skills that match the JD, then list others.
- DO NOT just clean up the existing CV. ACTIVELY REWRITE using JD vocabulary.
- If you are not sure whether a rephrasing is truthful, keep the original wording but try to use at least one JD keyword per bullet.
- Reorder the experiences list itself so the role most relevant to the target comes first within its bucket.
- NEVER invent experiences, skills, tools, certifications, or metrics. Rephrasing is allowed; fabrication is not. "Managed multiple cases" can become "Prioritised and managed a backlog of concurrent cases" if that's what actually happened, but CANNOT become "Managed a product backlog" if the user didn't work on one.
`;

    // Extracted keywords are the single most effective lever for forcing
    // tailoring. Without them the generic TAILORING_RULES gets largely ignored.
    const KEYWORD_INJECTION_BLOCK = jdKeywords && (
      jdKeywords.must_include_phrases.length +
      jdKeywords.action_verbs.length +
      jdKeywords.tools_and_platforms.length +
      jdKeywords.domain_terms.length +
      jdKeywords.soft_skill_keywords.length
    ) > 0
      ? `
=== MANDATORY KEYWORD TAILORING ===
The following keywords were extracted from the job description. You MUST weave these into the CV naturally:

${jdKeywords.must_include_phrases.length > 0 ? `MUST-INCLUDE PHRASES (use at least 6 of these verbatim or near-verbatim in bullet points and About Me):
${jdKeywords.must_include_phrases.map((p) => `- "${p}"`).join("\n")}
` : ""}
${jdKeywords.action_verbs.length > 0 ? `ACTION VERBS (prefer these over generic verbs):
${jdKeywords.action_verbs.join(", ")}
` : ""}
${jdKeywords.tools_and_platforms.length > 0 ? `TOOLS & PLATFORMS (include in Skills section AND mention in relevant bullets where truthful):
${jdKeywords.tools_and_platforms.join(", ")}
` : ""}
${jdKeywords.domain_terms.length > 0 ? `DOMAIN TERMS (weave into About Me and experience descriptions):
${jdKeywords.domain_terms.join(", ")}
` : ""}
${jdKeywords.soft_skill_keywords.length > 0 ? `SOFT SKILLS (reflect in bullet phrasing):
${jdKeywords.soft_skill_keywords.join(", ")}
` : ""}

RULES:
1. The About Me section MUST use at least 3 must-include phrases and 2 domain terms.
2. Experience bullet points MUST be rewritten to use JD action verbs and incorporate must-include phrases WHERE TRUTHFUL. Do not invent new responsibilities — rephrase existing ones using JD language.
3. The Skills section MUST include tools from the JD that the user actually knows or could reasonably claim from their existing skills/experience. If the user's profile doesn't mention a JD tool at all, do NOT add it.
4. If the user has NO experience with a JD tool/platform, do NOT add it. Truthfulness is still non-negotiable.
5. Reorder experience bullets so the most JD-relevant ones come first within each role.
`
      : "";

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

    const CUSTOM_TEMPLATE_BLOCK = customSectionOrder && customSectionOrder.length > 0
      ? `\nCUSTOM TEMPLATE SECTION ORDER (user uploaded a template PDF — match it):
Structure the CV in this section order: ${customSectionOrder.join(", ")}. Skip any section the user has no data for.\n`
      : "";

    const systemPrompt =
      `You are a CV Generation Engine for the "Get A Job" Career Operating System. Your job is to produce a tailored, one-page, truthful CV as JSON. The CV WILL be sent to real employers — so every word must be grounded in the user's actual data.\n\n` +
      TRUTHFULNESS_RULES + `\n` +
      STRUCTURE_RULES + `\n` +
      TAILORING_RULES + `\n` +
      LIBRARY_CONTEXT + `\n` +
      KEYWORD_INJECTION_BLOCK + `\n` +
      CUSTOM_TEMPLATE_BLOCK + `\n` +
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
    "subtitle": "string — the user's CURRENT identity, NOT the target role. Rules: (a) if the user is an active student (education.dates contains 'Present' or similar), use '<Field of Study> Student | <Specialization>' e.g. 'Business Administration Student | Digital Innovation'. (b) else if the user has a current professional experience (is_current=true or end_date='Present'), use '<Title> | <Company>' e.g. 'Customer Success Specialist | Guardio'. (c) else use '<Most recent title> | <Most recent company>'. The target role connection belongs in About Me only — the subtitle is about who the candidate IS today.",
    "email": "string",
    "phone": "string — only if USER DATA.phone_number is non-empty",
    "location": "string",
    "linkedin": "string — linkedin URL or handle"
  },
  "summary": "string — 2-3 FACTUAL descriptive sentences. No pronouns (he/she/his/her). No candidate-speak (no 'strong candidate', 'eager to', 'well-suited'). Describe skills and current work as facts; let content speak for fit.",
  "professional_experiences": [
    { "title": "string — EXACT title from USER DATA", "company": "string — EXACT company from USER DATA", "dates": "string — e.g. Oct 2025 - Present", "bullets": ["concrete factual action-verb statement"] }
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
    { "degree": "string — EXACT degree/field from USER DATA", "institution": "string — EXACT institution", "dates": "string", "gpa": "string — only if explicitly in USER DATA and strong", "coursework": ["short course name", "short course name"], "activities": ["leadership role / club / notable activity — one per entry, NOT awards"] }
  ],
  "skills": {
    "domain": ["role-specific capability 1", "role-specific capability 2"],
    "tools": ["software/platform 1", "software/platform 2"],
    "technical": ["programming language or technical stack 1", "stack 2"]
  },
  "languages": [
    { "language": "English", "proficiency": "Native | Fluent | Professional | Conversational | Basic" }
  ],
  "honors_and_awards": [
    { "name": "Award name exactly as in source", "description": "one short line of context — omit if none" }
  ],
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
- If a responsibility line mentions an award (e.g. "Awarded Presidential Award for Excellence"), keep the mention AND add the award to honors_and_awards[] as an object {name, description?}.
- If USER DATA.secondary_education is non-null, add it as a SECOND entry in education[] (institution, dates from secondary_education.dates, details[] containing the highlights strings). Do not drop it because it's pre-university.
- education[].coursework[] is a list of SHORT course names (e.g. "SQL", "Python", "Data Science") — the renderer joins them into a single "Relevant coursework: X, Y, Z" line. education[].activities[] is for leadership roles, clubs, or notable activities held DURING the education, each rendered as its own bullet. Do NOT duplicate awards here — awards only appear in honors_and_awards[].
- skills.technical[] is for programming languages or technical stacks (Python, SQL, React, AWS, etc.) — include only if the user actually has them. Non-technical roles can omit this category entirely.
- Languages priority: (1) If USER DATA.stored_languages is a non-empty array, use those entries VERBATIM (same language name, same proficiency) — do NOT re-infer or flip levels. (2) Otherwise, include every language signal from USER DATA.skills, USER DATA.summary, and USER DATA.language_hints. Use the "proficiency" field (not "level") with one of Native | Fluent | Professional | Conversational | Basic. The language_hints array is advisory — if it suggests Hebrew (likely fluent), mark Hebrew at "Fluent" (not "Native") unless you have stronger signal.
- Education dates: if USER DATA.education.dates is non-empty, output that string verbatim as the education entry's "dates". Do not guess "Present" or similar when the source is blank — leave the field empty instead.
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

    // Guard against DB titles that are actually responsibility sentences
    // (e.g. "Supervised and trained teams of soldiers" from a bad CV
    // extraction). Real titles are short and typically noun phrases. If a
    // source title looks like a sentence, substitute a bucket-appropriate
    // generic so we don't dump a responsibility line in the bold title slot.
    const VERB_PREFIX = /^(supervised|managed|led|coordinated|trained|oversaw|directed|assisted|designed|developed|delivered|built|owned|launched|executed|drove|ran|created|served|implemented|handled|facilitated|performed|worked)\b/i;
    const BUCKET_FALLBACK: Record<string, string> = {
      professional: "Team Member",
      military: "Service Member",
      volunteering: "Volunteer",
      leadership: "Member",
    };
    const sanitizeTitle = (rawTitle: string, bucket: string): string => {
      const t = String(rawTitle || "").trim();
      if (!t) return BUCKET_FALLBACK[bucket] || "Member";
      const looksLikeSentence = t.length > 60 || VERB_PREFIX.test(t);
      if (looksLikeSentence) return BUCKET_FALLBACK[bucket] || "Member";
      return t;
    };

    const reconcile = (outList: any[], sources: any[], titleField: string, orgField: string, bucket: string) => {
      if (!Array.isArray(outList)) return;
      for (const entry of outList) {
        const src = matchSource(entry.dates, sources);
        if (!src) continue;
        // Preserve source title, but sanitize if it's a sentence fragment.
        if (src.title) entry[titleField] = sanitizeTitle(src.title, bucket);
        // Preserve source company / unit / organization.
        if (src.company) entry[orgField] = src.company;
      }
    };

    reconcile(cvData.professional_experiences, professionalExperiences, "title", "company", "professional");
    reconcile(cvData.military_experiences, militaryExperiences, "title", "unit", "military");
    reconcile(cvData.volunteering_experiences, volunteeringExperiences, "title", "organization", "volunteering");
    reconcile(cvData.leadership_experiences, leadershipExperiences, "title", "organization", "leadership");

    // ─── Title-case pass on education degree + institution strings ───
    // The LLM is told to title-case these, but a server-side safety net makes
    // this deterministic for every user. Small connector words stay lowercase
    // unless they're the first word.
    const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "per", "the", "to", "vs", "via", "with"]);
    const toTitleCase = (raw: string): string => {
      if (!raw) return raw;
      // Tokenize on whitespace but keep punctuation-adjacent words intact.
      // Then, for each token, title-case the leading alphabetic run.
      return raw.split(/(\s+)/).map((tok, idx) => {
        if (/^\s+$/.test(tok)) return tok;
        // Preserve trailing/leading punctuation around the word body.
        const m = tok.match(/^([^a-zA-Z]*)([a-zA-Z][a-zA-Z'\-]*)(.*)$/);
        if (!m) return tok;
        const [, lead, word, trail] = m;
        const lower = word.toLowerCase();
        const isFirst = idx === 0 || raw.slice(0, raw.indexOf(tok)).trim() === "";
        // Keep words that look like ALL-CAPS acronyms (IDF, SQL, IBM) as-is if
        // the user typed them that way — don't clobber.
        if (word.length >= 2 && word === word.toUpperCase()) {
          return `${lead}${word}${trail}`;
        }
        if (!isFirst && SMALL_WORDS.has(lower)) {
          return `${lead}${lower}${trail}`;
        }
        // Title case: first char upper, rest lower — but preserve internal
        // apostrophe-s (e.g. Bachelor's).
        const titled = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        return `${lead}${titled}${trail}`;
      }).join("");
    };

    if (Array.isArray(cvData.education)) {
      for (const edu of cvData.education) {
        if (edu && typeof edu === "object") {
          if (edu.degree) edu.degree = toTitleCase(String(edu.degree));
          if (edu.institution) edu.institution = toTitleCase(String(edu.institution));
        }
      }
    }

    // ─── Derive a safe current-identity subtitle ───
    // The LLM is instructed to emit header.subtitle in the right shape, but
    // when it falls back to the target role (or leaves it empty) we compute a
    // deterministic identity from the DB. Priority:
    //   1. Active student with a current degree → "<Field> Student | <specialization>"
    //   2. Current professional experience → "<title> | <company>"
    //   3. Most recent professional experience
    //   4. Fall back to target role (last resort)
    const hasActiveStudent =
      /present/i.test(String(profile.education_dates || "")) ||
      /\b(student)\b/i.test(String(profile.education_level || ""));
    const currentProfessional = professionalExperiences.find((e: any) => {
      if (e?.is_current) return true;
      const end = String(e?.end_date || "").toLowerCase();
      return end === "present" || end === "current" || end === "";
    });
    const mostRecentProfessional = professionalExperiences[0];

    let derivedSubtitle = "";
    if (hasActiveStudent && profile.field_of_study) {
      // Split the field_of_study around a hyphen to split degree + specialization
      // when the user typed them together ("Business Administration - Specialization in Digital Innovation").
      const fieldStr = toTitleCase(String(profile.field_of_study).trim());
      const parts = fieldStr.split(/\s*[-–—]\s*/, 2);
      const mainField = parts[0] || fieldStr;
      const spec = parts[1] ? parts[1].replace(/^specialization in\s*/i, "") : "";
      derivedSubtitle = spec ? `${mainField} Student | ${spec}` : `${mainField} Student`;
    } else if (currentProfessional?.title && currentProfessional?.company) {
      derivedSubtitle = `${currentProfessional.title} | ${currentProfessional.company}`;
    } else if (mostRecentProfessional?.title && mostRecentProfessional?.company) {
      derivedSubtitle = `${mostRecentProfessional.title} | ${mostRecentProfessional.company}`;
    } else {
      derivedSubtitle = safeTargetRole;
    }

    const llmSubtitle = String((cvData.header as any)?.subtitle || "").trim();
    // If the LLM returned the target role verbatim (clear sign it mis-applied
    // the rule), swap in the derived identity. Otherwise trust the LLM.
    const useDerived =
      !llmSubtitle ||
      llmSubtitle.toLowerCase() === safeTargetRole.toLowerCase() ||
      llmSubtitle.toLowerCase() === `${safeTargetRole.toLowerCase()} candidate`;
    const finalSubtitle = useDerived ? derivedSubtitle : llmSubtitle;
    cvData.header = { ...(cvData.header || {}), subtitle: finalSubtitle };

    // ─── Step 2 of tailoring: validate how many JD phrases made it through ───
    // The score is the fraction of must_include_phrases that literally appear
    // somewhere in the generated CV text (case-insensitive). If it's below
    // 40%, we log a warning to edge-function telemetry so we can track which
    // JDs are hard to tailor. The score is also returned to the frontend so
    // the UI can show a "Keyword match: X%" indicator next to the fit card.
    let tailoring = null as null | {
      tailoring_score: number;
      matched_phrases: string[];
      missed_phrases: string[];
    };
    if (jdKeywords && jdKeywords.must_include_phrases.length > 0) {
      const cvTextLower = JSON.stringify(cvData).toLowerCase();
      const matched: string[] = [];
      const missed: string[] = [];
      for (const phrase of jdKeywords.must_include_phrases) {
        if (cvTextLower.includes(phrase.toLowerCase())) matched.push(phrase);
        else missed.push(phrase);
      }
      const pct = matched.length / jdKeywords.must_include_phrases.length;
      if (pct < 0.4) {
        console.warn(`[CV] Low tailoring score: ${Math.round(pct * 100)}% — matched: ${matched.join(" · ") || "(none)"}`);
      } else {
        console.log(`[CV] Tailoring score: ${Math.round(pct * 100)}% (${matched.length}/${jdKeywords.must_include_phrases.length})`);
      }
      tailoring = {
        tailoring_score: Math.round(pct * 100),
        matched_phrases: matched,
        missed_phrases: missed,
      };
    }

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

    // --- Build DOCX (professional single-column CV) ---
    // Users can open the generated file in Word or Google Docs, tweak it
    // further, and export to PDF themselves. This eliminates every jsPDF
    // layout problem we had (font, margins, overflow, styling) in exchange
    // for a slightly larger payload.
    //
    // docx units:
    //   - font size is in half-points (20 = 10pt, 26 = 13pt, 56 = 28pt)
    //   - twips: 1 inch = 1440 twips, 1 mm ≈ 56.7 twips
    //   - margins 20mm top/bottom ≈ 1134 twips, 25mm left/right ≈ 1417 twips
    //   - tab stop max ≈ 9072 twips (inside a 21cm page with 25mm margins)
    //   - line: 240 = single, 276 = 1.15x, 288 = 1.2x, 360 = 1.5x
    // All typography is driven by the resolved `template` config so different
    // built-in templates (classic / modern / compact / executive) render
    // with different fonts, sizes, and accent colors from the same pipeline.
    const FONT = template.font;
    const BLACK = "000000";
    const MUTED_COLOR = "555555";
    const ACCENT_COLOR = template.accentColor;
    const BODY_SIZE = template.bodySize;
    const BULLET_SIZE = template.bulletSize;
    const HEADING_SIZE = template.headingSize;
    const SUBHEADING_SIZE = Math.max(18, template.bulletSize + 1); // one notch above bullets
    const ENTRY_TITLE_SIZE = template.entryTitleSize;
    const CONTACT_SIZE = template.bulletSize + 1;
    const DATE_SIZE = template.bulletSize + 1;
    const NAME_SIZE = template.nameSize;
    const ROLE_SUBTITLE_SIZE = Math.max(20, template.headingSize);
    // Right tab stop just inside the right margin on an A4 page with 20mm
    // L/R margins (page 11906 twips wide, margin 1134 each side → 9638).
    const RIGHT_TAB = 9600;

    // Spacing constants in twips (1pt = 20 twips). 1.0 line = 240.
    // All block spacing is expressed as `before` on the NEXT element; every
    // paragraph's `after` is 0 so stacking is deterministic.
    const SP_BEFORE_SECTION = 120; // 6pt breathing room above a section heading
    const SP_BEFORE_SUBHEAD = 60;  // 3pt above a sub-section heading
    const SP_BEFORE_ENTRY = 80;    // 4pt between entries within a section
    const LINE_SINGLE = 240; // 1.0 line spacing
    const LINE_ABOUT = 259;  // 1.08 for About Me

    const paragraphs: Array<Paragraph | Table> = [];

    // Small helpers — each returns a Paragraph pushed into `paragraphs`.
    const text = (s: string, opts: Record<string, unknown> = {}) =>
      new TextRun({ text: s, font: FONT, size: BODY_SIZE, ...opts });

    // Section heading styling varies by template.
    //  - uppercase-underline (Classic): UPPERCASE text, thin gray rule
    //  - bold-accent-line    (Modern):  mixed case, thicker colored rule
    //  - small-caps-line     (Compact): small caps (faked by uppercase +
    //    slightly smaller), letter-spacing, thin rule
    //  - serif-elegant       (Executive): extra before-spacing, bold, no rule
    const sectionHeading = (label: string): Paragraph => {
      switch (template.headingStyle) {
        case "bold-accent-line":
          return new Paragraph({
            spacing: { before: SP_BEFORE_SECTION, after: 0 },
            border: { bottom: { color: ACCENT_COLOR, style: BorderStyle.SINGLE, size: 10, space: 1 } },
            children: [new TextRun({ text: label, bold: true, size: HEADING_SIZE, font: FONT, color: ACCENT_COLOR })],
          });
        case "small-caps-line":
          return new Paragraph({
            spacing: { before: SP_BEFORE_SECTION, after: 0 },
            border: { bottom: { color: "BFBFBF", style: BorderStyle.SINGLE, size: 4, space: 1 } },
            children: [new TextRun({ text: label.toUpperCase(), bold: true, size: HEADING_SIZE - 1, font: FONT, characterSpacing: 60 })],
          });
        case "serif-elegant":
          return new Paragraph({
            spacing: { before: SP_BEFORE_SECTION + 40, after: 0 },
            children: [new TextRun({ text: label, bold: true, size: HEADING_SIZE, font: FONT, color: ACCENT_COLOR })],
          });
        case "uppercase-underline":
        default:
          return new Paragraph({
            spacing: { before: SP_BEFORE_SECTION, after: 0 },
            border: { bottom: { color: "BFBFBF", style: BorderStyle.SINGLE, size: 6, space: 1 } },
            children: [new TextRun({ text: label.toUpperCase(), bold: true, size: HEADING_SIZE, font: FONT })],
          });
      }
    };

    const subsectionHeading = (label: string) => new Paragraph({
      spacing: { before: SP_BEFORE_SUBHEAD, after: 0 },
      children: [new TextRun({ text: label, bold: true, size: SUBHEADING_SIZE, font: FONT })],
    });

    // Experience-style entry: "Role, Organization" bold on the left, dates
    // muted and right-aligned on the same line via a right tab stop.
    // `withGap` = whether to add 4pt breathing room above this entry (true
    // for every entry except the first inside a section).
    const experienceEntryLine = (title: string, org: string | undefined, dates: string | undefined, withGap = false) => {
      const titleText = String(title || "").trim();
      const orgText = String(org || "").trim();
      const combined = orgText ? `${titleText}, ${orgText}` : titleText;
      const children: TextRun[] = [
        new TextRun({ text: combined, bold: true, size: ENTRY_TITLE_SIZE, font: FONT }),
      ];
      if (dates && String(dates).trim()) {
        children.push(new TextRun({ text: "\t", size: ENTRY_TITLE_SIZE }));
        children.push(new TextRun({ text: String(dates).trim(), size: DATE_SIZE, color: MUTED_COLOR, font: FONT }));
      }
      return new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
        spacing: { before: withGap ? SP_BEFORE_ENTRY : 0, after: 0 },
        children,
      });
    };

    // Education-style entry: bold degree + right-aligned dates on line 1,
    // plain institution / location on line 2.
    const educationEntryLines = (title: string, subtitle: string | undefined, dates: string | undefined, withGap = false) => {
      const out: Paragraph[] = [];
      const titleChildren: TextRun[] = [
        new TextRun({ text: String(title || "").trim(), bold: true, size: ENTRY_TITLE_SIZE, font: FONT }),
      ];
      if (dates && String(dates).trim()) {
        titleChildren.push(new TextRun({ text: "\t", size: ENTRY_TITLE_SIZE }));
        titleChildren.push(new TextRun({ text: String(dates).trim(), size: DATE_SIZE, color: MUTED_COLOR, font: FONT }));
      }
      out.push(new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
        spacing: { before: withGap ? SP_BEFORE_ENTRY : 0, after: 0 },
        children: titleChildren,
      }));
      const subText = String(subtitle || "").trim();
      if (subText) {
        out.push(new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: subText, size: BULLET_SIZE, color: MUTED_COLOR, font: FONT })],
        }));
      }
      return out;
    };

    // Bulleted list item — Word's default bullet list style, zero spacing
    // after so subsequent bullets stack tight.
    const bulletParagraph = (s: string) => new Paragraph({
      bullet: { level: 0 },
      spacing: { before: 0, after: 0, line: LINE_SINGLE, lineRule: LineRuleType.AUTO },
      children: [new TextRun({ text: String(s || ""), size: BULLET_SIZE, font: FONT })],
    });

    // About Me body paragraph. Justified, 1.08 line, no after-spacing.
    const bodyParagraph = (s: string) => new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 0, after: 0, line: LINE_ABOUT, lineRule: LineRuleType.AUTO },
      children: [new TextRun({ text: String(s || ""), size: BODY_SIZE, font: FONT })],
    });

    // Bold label + value paragraph, e.g. "Domain: X, Y, Z".
    const labelledLine = (label: string, values: string[] | string) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;
      const valueText = Array.isArray(values) ? values.join(", ") : String(values);
      return new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({ text: `${label}: `, bold: true, size: BULLET_SIZE, font: FONT }),
          new TextRun({ text: valueText, size: BULLET_SIZE, font: FONT }),
        ],
      });
    };

    // Plain single-line paragraph — used for Languages so the section
    // heading doesn't double up with a redundant "Languages:" prefix.
    const plainLine = (s: string) => new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: s, size: BULLET_SIZE, font: FONT })],
    });

    // ─── Header (centered name / current-identity subtitle / contact line) ───
    // The subtitle describes who the candidate IS today (e.g. "Business
    // Administration Student | Digital Innovation"), NOT the target role —
    // the target role connection is made in About Me. Computed server-side
    // in the reconcile block above.
    const header = (cvData.header || {}) as any;
    const nameText = String(header.name || userContext.full_name || "").toUpperCase();
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: nameText, bold: true, size: NAME_SIZE, font: FONT })],
    }));

    const subtitleText = String(header.subtitle || "").trim();
    if (subtitleText) {
      // Flush to the contact line below — no "after" spacing, so there's no
      // visible blank line between subtitle and contact.
      paragraphs.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: subtitleText, size: ROLE_SUBTITLE_SIZE, color: MUTED_COLOR, font: FONT })],
      }));
    }

    const contactBits: string[] = [];
    const pushBit = (v: string | null | undefined) => {
      const s = (v ?? "").toString().trim();
      if (s) contactBits.push(s);
    };
    pushBit(header.phone || userContext.phone_number);
    pushBit(header.email || userContext.email);
    pushBit(header.location || userContext.location);
    pushBit(header.linkedin || userContext.linkedin_url);
    if (contactBits.length > 0) {
      paragraphs.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: contactBits.join("  \u00B7  "), size: CONTACT_SIZE, font: FONT })],
      }));
    }

    // ─── About Me ───
    const aboutText = String(cvData.summary || cvData.about_me || "").trim();
    if (aboutText) {
      paragraphs.push(sectionHeading("About Me"));
      paragraphs.push(bodyParagraph(aboutText));
    }

    // ─── EXPERIENCE (umbrella with sub-headings) ───
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

    const renderEntryBlock = (entries: any[], orgKey: string) => {
      entries.forEach((exp: any, idx: number) => {
        // First entry has no leading gap — flush under the sub-section
        // heading. Subsequent entries get 4pt of breathing room above.
        paragraphs.push(experienceEntryLine(exp.title || "", exp[orgKey], exp.dates, idx > 0));
        (exp.bullets || []).forEach((b: string) => paragraphs.push(bulletParagraph(b)));
      });
    };

    if (hasAnyExperience) {
      paragraphs.push(sectionHeading("Experience"));
      if (professional.length > 0) {
        paragraphs.push(subsectionHeading("Professional Experience"));
        renderEntryBlock(professional, "company");
      }
      if (militaryList.length > 0) {
        paragraphs.push(subsectionHeading("Military Service"));
        renderEntryBlock(militaryList, "unit");
      }
      if (volunteeringList.length > 0) {
        paragraphs.push(subsectionHeading("Volunteering"));
        renderEntryBlock(volunteeringList, "organization");
      }
      if (leadershipList.length > 0) {
        paragraphs.push(subsectionHeading("Leadership"));
        renderEntryBlock(leadershipList, "organization");
      }
    }

    // ─── Education (university + optional secondary) ───
    const llmEducation: any[] = Array.isArray(cvData.education) ? cvData.education : [];
    const secondary = (userContext as any).secondary_education;
    const normInst = (s: unknown) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

    const mergedEducation: any[] = [...llmEducation];
    if (secondary && secondary.institution) {
      const already = mergedEducation.some((e) => normInst(e.institution) === normInst(secondary.institution));
      if (!already) {
        mergedEducation.push({
          institution: secondary.institution,
          degree: "",
          dates: secondary.dates,
          coursework: [],
          highlights: secondary.highlights || [],
          _secondary_location: secondary.location,
        });
      }
    }

    if (mergedEducation.length > 0) {
      paragraphs.push(sectionHeading("Education"));
      // Honors set for deduping — accepts legacy string[] or {name, description}[].
      const honorsSet = new Set(
        safeArray(cvData.honors_and_awards)
          .map((h: any) => {
            if (!h) return "";
            if (typeof h === "string") return h;
            return String(h.name || "").trim();
          })
          .map((s) => String(s).replace(/\s+/g, " ").trim().toLowerCase())
          .filter(Boolean),
      );

      mergedEducation.forEach((edu: any, idx: number) => {
        const topLine = edu.degree?.trim() ? edu.degree : edu.institution;
        const subLine = edu.degree?.trim() ? edu.institution : (edu._secondary_location || "");
        educationEntryLines(topLine || "", subLine, edu.dates, idx > 0).forEach((p) => paragraphs.push(p));
        if (edu.gpa) paragraphs.push(bulletParagraph(`GPA: ${edu.gpa}`));

        let coursework = safeArray(edu.coursework || edu.relevant_coursework).map(String);
        let activities = safeArray(edu.activities).map(String);
        if (coursework.length === 0 && activities.length === 0) {
          const loose = [...safeArray(edu.details), ...safeArray(edu.highlights)].map(String);
          for (const item of loose) {
            const t = item.trim();
            if (!t) continue;
            if (t.length < 30 && !/[.!?:;]/.test(t) && !/\b(club|president|editor|captain|volunteer|led|managed|organized|mentor)\b/i.test(t)) {
              coursework.push(t);
            } else {
              activities.push(t);
            }
          }
        }

        if (coursework.length > 0) {
          paragraphs.push(bulletParagraph(`Relevant coursework: ${coursework.join(", ")}`));
        }
        const seen = new Set<string>();
        activities.forEach((a) => {
          const raw = String(a || "").trim();
          if (!raw) return;
          const key = raw.replace(/\s+/g, " ").toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          if (honorsSet.has(key)) return;
          paragraphs.push(bulletParagraph(raw));
        });
      });
    }

    // ─── Skills & Tools ───
    const skills = (cvData.skills || {}) as any;
    const hasSkills = (skills.domain?.length || skills.tools?.length || skills.technical?.length);
    if (hasSkills) {
      paragraphs.push(sectionHeading("Skills & Tools"));
      if (skills.domain?.length > 0) {
        const p = labelledLine("Domain", skills.domain);
        if (p) paragraphs.push(p);
      }
      if (skills.tools?.length > 0) {
        const p = labelledLine("Tools", skills.tools);
        if (p) paragraphs.push(p);
      }
      if (skills.technical?.length > 0) {
        const p = labelledLine("Technical", skills.technical);
        if (p) paragraphs.push(p);
      }
    }

    // ─── Languages ───
    let languageLines: string[] = [];
    if (Array.isArray(cvData.languages)) {
      languageLines = (cvData.languages as any[])
        .map((l) => {
          if (!l) return "";
          if (typeof l === "string") return l;
          const lang = String(l.language || "").trim();
          const level = String(l.proficiency || l.level || "").trim();
          return lang && level ? `${lang} (${level})` : lang;
        })
        .filter((s) => s.length > 0);
    } else if (Array.isArray(skills.languages)) {
      languageLines = (skills.languages as any[]).map((s) => String(s)).filter(Boolean);
    }
    if (languageLines.length > 0) {
      paragraphs.push(sectionHeading("Languages"));
      // Heading already says "LANGUAGES" — don't repeat it as a label.
      paragraphs.push(plainLine(languageLines.join(", ")));
    }

    // ─── Honors & Awards ───
    const honorsRaw = safeArray(cvData.honors_and_awards);
    const honorLines: string[] = honorsRaw
      .map((h: any) => {
        if (!h) return "";
        if (typeof h === "string") return h;
        const name = String(h.name || "").trim();
        const desc = String(h.description || "").trim();
        return name && desc ? `${name} \u2014 ${desc}` : name;
      })
      .filter((s) => s.length > 0);
    if (honorLines.length > 0) {
      paragraphs.push(sectionHeading("Honors & Awards"));
      honorLines.forEach((h) => paragraphs.push(bulletParagraph(h)));
    }

    // ─── Certifications ───
    const certs = Array.isArray(cvData.certifications) ? cvData.certifications : [];
    if (certs.length > 0) {
      paragraphs.push(sectionHeading("Certifications"));
      certs.forEach((cert: any) => {
        const parts: string[] = [];
        if (cert.name) parts.push(String(cert.name));
        if (cert.issuer) parts.push(String(cert.issuer));
        const line = parts.join(", ") + (cert.date ? `  (${cert.date})` : "");
        if (line.trim()) paragraphs.push(bulletParagraph(line));
      });
    }

    // ─── Projects ───
    const projectsOut = Array.isArray(cvData.projects) ? cvData.projects : [];
    if (projectsOut.length > 0) {
      paragraphs.push(sectionHeading("Projects"));
      projectsOut.forEach((proj: any, idx: number) => {
        paragraphs.push(experienceEntryLine(proj.name || "", undefined, undefined, idx > 0));
        (proj.bullets || []).forEach((b: string) => paragraphs.push(bulletParagraph(b)));
      });
    }

    // Assemble the document. Top/bottom 20mm, left/right 25mm per spec.
    const docFile = new Document({
      styles: {
        default: {
          document: { run: { font: FONT, size: BODY_SIZE } },
        },
      },
      sections: [{
        properties: {
          page: {
            // 15mm top/bottom, 20mm left/right (1mm ≈ 56.7 twips)
            margin: { top: 850, bottom: 850, left: 1134, right: 1134 },
          },
        },
        children: paragraphs,
      }],
    });

    // Packer.toBase64String is the most portable in Deno edge runtime —
    // toBlob / toBuffer rely on host APIs that aren't always available. We
    // decode the base64 into a Uint8Array for Supabase storage.
    const docBase64 = await Packer.toBase64String(docFile);
    const docBytes = Uint8Array.from(atob(docBase64), (c) => c.charCodeAt(0));

    const safeRole = safeTargetRole.replace(/[^a-zA-Z0-9_\-]/g, "_");
    const fileName = `${user.id}/${safeRole}_CV_${Date.now()}.docx`;
    const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    const { error: uploadError } = await serviceClient.storage
      .from("cvs")
      .upload(fileName, docBytes, { contentType: DOCX_MIME, upsert: true });

    if (uploadError) {
      return json({ error: `CV upload failed: ${uploadError.message}` }, 500);
    }

    const { data: signedUrlData, error: signedUrlError } = await serviceClient.storage
      .from("cvs")
      .createSignedUrl(fileName, 315360000);

    if (signedUrlError || !signedUrlData) {
      return json({ error: "Failed to generate CV download URL" }, 500);
    }
    const cv_url = signedUrlData.signedUrl;

    let appRecord;
    const templateFields = {
      cv_template_id: templateId,
      custom_template_id: requestedCustomTemplateId || null,
    };
    if (application_id) {
      const { data } = await supabase.from("applications").update({
        cv_url,
        cv_status: "ready",
        cv_version_name: `${safeTargetRole} CV`,
        cv_skills_emphasized: (cvData.skills as any)?.domain || [],
        ...templateFields,
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
        status: "interested",
        ...templateFields,
      }).select().single();
      appRecord = data;
    }

    // Collect any profile fields that silently dropped out of the CV because
    // the underlying data is empty — so the user can fix their profile
    // without having to diff the PDF against what they expected.
    const missing_contact_fields: string[] = [];
    if (!phonePresent) missing_contact_fields.push("phone_number");
    if (!emailPresent) missing_contact_fields.push("email");
    if (!locationPresent) missing_contact_fields.push("location");
    if (!linkedinPresent) missing_contact_fields.push("linkedin_url");

    return json({
      cv_url,
      application_id: appRecord?.id,
      fit_analysis: cvData.fit_analysis,
      library_match,
      message: `CV generated for "${safeTargetRole}". Download it using the link, and it's been saved to your Application Tracker.`,
      ...(tailoring && { tailoring }),
      ...(missing_contact_fields.length > 0 && { missing_contact_fields }),
    });
  } catch (error) {
    console.error("generate-tailored-cv error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
