import { createClient } from "npm:@supabase/supabase-js@2";
import { jsPDF } from "npm:jspdf@2.5.2";

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // User-scoped client — all DB operations run under RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Service client — only for storage (upload + signed URL)
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

    if (!target_role) {
      return Response.json({ error: "target_role is required" }, { status: 400 });
    }
    if (application_id !== undefined && typeof application_id !== 'string') {
      return Response.json({ error: 'Invalid application_id.' }, { status: 400 });
    }

    // Fetch user profile and related data
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

    const userContext = {
      full_name: profile.full_name,
      email: user.email,
      phone_number: profile.phone_number,
      location: profile.location,
      linkedin_url: profile.linkedin_url,
      summary: profile.summary,
      skills: profile.skills || [],
      experiences: experiences.map((exp: any) => ({
        title: exp.title,
        company: exp.company,
        start_date: exp.start_date,
        end_date: exp.end_date,
        is_current: exp.is_current,
        responsibilities: exp.responsibilities,
        skills_used: exp.skills_used,
        tools_used: exp.tools_used,
      })),
      projects: projects.map((p: any) => ({
        name: p.name,
        description: p.description,
        skills_demonstrated: p.skills_demonstrated,
      })),
      certifications: certifications.map((c: any) => ({
        name: c.name,
        issuer: c.issuer,
        date_earned: c.date_earned,
      })),
      education: {
        degree: profile.degree,
        field_of_study: profile.field_of_study,
        education_level: profile.education_level,
        gpa: profile.gpa,
        honors: profile.honors,
        relevant_coursework: profile.relevant_coursework,
      },
    };

    const prompt = `You are a CV generation engine for the "Get A Job" Career Operating System.

CORE PRINCIPLE:
A CV is not a biography. A CV is evidence that you can perform a specific job.

TARGET ROLE: ${target_role}

${job_description ? `JOB DESCRIPTION:\n${job_description}\n` : ""}

USER DATA:
${JSON.stringify(userContext, null, 2)}

TASK:
Generate a role-specific CV optimized for the target role.

RULES:
1. Tailor every section to prove capability for THIS role
2. Reorder experiences by relevance to the target role
3. Mirror language from the job description when appropriate
4. Use action verbs + task + impact format for bullets
5. Keep bullets concise (1 line each)
6. Only include skills relevant to the target role
7. Professional summary: 2-3 lines, Role Identity + Key Skills + Domain Focus
8. NO fluff, NO buzzwords, NO first person
9. Prioritize proof over personality

OUTPUT STRUCTURE (JSON):
{
  "header": { "name": "string", "contact": "string (one line: location | email | phone | linkedin)" },
  "summary": "string (2-3 lines max)",
  "core_skills": ["skill1", "skill2"],
  "experiences": [{ "title": "string", "company": "string", "location": "string", "dates": "string", "bullets": ["bullet1"] }],
  "projects": [{ "name": "string", "bullets": ["bullet1"] }],
  "education": { "degree": "string", "institution": "string", "dates": "string", "details": ["coursework1"] },
  "additional_skills": { "languages": ["lang1"], "tools": ["tool1"] },
  "fit_analysis": { "skill_match_percentage": 0, "alignment": "Strong/Moderate/Weak", "major_gaps": ["gap1"], "explanation": "string" }
}

Return ONLY valid JSON.`;

    // OpenAI key must be set in Supabase Edge Function secrets (not a VITE_ variable)
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return Response.json({ error: "OpenAI API key not configured on server" }, { status: 500 });
    }

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
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

    // Generate PDF
    const doc = new jsPDF();
    let y = 20;

    const addText = (text: string, fontSize = 10, isBold = false) => {
      doc.setFontSize(fontSize);
      doc.setFont("helvetica", isBold ? "bold" : "normal");
      const lines = doc.splitTextToSize(String(text || ""), 170);
      lines.forEach((line: string) => {
        if (y > 280) { doc.addPage(); y = 20; }
        doc.text(line, 20, y);
        y += fontSize * 0.4;
      });
    };

    const addSpace = (space = 5) => { y += space; };

    addText(cvData.header?.name || "", 16, true);
    addText(cvData.header?.contact || "", 9);
    addSpace(8);

    if (cvData.summary) {
      addText("PROFESSIONAL SUMMARY", 11, true);
      addSpace(3);
      addText(cvData.summary, 10);
      addSpace(8);
    }

    if (cvData.core_skills?.length > 0) {
      addText("CORE SKILLS", 11, true);
      addSpace(3);
      addText(cvData.core_skills.join(" • "), 10);
      addSpace(8);
    }

    if (cvData.experiences?.length > 0) {
      addText("PROFESSIONAL EXPERIENCE", 11, true);
      addSpace(4);
      cvData.experiences.forEach((exp: any) => {
        addText(exp.title, 10, true);
        addText(`${exp.company} — ${exp.location}`, 9);
        addText(exp.dates, 9);
        addSpace(2);
        (exp.bullets || []).forEach((bullet: string) => { addText(`• ${bullet}`, 9); });
        addSpace(6);
      });
    }

    if (cvData.projects?.length > 0) {
      addText("PROJECTS", 11, true);
      addSpace(4);
      cvData.projects.forEach((proj: any) => {
        addText(proj.name, 10, true);
        addSpace(2);
        (proj.bullets || []).forEach((bullet: string) => { addText(`• ${bullet}`, 9); });
        addSpace(6);
      });
    }

    if (cvData.education) {
      addText("EDUCATION", 11, true);
      addSpace(3);
      addText(cvData.education.degree, 10, true);
      addText(`${cvData.education.institution} — ${cvData.education.dates}`, 9);
      if (cvData.education.details?.length > 0) {
        addSpace(2);
        addText(`Relevant coursework: ${cvData.education.details.join(", ")}`, 9);
      }
      addSpace(8);
    }

    if (cvData.additional_skills) {
      addText("ADDITIONAL SKILLS", 11, true);
      addSpace(3);
      if (cvData.additional_skills.languages?.length > 0) {
        addText(`Languages: ${cvData.additional_skills.languages.join(", ")}`, 9);
      }
      if (cvData.additional_skills.tools?.length > 0) {
        addText(`Tools: ${cvData.additional_skills.tools.join(", ")}`, 9);
      }
    }

    // Upload PDF to Supabase Storage
    const pdfBuffer = doc.output("arraybuffer");
    const fileName = `${user.id}/${target_role.replace(/\s+/g, "_")}_CV_${Date.now()}.pdf`;

    const { error: uploadError } = await serviceClient.storage
      .from("cvs")
      .upload(fileName, pdfBuffer, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      console.error("PDF upload error:", uploadError);
      return Response.json({ error: `PDF upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: signedUrlData, error: signedUrlError } = await serviceClient.storage
      .from("cvs")
      .createSignedUrl(fileName, 31536000); // 1 year expiry

    if (signedUrlError || !signedUrlData) {
      return Response.json({ error: "Failed to generate CV download URL" }, { status: 500 });
    }
    const cv_url = signedUrlData.signedUrl;

    // Create or update the Application record
    let appRecord;
    if (application_id) {
      const { data } = await supabase
        .from("applications")
        .update({
          cv_url,
          cv_status: "ready",
          cv_version_name: `${target_role} CV`,
          cv_skills_emphasized: cvData.core_skills || [],
        })
        .eq("id", application_id)
        .eq("user_id", user.id)
        .select()
        .single();
      appRecord = data;
    } else {
      const { data } = await supabase
        .from("applications")
        .insert({
          user_id: user.id,
          role_title: target_role,
          cv_url,
          cv_status: "ready",
          cv_version_name: `${target_role} CV`,
          cv_skills_emphasized: cvData.core_skills || [],
          status: "interested",
        })
        .select()
        .single();
      appRecord = data;
    }

    return Response.json({
      cv_url,
      application_id: appRecord?.id,
      fit_analysis: cvData.fit_analysis,
      message: `CV generated for "${target_role}". Download it using the link, and it's been saved to your Application Tracker.`,
    });
  } catch (error) {
    console.error("Error generating tailored CV:", error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
