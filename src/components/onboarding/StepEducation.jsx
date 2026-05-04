import React from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import SkillTagInput from "./SkillTagInput";

// CV generator + extractor agreed on this proficiency vocabulary; matches the
// values written by N-O22→26's resume extraction and consumed by
// generate-tailored-cv when it builds the Languages section.
const LANGUAGE_PROFICIENCIES = ["Native", "Fluent", "Professional", "Conversational", "Basic"];

export default function StepEducation({ data, onChange, onNext, onBack }) {
  const set = (key, val) => onChange({ ...data, [key]: val });

  // Languages live in profiles.languages as jsonb [{language, proficiency}].
  // Empty entries get filtered on autosave-cleanup naturally because the
  // user-deleted slot is removed from the array entirely on remove().
  const languages = Array.isArray(data.languages) ? data.languages : [];
  const addLanguage = () => set("languages", [...languages, { language: "", proficiency: "" }]);
  const updateLanguage = (idx, key, val) => {
    const next = languages.slice();
    next[idx] = { ...next[idx], [key]: val };
    set("languages", next);
  };
  const removeLanguage = (idx) => set("languages", languages.filter((_, i) => i !== idx));

  // Secondary education is a single jsonb object (NOT an array) per the CV
  // generator's contract. null = "user has no pre-university entry"; the
  // renderer skips the section cleanly. Initialise lazily so we don't
  // overwrite a null DB value with an empty object on first edit.
  const sec = data.secondary_education || null;
  const setSec = (key, val) => {
    const base = sec || { institution: "", location: "", dates: "", highlights: [] };
    const next = { ...base, [key]: val };
    // Collapse back to null when every field is empty — keeps the DB tidy
    // and prevents auto-save from writing {institution:"", location:"", ...}
    // when the user clicked "Add" then changed their mind.
    const empty = !next.institution?.trim() && !next.location?.trim()
      && !next.dates?.trim() && (!Array.isArray(next.highlights) || next.highlights.length === 0);
    set("secondary_education", empty ? null : next);
  };

  const canProceed = data.full_name?.trim() && data.education_level;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#0A0A0A] tracking-tight">Education</h2>
        <p className="text-sm text-[#525252] mt-1">
          This information maps your knowledge domains to job role requirements.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-[#E5E5E5] p-6 space-y-5">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-1">
            Full Name
          </label>
          <Input
            value={data.full_name || ""}
            onChange={(e) => set("full_name", e.target.value)}
            placeholder="Your full name"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-1">
              Education Level
            </label>
            <Select value={data.education_level || ""} onValueChange={(v) => set("education_level", v)}>
              <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="high_school">High School</SelectItem>
                <SelectItem value="associate">Associate Degree</SelectItem>
                <SelectItem value="bachelors">Bachelor's Degree</SelectItem>
                <SelectItem value="masters">Master's Degree</SelectItem>
                <SelectItem value="phd">PhD</SelectItem>
                <SelectItem value="bootcamp">Bootcamp</SelectItem>
                <SelectItem value="self_taught">Self-Taught</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-1">
              Degree
            </label>
            <Input
              value={data.degree || ""}
              onChange={(e) => set("degree", e.target.value)}
              placeholder="e.g. BSc, BA, MBA"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-1">
              Field of Study / Specialization
            </label>
            <Input
              value={data.field_of_study || ""}
              onChange={(e) => set("field_of_study", e.target.value)}
              placeholder="e.g. Computer Science, Business Administration"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-1">
              GPA (optional)
            </label>
            <Input
              value={data.gpa || ""}
              onChange={(e) => set("gpa", e.target.value)}
              placeholder="e.g. 3.7 / 4.0"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-1">
              Education Dates (optional)
            </label>
            <Input
              value={data.education_dates || ""}
              onChange={(e) => set("education_dates", e.target.value)}
              placeholder="e.g. Sep 2022 — Present, or Sep 2020 — Jun 2024"
            />
          </div>
        </div>

        <SkillTagInput
          label="Relevant Coursework"
          description="List courses that are relevant to your target roles."
          tags={data.relevant_coursework || []}
          onChange={(v) => set("relevant_coursework", v)}
          placeholder="e.g. Data Structures, Financial Accounting"
        />

        <SkillTagInput
          label="Honors & Awards (optional)"
          description="Dean's List, scholarships, academic distinctions."
          tags={data.honors || []}
          onChange={(v) => set("honors", v)}
          placeholder="e.g. Dean's List, Heseg Scholarship"
        />

        <SkillTagInput
          label="Academic Projects"
          description="Thesis, capstone, or notable academic projects."
          tags={data.academic_projects || []}
          onChange={(v) => set("academic_projects", v)}
          placeholder="e.g. Sales Forecasting ML Model"
        />

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-1">
            Languages (optional)
          </label>
          <p className="text-xs text-[#A3A3A3] mb-2">
            Spoken/written languages with proficiency. Used by the CV generator's Languages section.
          </p>
          {languages.length > 0 && (
            <div className="space-y-2 mb-2">
              {languages.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={l.language || ""}
                    onChange={(e) => updateLanguage(i, "language", e.target.value)}
                    placeholder="Language (e.g. Hebrew)"
                    className="flex-1 text-sm"
                  />
                  <Select
                    value={l.proficiency || ""}
                    onValueChange={(v) => updateLanguage(i, "proficiency", v)}
                  >
                    <SelectTrigger className="w-44 text-sm"><SelectValue placeholder="Proficiency" /></SelectTrigger>
                    <SelectContent>
                      {LANGUAGE_PROFICIENCIES.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={() => removeLanguage(i)}
                    className="px-2 text-[#A3A3A3] hover:text-red-500 transition-colors"
                    aria-label="Remove language"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={addLanguage}
            className="px-3 py-2 text-xs font-medium border border-[#E5E5E5] rounded-lg hover:bg-[#F5F5F5] transition-colors"
          >
            + Add language
          </button>
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-1">
            Secondary / High-School Education (optional)
          </label>
          <p className="text-xs text-[#A3A3A3] mb-3">
            For CVs that include pre-university education. Leave blank to omit from the generated CV.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <Input
              value={sec?.institution || ""}
              onChange={(e) => setSec("institution", e.target.value)}
              placeholder="School name"
              className="text-sm"
            />
            <Input
              value={sec?.location || ""}
              onChange={(e) => setSec("location", e.target.value)}
              placeholder="Location (e.g. Tel Aviv)"
              className="text-sm"
            />
            <Input
              value={sec?.dates || ""}
              onChange={(e) => setSec("dates", e.target.value)}
              placeholder="Dates (e.g. 2017 — 2020)"
              className="text-sm md:col-span-2"
            />
          </div>
          <SkillTagInput
            label=""
            description="Highlights (academic achievements, leadership, awards)."
            tags={Array.isArray(sec?.highlights) ? sec.highlights : []}
            onChange={(v) => setSec("highlights", v)}
            placeholder="e.g. Class president, Excellence in Mathematics"
          />
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} className="text-sm">Back</Button>
        <Button
          onClick={onNext}
          disabled={!canProceed}
          className="bg-[#0A0A0A] hover:bg-[#262626] text-sm px-6"
        >
          Continue to Experience
        </Button>
      </div>
    </div>
  );
}