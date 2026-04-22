import { createClient } from "npm:@supabase/supabase-js@2";
import { jsPDF } from "npm:jspdf@2.5.2";

// --- Load JSON Libraries ---
import { roleLibrary } from "./shared/libraries/00_role_library.ts";
import { skillLibrary } from "./shared/libraries/01_skill_library.ts";
import { proofSignalLibrary } from "./shared/libraries/02_proof_signal_library.ts";
import { roleSkillMapping } from "./shared/libraries/04_role_skill_mapping.ts";

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const rawBody = JSON.stringify(body);
    if (rawBody.length > 50_000) {
      return Response.json({ error: 'Request payload too large.' }, { status: 413 });
    }
    const { job_description, target_role, application_id } = body;
    const safeTargetRole = String(target_role ?? '').slice(0, 200);
    const safeJobDescription = String(job_description ?? '').slice(0, 5000);

    if (!safeTargetRole) {
      return Response.json({ error: "target_role is required" }, { status: 400 });
    }
    if (application_id !== undefined && typeof application_id !== 'string') {
      return Response.json({ error: 'Invalid application_id.' }, { status: 400 });
    }

    const { data: allowed } = await serviceClient.rpc('check_rate_limit', {
      p_user_id: user.id,
      p_function_name: 'generate-tailored-cv',
      p_max_calls: 10,
      p_window_seconds: 3600,
    });
    if (!allowed) {
      return Response.json({ error: 'Rate limit exceeded. Try again in an hour.' }, { status: 429 });
    }

    const [profileRes, experiencesRes, projectsRes, certificationsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("experiences").select("*").eq("user_id", user.id),
      supabase.from("projects").select("*").eq("user_id", user.id),
      supabase.from("certifications").select("*").eq("user_id", user.id),
    ]);

    const profile = profileRes.data;
    if (!profile) {
      return Response.json({ error: "No user profile found" }, { status: 404 });
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
      skills: (profile.skills || []).slice(0, 50).map((s: unknown) => trunc(s, 60)),
      experiences: experiences.slice(0, 10).map((exp: any) => ({
        title: trunc(exp.title, 100),
        company: trunc(exp.company, 100),
        start_date: trunc(exp.start_date, 20),
        end_date: trunc(exp.end_date, 20),
        is_current: exp.is_current,
        responsibilities: trunc(exp.responsibilities, 500),
        skills_used: (exp.skills_used || []).slice(0, 20).map((s: unknown) => trunc(s, 60)),
        tools_used: (exp.tools_used || []).slice(0, 20).map((s: unknown) => trunc(s, 60)),
        managed_people: exp.managed_people ?? false,
        cross_functional: exp.cross_functional ?? false,
        type: trunc(exp.type, 50),
      })),
      projects: projects.slice(0, 10).map((p: any) => ({
        name: trunc(p.name, 100),
        description: trunc(p.description, 300),
        skills_demonstrated: (p.skills_demonstrated || []).slice(0, 20).map((s: unknown) => trunc(s, 60)),
      })),
      certifications: certifications.slice(0, 10).map((c: any) => ({
        name: trunc(c.name, 100),
        issuer: trunc(c.issuer, 100),
        date_earned: trunc(c.date_earned, 20),
      })),
      education: {
        degree: trunc(profile.degree, 100),
        field_of_study: trunc(profile.field_of_study, 100),
        education_level: trunc(profile.education_level, 50),
        gpa: trunc(profile.gpa, 10),
        honors: (profile.honors || []).slice(0, 10).map((h: unknown) => trunc(h, 100)),
        relevant_coursework: (profile.relevant_coursework || []).slice(0, 20).map((c: unknown) => trunc(c, 100)),
      },
    };

    // --- Build System Prompt with Library Context ---
    const systemPrompt = `You are a CV Generation Engine for the "Get A Job" Career Operating System.

You have access to the following standardized libraries. Use them as your source of truth when deciding which skills to emphasize, which proof signals to surface, and how to structure the CV for the target role.

ROLE LIBRARY (use to understand what the target role requires ΓÇö responsibilities, required skills, keywords):
${JSON.stringify(roleLibrary, null, 2)}

SKILL LIBRARY (use to understand skill categories and which skills are most relevant for each role type):
${JSON.stringify(skillLibrary, null, 2)}

PROOF SIGNAL LIBRARY (use to identify which of the user's experiences are strongest proof signals for the target role ΓÇö and surface them prominently in the CV):
${JSON.stringify(proofSignalLibrary, null, 2)}

ROLE-SKILL MAPPING (use to know which skills are core, secondary, and differentiator for the target role ΓÇö lead with core skills in the CV):
${JSON.stringify(roleSkillMapping, null, 2)}

CV STRUCTURE RULES:
- One page maximum for students and recent graduates
- Sections in this order: Header ΓåÆ About Me ΓåÆ Experience ΓåÆ Education ΓåÆ Skills & Tools ΓåÆ Military Service (if applicable) ΓåÆ Certifications ΓåÆ Projects
- About Me: 2-3 sentences, role-specific, third person, reflecting strongest proof signals for this role
- Experience bullets: action verb + what you did + result or scale where possible. Quantify wherever the profile supports it
- Skills section: categorized by type (Domain / Tools / Languages) ΓÇö not a flat list
- Military service must be included if present ΓÇö translate into civilian language
- Use keywords from the job description and role library naturally ΓÇö do not keyword-stuff
- Never invent experience the user does not have
- Never exaggerate beyond what the profile supports

ROLE-SPECIFIC CONTENT EMPHASIS:
Based on the target role, emphasize the following in bullets and the About Me:

Customer Success / Account Management:
- Lead with: customer-facing experience, relationship management, communication
- Keywords: customer success, account management, onboarding, NPS, CSAT, churn, renewal, upsell
- Metrics: accounts managed, retention rate, NPS scores

Sales / SDR / BDR:
- Lead with: commercial results, outreach volume, pipeline
- Keywords: pipeline, prospecting, outbound, quota, revenue, discovery calls
- Metrics: calls/emails sent, meetings booked, conversion rates, revenue generated

Marketing:
- Lead with: campaigns, content, measurable outcomes
- Keywords: campaign, growth, acquisition, conversion, engagement, content, analytics
- Metrics: traffic growth, conversion rates, engagement rates, campaign ROI

Product Management / Product Operations:
- Lead with: ownership, cross-functional work, delivery
- Keywords: roadmap, prioritization, discovery, user research, go-to-market, metrics
- Metrics: features shipped, adoption rates, time to delivery

Business Analysis / Operations:
- Lead with: analytical thinking, process improvement, data work
- Keywords: analysis, reporting, process improvement, stakeholder, SQL, Excel, dashboards
- Metrics: efficiency gains, process improvements, reporting scope

Technical / Engineering:
- Lead with: technical stack, projects built, systems worked on
- Keywords: specific languages and frameworks relevant to the role
- Metrics: system scale, performance improvements, projects shipped

STRONG ACTION VERBS TO USE:
Led, Built, Managed, Owned, Delivered, Launched, Developed, Implemented, Drove, Executed, Designed, Analyzed, Coordinated, Streamlined, Improved, Reduced, Increased, Generated, Negotiated, Trained, Supported, Collaborated`;

    const userPrompt = `TARGET ROLE: ${safeTargetRole}

${safeJobDescription ? `JOB DESCRIPTION:\n${safeJobDescription}\n` : ""}

USER DATA:
${JSON.stringify(userContext, null, 2)}

TASK:
Generate a role-specific, one-page CV for this user tailored to the target role.

Use the role library and skill mapping from your system prompt to:
1. Identify which of the user's experiences are strongest proof signals for this role
2. Lead with the most relevant experience and skills
3. Mirror keywords from the job description and role library naturally
4. Write an About Me that immediately signals fit for this specific role
5. Organize skills by category, not as a flat list
6. Include military service if present ΓÇö translate into civilian language
7. Flag major gaps honestly in the fit_analysis

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
      return Response.json({ error: "OpenAI API key not configured on server" }, { status: 500 });
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
      return Response.json({ error: `OpenAI error: ${err}` }, { status: 500 });
    }

    const openaiData = await openaiRes.json();
    let cvData: Record<string, unknown>;
    try {
      cvData = JSON.parse(openaiData.choices?.[0]?.message?.content || "{}");
    } catch {
      return Response.json({ error: "AI returned an invalid response format. Please try again." }, { status: 500 });
    }

    // --- Generate PDF (Gidon Werner style) ---
    const doc = new jsPDF();
    let y = 20;
    const pageWidth = 190;
    const leftMargin = 15;
    const rightMargin = 195;

    const addText = (text: string, fontSize = 10, isBold = false, color = [0, 0, 0]) => {
      doc.setFontSize(fontSize);
      doc.setFont("helvetica", isBold ? "bold" : "normal");
      doc.setTextColor(color[0], color[1], color[2]);
      const lines = doc.splitTextToSize(String(text || ""), pageWidth);
      lines.forEach((line: string) => {
        if (y > 280) { doc.addPage(); y = 20; }
        doc.text(line, leftMargin, y);
        y += fontSize * 0.55;
      });
    };

    const addDivider = () => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.setDrawColor(200, 200, 200);
      doc.line(leftMargin, y, rightMargin, y);
      y += 4;
    };

    const addSection = (title: string) => {
      y += 4;
      addText(title, 11, true);
      addDivider();
    };

    const addSpace = (space = 4) => { y += space; };

    // Header
    const header = cvData.header as any;
    if (header) {
      addText(header.name || "", 18, true);
      if (header.title) addText(header.title, 11, false, [80, 80, 80]);
      addDivider();
      if (header.contact) addText(header.contact, 9, false, [80, 80, 80]);
      addSpace(6);
    }

    // About Me
    if (cvData.about_me) {
      addSection("ABOUT ME");
      addText(String(cvData.about_me), 10);
      addSpace(4);
    }

    // Experience
    if (Array.isArray(cvData.experiences) && cvData.experiences.length > 0) {
      addSection("EXPERIENCE");
      (cvData.experiences as any[]).forEach((exp) => {
        addText(`${exp.company || ""}`, 10, false, [80, 80, 80]);
        addText(`${exp.title || ""}`, 10, true);
        if (exp.dates) addText(exp.dates, 9, false, [120, 120, 120]);
        addSpace(2);
        (exp.bullets || []).forEach((bullet: string) => {
          addText(`ΓÇó ${bullet}`, 9);
        });
        addSpace(5);
      });
    }

    // Education
    if (Array.isArray(cvData.education) && cvData.education.length > 0) {
      addSection("EDUCATION");
      (cvData.education as any[]).forEach((edu) => {
        addText(edu.institution || "", 10, false, [80, 80, 80]);
        addText(edu.degree || "", 10, true);
        if (edu.dates) addText(edu.dates, 9, false, [120, 120, 120]);
        if (edu.details?.length > 0) {
          addSpace(2);
          edu.details.forEach((d: string) => addText(`ΓÇó ${d}`, 9));
        }
        addSpace(5);
      });
    }

    // Military Service
    const military = cvData.military_service as any;
    if (military && military.unit) {
      addSection("MILITARY SERVICE");
      addText(military.unit || "", 10, false, [80, 80, 80]);
      addText(military.role || "", 10, true);
      if (military.dates) addText(military.dates, 9, false, [120, 120, 120]);
      addSpace(2);
      (military.bullets || []).forEach((bullet: string) => {
        addText(`ΓÇó ${bullet}`, 9);
      });
      addSpace(5);
    }

    // Skills & Tools
    const skills = cvData.skills as any;
    if (skills) {
      addSection("SKILLS & TOOLS");
      if (skills.domain?.length > 0) addText(`Domain: ${skills.domain.join(", ")}`, 9);
      if (skills.tools?.length > 0) addText(`Tools: ${skills.tools.join(", ")}`, 9);
      if (skills.languages?.length > 0) addText(`Languages: ${skills.languages.join(", ")}`, 9);
      addSpace(4);
    }

    // Certifications
    if (Array.isArray(cvData.certifications) && cvData.certifications.length > 0) {
      addSection("CERTIFICATIONS");
      (cvData.certifications as any[]).forEach((cert) => {
        addText(`${cert.name} | ${cert.issuer}${cert.date ? ` | ${cert.date}` : ""}`, 9);
      });
      addSpace(4);
    }

    // Projects
    if (Array.isArray(cvData.projects) && cvData.projects.length > 0) {
      addSection("PROJECTS");
      (cvData.projects as any[]).forEach((proj) => {
        addText(proj.name || "", 10, true);
        addSpace(2);
        (proj.bullets || []).forEach((bullet: string) => {
          addText(`ΓÇó ${bullet}`, 9);
        });
        addSpace(5);
      });
    }

    const pdfBuffer = doc.output("arraybuffer");
    const safeRole = safeTargetRole.replace(/[^a-zA-Z0-9_\-]/g, "_");
    const fileName = `${user.id}/${safeRole}_CV_${Date.now()}.pdf`;

    const { error: uploadError } = await serviceClient.storage
      .from("cvs")
      .upload(fileName, pdfBuffer, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      return Response.json({ error: `PDF upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: signedUrlData, error: signedUrlError } = await serviceClient.storage
      .from("cvs")
      .createSignedUrl(fileName, 315360000);

    if (signedUrlError || !signedUrlData) {
      return Response.json({ error: "Failed to generate CV download URL" }, { status: 500 });
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
      if (!data) { return Response.json({ error: "Application not found or not owned by user." }, { status: 404 }); }
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

    return Response.json({
      cv_url,
      application_id: appRecord?.id,
      fit_analysis: cvData.fit_analysis,
      message: `CV generated for "${safeTargetRole}". Download it using the link, and it's been saved to your Application Tracker.`,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
