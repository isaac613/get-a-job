import React, { useState, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(" ") + "\n";
  }
  return text;
}

// Extract plain text from a .docx file. mammoth supports modern Word
// documents (.docx) but NOT legacy binary .doc — those need to be saved as
// .docx or .pdf first. The default accept attribute on the file input was
// updated to drop .doc.
//
// Dynamic import: mammoth + its dependencies (jszip, xmldom) add ~510 KB to
// the bundle. Loading on demand keeps that off the initial Vite chunk for
// the ~50% of users who upload PDF or skip CV entirely.
async function extractTextFromDocx(file) {
  const { default: mammoth } = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || "";
}

// Detect a .docx by either MIME or extension — some browsers (Safari,
// older Chrome) leave file.type empty for Office formats.
function isDocxFile(file) {
  if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return true;
  return /\.docx$/i.test(file.name || "");
}

import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, CheckCircle2, ArrowRight, Linkedin } from "lucide-react";

const RESUME_SCHEMA = {
  type: "object",
  properties: {
    full_name: { type: "string" },
    email: { type: "string" },
    phone_number: { type: "string" },
    linkedin_url: { type: "string" },
    summary: { type: "string" },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          degree: { type: "string" },
          field_of_study: { type: "string" },
          institution: { type: "string" },
          graduation_year: { type: "string" },
          gpa: { type: "string" },
          honors: { type: "array", items: { type: "string" } }
        }
      }
    },
    education_level: { 
      type: "string", 
      enum: ["high_school", "associate", "bachelors", "masters", "phd", "bootcamp", "self_taught"],
      description: "Highest level of education completed"
    },
    experience: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          company: { type: "string" },
          start_date: { type: "string" },
          end_date: { type: "string" },
          is_current: { type: "boolean" },
          responsibilities: { type: "array", items: { type: "string" } },
          skills_used: { type: "array", items: { type: "string" } }
        }
      }
    },
    volunteering: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          organization: { type: "string" },
          start_date: { type: "string" },
          end_date: { type: "string" },
          description: { type: "string" }
        }
      }
    },
    skills: { type: "array", items: { type: "string" } },
    projects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          url: { type: "string" },
          skills_demonstrated: { type: "array", items: { type: "string" } }
        }
      }
    },
    certifications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          issuer: { type: "string" },
          date_earned: { type: "string" }
        }
      }
    }
  }
};

export default function StepResumeUpload({ onNext, onExtracted, profileData, onChange }) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [cvTruncated, setCvTruncated] = useState(false);
  const [linkedinUrl, setLinkedinUrl] = useState(profileData?.linkedin_url || "");
  const [extractingLinkedin, setExtractingLinkedin] = useState(false);
  const [linkedinDone, setLinkedinDone] = useState(false);
  const inputRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setUploading(true);

    try {
      // Upload to Supabase Storage
      const filePath = `${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get a long-lived signed URL (bucket is private)
      const { data: signedData } = await supabase.storage
        .from("resumes")
        .createSignedUrl(filePath, 315360000); // ~10 years

      // Save URL to local state — persisted when saveProgress runs at next step
      const resumeUrl = signedData?.signedUrl || filePath;
      onChange({ resume_url: resumeUrl });

      setUploading(false);
      setExtracting(true);

      // Try to extract resume content via LLM. Branch by format:
      //   .pdf  → pdfjs-dist (existing path)
      //   .docx → mammoth (added for N-O37; previously fell through to
      //           file.text() which read the binary as UTF-8 garbage)
      //   legacy .doc → reject — mammoth doesn't support the old binary
      //           format; user must save as .docx or .pdf
      //   anything else → fall through to file.text() so plain-text uploads
      //           still work the way they did before
      let fileText = "";
      if (file.type === "application/pdf") {
        fileText = await extractTextFromPdf(file);
      } else if (isDocxFile(file)) {
        fileText = await extractTextFromDocx(file);
      } else if (file.type === "application/msword" || /\.doc$/i.test(file.name || "")) {
        throw new Error("Legacy .doc files aren't supported. Please save your CV as .docx or .pdf and upload again.");
      } else {
        fileText = await file.text();
      }

      if (fileText.length > 15000) {
        setCvTruncated(true);
      }

      const extractionPrompt = `Extract structured information from this resume text. Return ONLY a raw JSON object (no markdown, no code blocks) with these fields: full_name, phone_number, location, linkedin_url, summary, degree, field_of_study, education_level, skills (array of ALL skills combined), tools_software (array: apps/platforms/tools like Excel, Figma, Salesforce, Python, AWS), hard_skills (array: domain knowledge like Financial modeling, Market research, Contract law), technical_skills (array: engineering/programming skills like React, SQL, Machine learning — leave empty if not applicable), analytical_skills (array: data/problem-solving skills like Data analysis, Forecasting, A/B testing), communication_skills (array: written/verbal skills like Presentations, Technical writing, Public speaking), leadership_skills (array: people/management skills like Project management, Mentoring, Stakeholder management), experiences (array of {title, company, type, start_date, end_date, responsibilities}).

PHONE NUMBER — scan the full document, not just the header:
- Search the ENTIRE resume text for a phone number, including the header, "Contact" section, email signature area, and anywhere near the email/LinkedIn.
- Accept any of these formats and keep the original formatting:
  • Israeli mobile: "054-3000613", "050 123 4567", "+972-54-300-0613", "+972 54 300 0613"
  • US: "(212) 555-0100", "212-555-0100", "+1 212 555 0100"
  • International: "+44 20 7946 0958", "+49 30 12345678"
- Strip any labels ("Phone:", "Mobile:", "M:", "Tel:") from the value.
- If no phone number is present in the resume, leave phone_number as an empty string — do NOT fabricate.

JOB TITLE RULES — applies to EVERY experience (professional, military, volunteering, leadership):
- The title field is a SHORT NOUN PHRASE, typically 2–5 words (e.g. "Senior Product Manager", "Sergeant First Class", "Marketing Intern", "President of Debate Club").
- NEVER put a responsibility sentence or action-verb statement in the title field. "Supervised and trained teams of soldiers" is NOT a title — it is a responsibility bullet. If the resume shows a block like:
    Nahal Brigade | 2020–2022
    • Supervised and trained teams of up to 30 soldiers...
  then the title is a RANK (see MILITARY section below), NOT the bullet text.
- Titles never start with verbs like Supervised / Managed / Led / Coordinated / Trained / Oversaw / Delivered / Assisted / Designed. If you see one of these starting a candidate-title, it's a responsibility — route it into the responsibilities array, not title.
- Never leave the title blank. If the resume doesn't state a title explicitly, infer the most likely short title from context (see MILITARY defaults below for military roles). For non-military roles without a clear title, use the closest standard role name (e.g. "Marketing Intern", "Research Assistant", "Program Coordinator").

EXPERIENCE TYPE CLASSIFICATION (required for every experience):
Set the "type" field on each experience to EXACTLY ONE of these values:
- "military"    — any military service. See military section below.
- "internship"  — explicit internships or summer placements
- "full_time"   — regular full-time employment (default when unclear but the role looks like a paid job)
- "part_time"   — part-time paid work
- "freelance"   — freelance / contract / self-employed / consulting
- "volunteer"   — unpaid volunteer work, community service, pro bono
- "leadership"  — student club president, team captain, society chair, founder of a student initiative

MILITARY SERVICE — recognise and extract carefully:
Treat any of the following as MILITARY experience (type="military"):
- English mentions: "IDF", "Israel Defense Forces", "Israeli Defense Forces", "Israeli military", "army service", "mandatory service", "reserve service", "commander", "combat soldier"
- Hebrew mentions: "צה״ל", "צהל", "שירות צבאי", "שירות מילואים", "מפקד"
- Specific units/corps (any of these → military): Givati, Golani, Nahal, Nachal, Paratroopers, Tzanhanim, Sayeret, Sayeret Matkal, Shaldag, Duvdevan, Kfir, Egoz, Maglan, Unit 8200, 8200, Mamram, Talpiot, Havatzalot, Intelligence Corps, Modi'in, Cyber Defense, IAF, Israeli Air Force, Navy, Shayetet, Home Front Command, Pikud Haoref, Combat Engineering, Artillery Corps, Armored Corps, Gaza Division, Officer's School, Bahad 1

When you classify an experience as military:
- Set company to the specific unit if named ("Nahal Brigade", "Unit 8200", "Golani Brigade", etc.), otherwise "Israel Defense Forces (IDF)".
- Title MUST be a rank or a short role name — NEVER a responsibility sentence. Prefer, in this priority order:
    1. An explicit rank named in the resume: "Sergeant First Class", "Staff Sergeant", "First Sergeant", "Lieutenant", "Captain", "Major", "Samal Rishon", "Samal", "Segen", "Seren", etc.
    2. An explicit role named in the resume: "Squad Commander", "Team Commander", "Platoon Commander", "Company Commander", "Intelligence Officer", "Intelligence Analyst", "Signals Intelligence Analyst", "Cyber Analyst", "Software Developer (IDF)", "Combat Medic", "Instructor", "Drill Sergeant".
    3. If the resume says the person was a commander/team lead but gives no explicit rank or role, use "Team Commander".
    4. If the resume shows only combat service with no rank or role named, use "Combat Soldier".
    5. Absolute last resort: "Military Service Member". Never leave title blank and never use a bullet-point sentence.
- Keep awards/commendations (Presidential Award for Excellence, unit citations, excellence commendations) in the responsibilities text — do not drop them.
- Translate Hebrew responsibility bullets to concise English.

Here is the resume:\n\n${fileText.slice(0, 15000)}`;

      const { data: extractData, error: fnError } = await supabase.functions.invoke("ai-chat", {
        body: {
          message: extractionPrompt,
          agent: "resume-extractor",
          conversation_history: [],
        },
      });

      if (fnError) throw new Error(fnError.message || "Edge function error");


      const replyText = extractData?.reply || extractData?.content || extractData?.text || "";

      if (replyText) {
        const jsonMatch = replyText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          let extracted = null;

          // Attempt 1: direct parse
          try { extracted = JSON.parse(jsonMatch[0]); } catch {}

          // Attempt 2: only unescape if the JSON looks double-escaped
          // (guard prevents corrupting valid JSON that contains backslashes)
          if (!extracted && /\{\s*\\"/.test(jsonMatch[0])) {
            try {
              const unescaped = jsonMatch[0]
                .replace(/\\"/g, '"')
                .replace(/\\n/g, '\n')
                .replace(/\\t/g, '\t');
              extracted = JSON.parse(unescaped);
            } catch (e) {
              console.error("JSON parse failed after unescaping:", e);
            }
          }

          if (extracted) {
            // Run proof signal extraction in parallel — non-blocking, failure is non-fatal
            let proofSignals = [];
            let primaryDomain = null;
            let adjacentFields = [];
            try {
              const { data: psData } = await supabase.functions.invoke("extract-proof-signals", {
                body: { cv_text: fileText.slice(0, 15000) },
              });
              if (psData?.proof_signals?.length) {
                proofSignals = psData.proof_signals;
                primaryDomain = psData.primary_domain || null;
                adjacentFields = psData.adjacent_fields || [];
              }
            } catch (psErr) {
              console.warn("Proof signal extraction failed (non-fatal):", psErr);
            }

            onExtracted({ ...extracted, proof_signals: proofSignals, primary_domain: primaryDomain, adjacent_fields: adjacentFields });
            setExtracting(false);
            setDone(true);
            return;
          }
        }
      }

      // File uploaded but extraction failed — still a success
      console.warn("Extraction fallback. Response was:", extractData);
      setExtracting(false);
      setDone(true);
      setError(`Resume uploaded successfully! However, automatic extraction wasn't possible. Please fill in your details manually.`);
    } catch (err) { 
      console.error("Resume upload error:", err);
      setUploading(false);
      setExtracting(false);
      setError(`Upload failed: ${err.message}. Please try again or enter details manually.`);
    }
  };

  const handleLinkedinExtract = () => {
    if (!linkedinUrl.trim()) return;
    onChange({ linkedin_url: linkedinUrl });
    onExtracted({ linkedin_url: linkedinUrl });
    setLinkedinDone(true);
  };

  const employmentOptions = [
    { value: "student", label: "Student" },
    { value: "looking_for_job", label: "Looking for a job" },
    { value: "employed", label: "Have a job" },
    { value: "unemployed", label: "Unemployed" },
    { value: "freelance", label: "Freelancing" },
  ];

  const toggleEmploymentStatus = (value) => {
    const current = profileData?.employment_status || [];
    const updated = current.includes(value)
      ? current.filter((s) => s !== value)
      : [...current, value];
    onChange({ employment_status: updated });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#0A0A0A] tracking-tight">Upload Your CV</h2>
        <p className="text-sm text-[#525252] mt-1">
          We're building a complete picture of your qualifications, experience, and career goals — so we can recommend exactly which roles you're ready for and what steps to take next.
        </p>
        <p className="text-sm text-[#A3A3A3] mt-2">
          Upload your CV and we'll extract your details automatically — no manual entry needed. PDF or DOCX preferred.
        </p>
      </div>

      <div className="bg-white border border-[#E5E5E5] rounded-lg p-5">
        <h3 className="text-sm font-semibold text-[#0A0A0A] mb-3">What's your current situation?</h3>
        <div className="space-y-3">
          {employmentOptions.map((option) => (
            <div key={option.value} className="flex items-center gap-2">
              <Checkbox
                id={option.value}
                checked={(profileData?.employment_status || []).includes(option.value)}
                onCheckedChange={() => toggleEmploymentStatus(option.value)}
              />
              <Label htmlFor={option.value} className="text-sm text-[#525252] cursor-pointer">
                {option.label}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* LinkedIn Section */}
      <div className="bg-white border border-[#E5E5E5] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <Linkedin className="w-4 h-4 text-[#0A66C2]" />
          <h3 className="text-sm font-semibold text-[#0A0A0A]">LinkedIn Profile (optional)</h3>
        </div>

        {/* One-click LinkedIn connect */}
        <div className="mb-4">
          <p className="text-xs text-[#A3A3A3] mb-2">Auto-fill your details from LinkedIn.</p>
          <Button
            disabled
            size="sm"
            className="bg-[#0A66C2] opacity-50 cursor-not-allowed text-white flex items-center gap-2"
          >
            <Linkedin className="w-3 h-3" /> Connect with LinkedIn
          </Button>
          <p className="text-xs text-[#A3A3A3] mt-1.5">Coming soon — paste your LinkedIn URL below for now.</p>
        </div>

        <div className="border-t border-[#F0F0F0] pt-4">
          <p className="text-xs text-[#A3A3A3] mb-3">Or paste your LinkedIn URL to save it to your profile.</p>
          <div className="flex gap-2">
            <Input
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/yourname"
              className="text-sm flex-1"
            />
            <Button
              onClick={handleLinkedinExtract}
              disabled={!linkedinUrl.trim() || linkedinDone}
              size="sm"
              variant="outline"
              className="whitespace-nowrap"
            >
              {linkedinDone ? <CheckCircle2 className="w-3 h-3" /> : "Save"}
            </Button>
          </div>
          {linkedinDone && <p className="text-xs text-emerald-600 mt-2">✓ LinkedIn URL saved</p>}
        </div>
      </div>

      <div
        className="bg-white rounded-xl border-2 border-dashed border-[#E5E5E5] p-10 text-center cursor-pointer hover:border-[#A3A3A3] transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.docx"
          onChange={(e) => handleFile(e.target.files[0])}
        />

        {!uploading && !extracting && !done && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#F5F5F5] flex items-center justify-center">
              <Upload className="w-5 h-5 text-[#525252]" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#0A0A0A]">Drop your CV here or click to browse</p>
              <p className="text-xs text-[#A3A3A3] mt-1">PDF or DOCX supported</p>
            </div>
          </div>
        )}

        {(uploading || extracting) && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#525252]" />
            <p className="text-sm font-medium text-[#0A0A0A]">
              {uploading ? "Uploading..." : "Extracting your details with AI..."}
            </p>
            {fileName && <p className="text-xs text-[#A3A3A3]">{fileName}</p>}
          </div>
        )}

        {done && (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            <div>
              <p className="text-sm font-semibold text-[#0A0A0A]">CV extracted successfully</p>
              <p className="text-xs text-[#A3A3A3] mt-1">{fileName}</p>
            </div>
          </div>
        )}
      </div>

      {cvTruncated && (
        <p className="text-sm text-amber-600 bg-amber-50 px-4 py-3 rounded-lg">
          Your CV is long — only the first 15,000 characters were sent for extraction. Some later experience may be missing. Please review the pre-filled details and add anything that wasn't captured.
        </p>
      )}
      {error && (
        <p className="text-sm text-amber-600 bg-amber-50 px-4 py-3 rounded-lg">{error}</p>
      )}

      <div className="flex justify-between items-center">
        <button
          onClick={onNext}
          className="text-xs text-[#A3A3A3] hover:text-[#525252] underline underline-offset-2 transition-colors"
        >
          Skip — I'll enter details manually
        </button>
        <Button
          onClick={onNext}
          disabled={!done && !error && !linkedinDone}
          className="bg-[#0A0A0A] hover:bg-[#262626] text-sm px-6 flex items-center gap-2"
        >
          {done ? (
            <>Continue <ArrowRight className="w-4 h-4" /></>
          ) : error ? (
            <>Continue Anyway <ArrowRight className="w-4 h-4" /></>
          ) : (
            "Upload to Continue"
          )}
        </Button>
      </div>
    </div>
  );
}