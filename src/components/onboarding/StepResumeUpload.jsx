import React, { useState, useRef } from "react";
// base44 removed — File uploads and LLM extraction will use Supabase Storage + Edge Functions in Phase 5
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
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [linkedinUrl, setLinkedinUrl] = useState(profileData?.linkedin_url || "");
  const [extractingLinkedin, setExtractingLinkedin] = useState(false);
  const [linkedinDone, setLinkedinDone] = useState(false);
  const [connectingLinkedin, setConnectingLinkedin] = useState(false);
  const [linkedinConnected, setLinkedinConnected] = useState(false);
  const inputRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setUploading(true);

    // TODO: Phase 5 — Upload file to Supabase Storage, then extract via Edge Function / LLM
    // For now, stub the extraction with a placeholder
    setUploading(false);
    setExtracting(true);

    // Simulate extraction delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setExtracting(false);
    setError("Resume extraction requires AI Edge Functions (Phase 5). Please enter details manually for now, or skip this step.");
  };

  const handleLinkedinConnect = async () => {
    setConnectingLinkedin(true);
    // TODO: Phase 5 — LinkedIn connect via Edge Function
    await new Promise((resolve) => setTimeout(resolve, 500));
    setConnectingLinkedin(false);
    setError("LinkedIn connect requires Edge Functions (Phase 5). Please enter your LinkedIn URL manually below.");
  };

  const handleLinkedinExtract = async () => {
    if (!linkedinUrl.trim()) return;
    setExtractingLinkedin(true);
    onChange({ linkedin_url: linkedinUrl });
    // TODO: Phase 5 — LinkedIn extraction via Edge Function / LLM
    await new Promise((resolve) => setTimeout(resolve, 500));
    setExtractingLinkedin(false);
    // Save the URL even though we can't extract yet
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
          <p className="text-xs text-[#A3A3A3] mb-2">Auto-fill your name instantly from your connected LinkedIn account.</p>
          <Button
            onClick={handleLinkedinConnect}
            disabled={connectingLinkedin || linkedinConnected}
            size="sm"
            className="bg-[#0A66C2] hover:bg-[#004182] text-white flex items-center gap-2"
          >
            {connectingLinkedin ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Connecting...</>
            ) : linkedinConnected ? (
              <><CheckCircle2 className="w-3 h-3" /> Connected</>
            ) : (
              <><Linkedin className="w-3 h-3" /> Connect with LinkedIn</>
            )}
          </Button>
          {linkedinConnected && <p className="text-xs text-emerald-600 mt-2">✓ Name imported from LinkedIn</p>}
        </div>

        <div className="border-t border-[#F0F0F0] pt-4">
          <p className="text-xs text-[#A3A3A3] mb-3">Or paste your LinkedIn URL to extract skills & experience via AI.</p>
          <div className="flex gap-2">
            <Input
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/yourname"
              className="text-sm flex-1"
            />
            <Button
              onClick={handleLinkedinExtract}
              disabled={!linkedinUrl.trim() || extractingLinkedin || linkedinDone}
              size="sm"
              variant="outline"
              className="whitespace-nowrap"
            >
              {extractingLinkedin ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Extracting…</> : linkedinDone ? <CheckCircle2 className="w-3 h-3" /> : "Extract"}
            </Button>
          </div>
          {extractingLinkedin && (
            <p className="text-xs text-[#A3A3A3] mt-2">This uses AI + web search and takes ~15–30 seconds…</p>
          )}
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
          accept=".pdf,.doc,.docx"
          onChange={(e) => handleFile(e.target.files[0])}
        />

        {!uploading && !extracting && !done && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#F5F5F5] flex items-center justify-center">
              <Upload className="w-5 h-5 text-[#525252]" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#0A0A0A]">Drop your CV here or click to browse</p>
              <p className="text-xs text-[#A3A3A3] mt-1">PDF, DOC, DOCX supported</p>
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
          ) : (
            "Upload to Continue"
          )}
        </Button>
      </div>
    </div>
  );
}