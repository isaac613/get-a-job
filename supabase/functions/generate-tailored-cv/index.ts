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
// are proper Postgres ARRAY/jsonb (so we get a JS array back), but others like
// `profiles.honors` are `text` storing a JSON string ("[]", "[\"Dean's List\"]").
// Calling .slice().map() on a string doesn't throw on slice (strings have that
// method) but crashes on map — which is exactly the 500 we were seeing. Wrap
// every profile-derived array access in safeArray() before iterating.
function safeArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
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
    const safeJobDescription = String(job_description ?? '').slice(0, 5000);

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

    const trunc = (s: unknown, max: number) => String(s ?? '').slice(0, max);
    const userContext = {
      full_name: trunc(profile.full_name, 100),
      phone_number: trunc(profile.phone_number, 30),
      location: trunc(profile.location, 100),
      linkedin_url: trunc(profile.linkedin_url, 200),
      summary: trunc(profile.summary, 500),
      skills: safeArray(profile.skills).slice(0, 50).map((s) => trunc(s, 60)),
      experiences: safeArray(experiences).slice(0, 10).map((exp: any) => ({
        title: trunc(exp.title, 100),
        company: trunc(exp.company, 100),
        start_date: trunc(exp.start_date, 20),
        end_date: trunc(exp.end_date, 20),
        is_current: exp.is_current,
        responsibilities: trunc(exp.responsibilities, 500),
        skills_used: safeArray(exp.skills_used).slice(0, 20).map((s) => trunc(s, 60)),
        tools_used: safeArray(exp.tools_used).slice(0, 20).map((s) => trunc(s, 60)),
        managed_people: exp.managed_people ?? false,
        cross_functional: exp.cross_functional ?? false,
        type: trunc(exp.type, 50),
      })),
      projects: safeArray(projects).slice(0, 10).map((p: any) => ({
        name: trunc(p.name, 100),
        description: trunc(p.description, 300),
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
        honors: safeArray(profile.honors).slice(0, 10).map((h) => trunc(h, 100)),
        relevant_coursework: safeArray(profile.relevant_coursework).slice(0, 20).map((c) => trunc(c, 100)),
      },
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
    const systemPrompt = library_match ? `You are a CV Generation Engine for the "Get A Job" Career Operating System.

TARGET ROLE DEFINITION:
${JSON.stringify(targetRoleDef, null, 2)}

ROLE-SKILL MAPPING (core skills = must-haves, secondary = nice-to-haves, differentiator = standout skills):
${JSON.stringify(targetMapping, null, 2)}

RELEVANT SKILLS (only the skills mapped to this role):
${JSON.stringify(relevantSkills, null, 2)}

RELEVANT PROOF SIGNALS (CV signals that demonstrate these skills — use to identify which user experiences to emphasize):
${JSON.stringify(relevantSignals, null, 2)}

CV STRUCTURE RULES:
- One page maximum for students and recent graduates
- Sections in this order: Header → About Me → Experience → Education → Skills & Tools → Military Service (if applicable) → Certifications → Projects
- About Me: 2-3 sentences, role-specific, third person, reflecting strongest proof signals for this role
- Experience bullets: action verb + what you did + result or scale where possible. Quantify wherever the profile supports it
- Skills section: categorized by type (Domain / Tools / Languages) — not a flat list
- Military service must be included if present — translate into civilian language
- Use keywords from the job description and role definition naturally — do not keyword-stuff
- Never invent experience the user does not have
- Never exaggerate beyond what the profile supports

ROLE-SPECIFIC EMPHASIS:
- Lead the CV with skills marked as "core_skills" in the role-skill mapping above
- Use the proof signals above to identify which of the user's experiences most strongly demonstrate these core skills
- The role definition above contains the role's sector, responsibilities, and keywords — mirror these naturally in the About Me and bullet points
- Secondary skills should appear but not dominate; differentiator skills are bonus points if the user has them

STRONG ACTION VERBS TO USE:
Led, Built, Managed, Owned, Delivered, Launched, Developed, Implemented, Drove, Executed, Designed, Analyzed, Coordinated, Streamlined, Improved, Reduced, Increased, Generated, Negotiated, Trained, Supported, Collaborated` : `You are a CV Generation Engine for the "Get A Job" Career Operating System.

NOTE: The target role was not found in our standardized role library. Generate a strong CV using only the job description and user data. Infer appropriate skill emphasis from the job description itself.

CV STRUCTURE RULES:
- One page maximum for students and recent graduates
- Sections in this order: Header → About Me → Experience → Education → Skills & Tools → Military Service (if applicable) → Certifications → Projects
- About Me: 2-3 sentences, role-specific, third person
- Experience bullets: action verb + what you did + result or scale where possible. Quantify wherever the profile supports it
- Skills section: categorized by type (Domain / Tools / Languages) — not a flat list
- Military service must be included if present — translate into civilian language
- Use keywords from the job description naturally — do not keyword-stuff
- Never invent experience the user does not have
- Never exaggerate beyond what the profile supports

STRONG ACTION VERBS TO USE:
Led, Built, Managed, Owned, Delivered, Launched, Developed, Implemented, Drove, Executed, Designed, Analyzed, Coordinated, Streamlined, Improved, Reduced, Increased, Generated, Negotiated, Trained, Supported, Collaborated`;

    const userPrompt = `TARGET ROLE: ${safeTargetRole}

${safeJobDescription ? `JOB DESCRIPTION:\n${safeJobDescription}\n` : ""}

USER DATA:
${JSON.stringify(userContext, null, 2)}

TASK:
Generate a role-specific, one-page CV for this user tailored to the target role.

${library_match ? `Use the role definition, role-skill mapping, and proof signals from your system prompt to:
1. Identify which of the user's experiences are strongest proof signals for this role
2. Lead with the most relevant experience and skills
3. Mirror keywords from the job description and role definition naturally
4. Write an About Me that immediately signals fit for this specific role
5. Organize skills by category, not as a flat list
6. Include military service if present — translate into civilian language
7. Flag major gaps honestly in the fit_analysis` : `Without a library match, use the job description to identify which of the user's experiences are most relevant. Still:
1. Lead with the most relevant experience and skills
2. Mirror keywords from the job description naturally
3. Write an About Me that signals fit
4. Organize skills by category
5. Include military service if present — translate into civilian language
6. Flag major gaps honestly in the fit_analysis`}

OUTPUT STRUCTURE (JSON):
{
  "header": {
    "name": "string",
    "title": "string (target role title)",
    "contact": "string (phone | location | email | linkedin)"
  },
  "about_me": "string (2-3 sentences, role-specific, third person)",
  "experiences": [
    {
      "title": "string",
      "company": "string",
      "dates": "string",
      "bullets": ["action verb + task + result"]
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "dates": "string",
      "details": ["GPA if strong", "relevant coursework or achievements"]
    }
  ],
  "skills": {
    "domain": ["skill1", "skill2"],
    "tools": ["tool1", "tool2"],
    "languages": ["language1"]
  },
  "military_service": {
    "unit": "string",
    "role": "string",
    "dates": "string",
    "bullets": ["translated civilian language bullet"]
  },
  "certifications": [
    {
      "name": "string",
      "issuer": "string",
      "date": "string"
    }
  ],
  "projects": [
    {
      "name": "string",
      "bullets": ["what was built and the result"]
    }
  ],
  "fit_analysis": {
    "skill_match_percentage": number (0-100),
    "alignment": "Strong|Moderate|Weak",
    "major_gaps": ["gap1", "gap2"],
    "explanation": "string (honest 1-2 sentence assessment of fit)"
  }
}

Return ONLY valid JSON. Omit sections (military_service, certifications, projects) if no relevant data exists for them.`;

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
        temperature: 0.3,
        max_tokens: 3000,
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
    const pageBottom = 280;
    const ACCENT: [number, number, number] = [37, 99, 235];
    let y = 20;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageBottom) {
        doc.addPage();
        y = 20;
      }
    };

    const addSectionHeader = (title: string) => {
      // Keep header with at least one following line — require ~10mm below
      ensureSpace(10);
      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
      doc.text(title.toUpperCase(), leftMargin, y);
      y += 1.5;
      doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
      doc.setLineWidth(0.4);
      doc.line(leftMargin, y, rightMargin, y);
      y += 4;
    };

    const addEntryHeader = (title: string, dates?: string, subtitle?: string) => {
      ensureSpace(subtitle ? 12 : 7);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(String(title || ""), leftMargin, y);
      if (dates) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text(String(dates), rightMargin, y, { align: "right" });
      }
      y += 4.5;
      if (subtitle) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.text(String(subtitle), leftMargin, y);
        y += 4.5;
      }
    };

    const addBullet = (text: string) => {
      const indent = 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      const lines = doc.splitTextToSize(String(text || ""), pageWidth - indent);
      lines.forEach((line: string, i: number) => {
        ensureSpace(5);
        const prefix = i === 0 ? "\u2022  " : "   ";
        doc.text(prefix + line, leftMargin + indent, y);
        y += 4.2;
      });
    };

    const addParagraph = (text: string, fontSize = 10, color: [number, number, number] = [0, 0, 0]) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(fontSize);
      doc.setTextColor(color[0], color[1], color[2]);
      const lines = doc.splitTextToSize(String(text || ""), pageWidth);
      lines.forEach((line: string) => {
        ensureSpace(fontSize * 0.5 + 1);
        doc.text(line, leftMargin, y);
        y += fontSize * 0.55;
      });
    };

    const addSkillLine = (label: string, values: string[]) => {
      if (!values || values.length === 0) return;
      ensureSpace(6);
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      const labelText = `${label}: `;
      doc.text(labelText, leftMargin, y);
      const labelWidth = doc.getTextWidth(labelText);
      doc.setFont("helvetica", "normal");
      const valueText = values.join(", ");
      const lines = doc.splitTextToSize(valueText, pageWidth - labelWidth);
      lines.forEach((line: string, i: number) => {
        if (i > 0) {
          ensureSpace(5);
          doc.text(line, leftMargin + labelWidth, y);
        } else {
          doc.text(line, leftMargin + labelWidth, y);
        }
        y += 4.2;
      });
    };

    const addSpace = (space = 3) => { y += space; };

    // --- Header ---
    const header = cvData.header as any;
    if (header) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(0, 0, 0);
      doc.text(String(header.name || ""), leftMargin, y);
      y += 7;
      if (header.title) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(80, 80, 80);
        doc.text(String(header.title), leftMargin, y);
        y += 5;
      }
      if (header.contact) {
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.text(String(header.contact), leftMargin, y);
        y += 3;
      }
      y += 2;
      doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
      doc.setLineWidth(1.0);
      doc.line(leftMargin, y, rightMargin, y);
      y += 4;
    }

    // --- About Me ---
    if (cvData.about_me) {
      addSectionHeader("About Me");
      addParagraph(String(cvData.about_me), 10);
      addSpace(2);
    }

    // --- Experience ---
    if (Array.isArray(cvData.experiences) && cvData.experiences.length > 0) {
      addSectionHeader("Experience");
      (cvData.experiences as any[]).forEach((exp, idx) => {
        addEntryHeader(exp.title || "", exp.dates, exp.company);
        (exp.bullets || []).forEach((bullet: string) => addBullet(bullet));
        if (idx < cvData.experiences.length - 1) addSpace(3);
      });
      addSpace(2);
    }

    // --- Education ---
    if (Array.isArray(cvData.education) && cvData.education.length > 0) {
      addSectionHeader("Education");
      (cvData.education as any[]).forEach((edu, idx) => {
        addEntryHeader(edu.degree || "", edu.dates, edu.institution);
        if (Array.isArray(edu.details) && edu.details.length > 0) {
          edu.details.forEach((d: string) => addBullet(d));
        }
        if (idx < cvData.education.length - 1) addSpace(3);
      });
      addSpace(2);
    }

    // --- Skills & Tools ---
    const skills = cvData.skills as any;
    if (skills && (skills.domain?.length || skills.tools?.length || skills.languages?.length)) {
      addSectionHeader("Skills & Tools");
      if (skills.domain?.length > 0) addSkillLine("Domain", skills.domain);
      if (skills.tools?.length > 0) addSkillLine("Tools", skills.tools);
      if (skills.languages?.length > 0) addSkillLine("Languages", skills.languages);
      addSpace(2);
    }

    // --- Military Service ---
    const military = cvData.military_service as any;
    if (military && military.unit) {
      addSectionHeader("Military Service");
      addEntryHeader(military.role || "", military.dates, military.unit);
      (military.bullets || []).forEach((bullet: string) => addBullet(bullet));
      addSpace(2);
    }

    // --- Certifications ---
    if (Array.isArray(cvData.certifications) && cvData.certifications.length > 0) {
      addSectionHeader("Certifications");
      (cvData.certifications as any[]).forEach((cert) => {
        const line = `${cert.name || ""} \u2014 ${cert.issuer || ""}${cert.date ? `  (${cert.date})` : ""}`;
        addParagraph(line, 9);
      });
      addSpace(2);
    }

    // --- Projects ---
    if (Array.isArray(cvData.projects) && cvData.projects.length > 0) {
      addSectionHeader("Projects");
      (cvData.projects as any[]).forEach((proj, idx) => {
        addEntryHeader(proj.name || "", undefined, undefined);
        (proj.bullets || []).forEach((bullet: string) => addBullet(bullet));
        if (idx < cvData.projects.length - 1) addSpace(3);
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
