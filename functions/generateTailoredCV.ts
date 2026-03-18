import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { jsPDF } from 'npm:jspdf@2.5.2';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { job_description, target_role, application_id } = body;

  if (!target_role) {
    return Response.json({ error: 'target_role is required' }, { status: 400 });
  }

  // Fetch user profile and experience
  const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
  const experiences = await base44.entities.Experience.filter({ created_by: user.email });
  const projects = await base44.entities.Project.filter({ created_by: user.email });
  const certifications = await base44.entities.Certification.filter({ created_by: user.email });

  const profile = profiles[0];
  if (!profile) {
    return Response.json({ error: 'No user profile found' }, { status: 404 });
  }

  // Build context for LLM
  const userContext = {
    full_name: profile.full_name || user.full_name,
    email: user.email,
    phone_number: profile.phone_number,
    location: profile.location,
    linkedin_url: profile.linkedin_url,
    summary: profile.summary,
    skills: profile.skills || [],
    experiences: experiences.map(exp => ({
      title: exp.title,
      company: exp.company,
      start_date: exp.start_date,
      end_date: exp.end_date,
      is_current: exp.is_current,
      responsibilities: exp.responsibilities,
      skills_used: exp.skills_used,
      tools_used: exp.tools_used
    })),
    projects: projects.map(p => ({
      name: p.name,
      description: p.description,
      skills_demonstrated: p.skills_demonstrated
    })),
    certifications: certifications.map(c => ({
      name: c.name,
      issuer: c.issuer,
      date_earned: c.date_earned
    })),
    education: {
      degree: profile.degree,
      field_of_study: profile.field_of_study,
      education_level: profile.education_level,
      gpa: profile.gpa,
      honors: profile.honors,
      relevant_coursework: profile.relevant_coursework
    }
  };

  // Generate tailored CV content using LLM
  const prompt = `You are a CV generation engine for the "Get A Job" Career Operating System.

CORE PRINCIPLE:
A CV is not a biography. A CV is evidence that you can perform a specific job.

TARGET ROLE: ${target_role}

${job_description ? `JOB DESCRIPTION:\n${job_description}\n` : ''}

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
  "header": {
    "name": "string",
    "contact": "string (one line: location | email | phone | linkedin)"
  },
  "summary": "string (2-3 lines max)",
  "core_skills": ["skill1", "skill2", ...], (5-10 max, ordered by relevance)
  "experiences": [
    {
      "title": "string",
      "company": "string",
      "location": "string",
      "dates": "string (YYYY-YYYY or YYYY-Present)",
      "bullets": ["bullet1", "bullet2", ...]
    }
  ], (ordered by relevance to target role)
  "projects": [
    {
      "name": "string",
      "bullets": ["bullet1", "bullet2"]
    }
  ], (only if relevant)
  "education": {
    "degree": "string",
    "institution": "string",
    "dates": "string",
    "details": ["coursework1", "coursework2"] (optional, only if relevant)
  },
  "additional_skills": {
    "languages": ["lang1", "lang2"],
    "tools": ["tool1", "tool2"]
  } (optional),
  "fit_analysis": {
    "skill_match_percentage": number,
    "alignment": "string (Strong/Moderate/Weak)",
    "major_gaps": ["gap1", "gap2"],
    "explanation": "string (what this CV proves and what it doesn't)"
  }
}

Return ONLY valid JSON.`;

  const cvData = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: "object",
      properties: {
        header: {
          type: "object",
          properties: {
            name: { type: "string" },
            contact: { type: "string" }
          }
        },
        summary: { type: "string" },
        core_skills: { type: "array", items: { type: "string" } },
        experiences: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              company: { type: "string" },
              location: { type: "string" },
              dates: { type: "string" },
              bullets: { type: "array", items: { type: "string" } }
            }
          }
        },
        projects: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              bullets: { type: "array", items: { type: "string" } }
            }
          }
        },
        education: {
          type: "object",
          properties: {
            degree: { type: "string" },
            institution: { type: "string" },
            dates: { type: "string" },
            details: { type: "array", items: { type: "string" } }
          }
        },
        additional_skills: {
          type: "object",
          properties: {
            languages: { type: "array", items: { type: "string" } },
            tools: { type: "array", items: { type: "string" } }
          }
        },
        fit_analysis: {
          type: "object",
          properties: {
            skill_match_percentage: { type: "number" },
            alignment: { type: "string" },
            major_gaps: { type: "array", items: { type: "string" } },
            explanation: { type: "string" }
          }
        }
      }
    }
  });

  // Generate PDF
  const doc = new jsPDF();
  let y = 20;

  const addText = (text, fontSize = 10, isBold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    const lines = doc.splitTextToSize(String(text || ""), 170);
    lines.forEach(line => {
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
    cvData.experiences.forEach(exp => {
      addText(exp.title, 10, true);
      addText(`${exp.company} — ${exp.location}`, 9);
      addText(exp.dates, 9);
      addSpace(2);
      (exp.bullets || []).forEach(bullet => { addText(`• ${bullet}`, 9); });
      addSpace(6);
    });
  }

  if (cvData.projects?.length > 0) {
    addText("PROJECTS", 11, true);
    addSpace(4);
    cvData.projects.forEach(proj => {
      addText(proj.name, 10, true);
      addSpace(2);
      (proj.bullets || []).forEach(bullet => { addText(`• ${bullet}`, 9); });
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

  // Upload PDF to storage so it's accessible via URL
  const pdfBlob = new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
  const pdfFile = new File([pdfBlob], `${target_role.replace(/\s+/g, '_')}_CV.pdf`, { type: 'application/pdf' });
  const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file: pdfFile });
  const cv_url = uploadResult.file_url;

  // Create or update Application record in the tracker
  let appRecord;
  if (application_id) {
    appRecord = await base44.entities.Application.update(application_id, {
      cv_url,
      cv_status: "ready",
      cv_version_name: `${target_role} CV`,
      cv_skills_emphasized: cvData.core_skills || [],
    });
  } else {
    appRecord = await base44.entities.Application.create({
      role_title: target_role,
      cv_url,
      cv_status: "ready",
      cv_version_name: `${target_role} CV`,
      cv_skills_emphasized: cvData.core_skills || [],
      status: "interested",
    });
  }

  return Response.json({
    cv_url,
    application_id: appRecord?.id,
    fit_analysis: cvData.fit_analysis,
    message: `CV generated for "${target_role}". Download it using the link, and it's been saved to your Application Tracker.`,
  });
});