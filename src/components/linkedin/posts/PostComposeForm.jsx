import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, Plus, X, Sparkles } from "lucide-react";

// Per-type form. Eli's PR #32 input-field decisions:
//   - project: project_name, context, what_you_built (multi-line),
//              outcome (free-text per Eli), portfolio_link (optional)
//   - lessons: source_type, source_name, lessons[3-5] (chip-style adder)
//   - milestone: milestone_type, the_thing, people_to_thank[1+]
//                (Add another button, max 5 — encourage not require),
//                whats_next (optional)

const PROJECT_CONTEXTS = [
  { value: "course", label: "Course / class project" },
  { value: "company", label: "Company / internship work" },
  { value: "hackathon", label: "Hackathon / event" },
  { value: "personal", label: "Personal / side project" },
];

const LESSONS_SOURCES = [
  { value: "course", label: "Course / class" },
  { value: "role", label: "Role / job" },
  { value: "project", label: "Project" },
  { value: "book", label: "Book" },
  { value: "event", label: "Event / conference" },
];

const MILESTONE_TYPES = [
  { value: "internship_offer", label: "Internship offer" },
  { value: "role_start", label: "Role start (first day)" },
  { value: "certification", label: "Certification" },
  { value: "graduation", label: "Graduation" },
  { value: "other", label: "Other milestone" },
];

const PROJECT_DEFAULTS = { project_name: "", context: "company", what_you_built: "", outcome: "", portfolio_link: "" };
const LESSONS_DEFAULTS = { source_type: "role", source_name: "", lessons: ["", "", ""] };
const MILESTONE_DEFAULTS = { milestone_type: "role_start", the_thing: "", people_to_thank: [{ name: "", reason: "" }], whats_next: "" };

export function getDefaultsForType(postType) {
  if (postType === "project") return { ...PROJECT_DEFAULTS };
  if (postType === "lessons") return { ...LESSONS_DEFAULTS, lessons: ["", "", ""] };
  if (postType === "milestone") return { ...MILESTONE_DEFAULTS, people_to_thank: [{ name: "", reason: "" }] };
  return {};
}

export default function PostComposeForm({ postType, inputs, onChange, onBack, onGenerate, generating }) {
  const set = (key, value) => onChange({ ...inputs, [key]: value });

  if (postType === "project") {
    return (
      <FormShell postType={postType} onBack={onBack} onGenerate={onGenerate} generating={generating}
                 canSubmit={!!(inputs.project_name?.trim() && inputs.what_you_built?.trim() && inputs.outcome?.trim())}>
        <Field label="Project name" required>
          <Input value={inputs.project_name || ""} onChange={(e) => set("project_name", e.target.value)} placeholder="e.g. VIP onboarding redesign at Guardio" />
        </Field>
        <Field label="Where did you do it" required>
          <Select value={inputs.context || "company"} onValueChange={(v) => set("context", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROJECT_CONTEXTS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="What you built" required hint="1–2 sentences. What's the project, what's it for, what did you specifically do.">
          <textarea value={inputs.what_you_built || ""} onChange={(e) => set("what_you_built", e.target.value)}
                    placeholder="e.g. Rewrote our VIP onboarding from a 4-step manual handoff to a self-serve guided tour. Designed with our CS lead, prototyped in Notion, built with engineering."
                    rows={3} className="w-full text-sm border border-[#E5E5E5] rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#0A0A0A]" />
        </Field>
        <Field label="Specific outcome" required hint="Number, metric, what shipped, what changed. The post leads with this — make it concrete.">
          <textarea value={inputs.outcome || ""} onChange={(e) => set("outcome", e.target.value)}
                    placeholder="e.g. Cut average onboarding from 8 days to 3, and our VIP cohort hit 88% feature adoption in their first quarter."
                    rows={2} className="w-full text-sm border border-[#E5E5E5] rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#0A0A0A]" />
        </Field>
        <Field label="Portfolio / demo link" hint="Optional. Adds a 'see the work' destination at the end.">
          <Input value={inputs.portfolio_link || ""} onChange={(e) => set("portfolio_link", e.target.value)} placeholder="https://..." />
        </Field>
      </FormShell>
    );
  }

  if (postType === "lessons") {
    const lessons = Array.isArray(inputs.lessons) ? inputs.lessons : ["", "", ""];
    const setLessonAt = (i, val) => set("lessons", lessons.map((l, idx) => idx === i ? val : l));
    const addLesson = () => set("lessons", [...lessons, ""]);
    const removeLessonAt = (i) => set("lessons", lessons.filter((_, idx) => idx !== i));
    const filled = lessons.filter((l) => l.trim().length > 0).length;
    const canSubmit = filled >= 3 && filled <= 5 && !!inputs.source_name?.trim();

    return (
      <FormShell postType={postType} onBack={onBack} onGenerate={onGenerate} generating={generating} canSubmit={canSubmit}>
        <Field label="Source type" required>
          <Select value={inputs.source_type || "role"} onValueChange={(v) => set("source_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LESSONS_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Source name" required hint="e.g. 'Customer Discovery class with Prof. Lee' or 'First quarter as Customer Success Specialist'.">
          <Input value={inputs.source_name || ""} onChange={(e) => set("source_name", e.target.value)} placeholder="What did you do / where did you learn this" />
        </Field>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-1 block">
            Lessons <span className="text-red-500">*</span>
          </label>
          <p className="text-[11px] text-[#525252] mb-2">3–5 specific lessons. Each tied to a real example you lived. ≤200 chars each.</p>
          <div className="space-y-2">
            {lessons.map((l, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="text-xs font-mono text-[#A3A3A3] mt-2 w-5">{i + 1}.</span>
                <textarea
                  value={l}
                  onChange={(e) => setLessonAt(i, e.target.value.slice(0, 200))}
                  placeholder={i === 0 ? "e.g. VIP onboarding works when you watch the customer use the product, not when you ask them how it's going" : ""}
                  rows={2}
                  className="flex-1 text-sm border border-[#E5E5E5] rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#0A0A0A]"
                />
                <div className="flex flex-col items-end mt-1.5 gap-1">
                  <span className="text-[10px] text-[#A3A3A3]">{l.length}/200</span>
                  {lessons.length > 3 && (
                    <button type="button" onClick={() => removeLessonAt(i)} className="text-[#A3A3A3] hover:text-red-600">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {lessons.length < 5 && (
              <button type="button" onClick={addLesson} className="inline-flex items-center gap-1 text-xs text-[#525252] hover:text-[#0A0A0A]">
                <Plus className="w-3 h-3" />
                Add another lesson
              </button>
            )}
          </div>
          <p className="text-[10px] text-[#A3A3A3] mt-2">{filled} of 3–5 filled</p>
        </div>
      </FormShell>
    );
  }

  if (postType === "milestone") {
    const people = Array.isArray(inputs.people_to_thank) ? inputs.people_to_thank : [];
    const setPersonAt = (i, key, val) => set("people_to_thank", people.map((p, idx) => idx === i ? { ...p, [key]: val } : p));
    const addPerson = () => set("people_to_thank", [...people, { name: "", reason: "" }]);
    const removePersonAt = (i) => set("people_to_thank", people.filter((_, idx) => idx !== i));
    const canSubmit = !!inputs.the_thing?.trim();

    return (
      <FormShell postType={postType} onBack={onBack} onGenerate={onGenerate} generating={generating} canSubmit={canSubmit}>
        <Field label="Milestone type" required>
          <Select value={inputs.milestone_type || "role_start"} onValueChange={(v) => set("milestone_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MILESTONE_TYPES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="The specific thing" required hint="e.g. 'Customer Success Specialist offer at Guardio' or 'Bachelor's in Business Administration from Reichman'. Specific beats generic.">
          <Input value={inputs.the_thing || ""} onChange={(e) => set("the_thing", e.target.value)} placeholder="What just happened" />
        </Field>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-1 block">
            People to thank
          </label>
          <p className="text-[11px] text-[#525252] mb-2">
            Encouraged but not required. Real names, real specific reasons — research shows specific gratitude beats generic "thanks to everyone who supported me".
          </p>
          <div className="space-y-2">
            {people.map((p, i) => (
              <div key={i} className="flex gap-2 items-start">
                <Input
                  value={p.name}
                  onChange={(e) => setPersonAt(i, "name", e.target.value)}
                  placeholder="Name"
                  className="w-[35%]"
                />
                <Input
                  value={p.reason}
                  onChange={(e) => setPersonAt(i, "reason", e.target.value)}
                  placeholder="Specific reason (e.g. 'for the mock-interview prep')"
                  className="flex-1"
                />
                {people.length > 1 && (
                  <button type="button" onClick={() => removePersonAt(i)} className="text-[#A3A3A3] hover:text-red-600 mt-2.5">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            {people.length < 5 && (
              <button type="button" onClick={addPerson} className="inline-flex items-center gap-1 text-xs text-[#525252] hover:text-[#0A0A0A]">
                <Plus className="w-3 h-3" />
                Add another person
              </button>
            )}
          </div>
        </div>
        <Field label="What's next" hint="Optional 1-sentence forward-look. Specific beats 'excited to dive in' — say what you'll actually be doing.">
          <Input value={inputs.whats_next || ""} onChange={(e) => set("whats_next", e.target.value)}
                 placeholder="e.g. First two weeks I'm shadowing the renewal cohort" />
        </Field>
      </FormShell>
    );
  }

  return null;
}

function FormShell({ children, onBack, onGenerate, generating, canSubmit }) {
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-[#525252] hover:text-[#0A0A0A]">
        <ArrowLeft className="w-3 h-3" />
        Back to post types
      </button>
      <div className="bg-white border border-[#E5E5E5] rounded-xl p-5 space-y-4">
        {children}
      </div>
      <div className="flex justify-end">
        <Button
          onClick={onGenerate}
          disabled={!canSubmit || generating}
          className="bg-[#0A0A0A] hover:bg-[#262626] text-sm"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
          ) : (
            <><Sparkles className="w-4 h-4 mr-2" />Generate post</>
          )}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-1 block">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {hint && <p className="text-[11px] text-[#525252] mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}
