import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, X, Wrench, Briefcase, Code, BarChart2, MessageSquare, Users } from "lucide-react";

// Curated chip bank — 6 visual sections × 12 skills. The categories here are
// PURELY VISUAL — they exist to help users browse and discover skills they
// might forget to add. Every selected chip lands in a single flat
// `profileData.skills` array. There are no separate category arrays in state
// or DB anymore (Bug 3 fix).
const SKILL_BANK = [
  {
    key: "tools",
    label: "Tools & Software",
    icon: Wrench,
    color: "text-blue-600",
    bg: "bg-blue-50",
    chips: [
      "Excel", "Google Sheets", "PowerPoint", "Notion",
      "Salesforce", "HubSpot", "Slack", "Zendesk",
      "Figma", "Jira", "Asana", "Airtable",
    ],
  },
  {
    key: "domain",
    label: "Domain Knowledge",
    icon: Briefcase,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    chips: [
      "Customer Success", "Project Management", "Product Management", "Account Management",
      "Marketing Strategy", "Sales Operations", "Financial Modeling", "Market Research",
      "UX Research", "HR Operations", "Supply Chain", "Contract Negotiation",
    ],
  },
  {
    key: "technical",
    label: "Technical & Engineering",
    icon: Code,
    color: "text-violet-600",
    bg: "bg-violet-50",
    chips: [
      "Python", "JavaScript", "TypeScript", "SQL",
      "React", "Node.js", "REST APIs", "GraphQL",
      "Git", "Docker", "AWS", "Machine Learning",
    ],
  },
  {
    key: "analytical",
    label: "Analytical & Quantitative",
    icon: BarChart2,
    color: "text-amber-600",
    bg: "bg-amber-50",
    chips: [
      "Data Analysis", "A/B Testing", "Forecasting", "KPI Reporting",
      "Cohort Analysis", "Statistics", "Business Intelligence", "Tableau",
      "Power BI", "Looker", "Excel Modeling", "Dashboard Design",
    ],
  },
  {
    key: "communication",
    label: "Communication",
    icon: MessageSquare,
    color: "text-pink-600",
    bg: "bg-pink-50",
    chips: [
      "Presentations", "Public Speaking", "Technical Writing", "Copywriting",
      "Stakeholder Updates", "Email Outreach", "Storytelling", "Documentation",
      "Cross-Cultural Communication", "Pitching", "Negotiation", "Active Listening",
    ],
  },
  {
    key: "leadership",
    label: "Leadership & People",
    icon: Users,
    color: "text-orange-600",
    bg: "bg-orange-50",
    chips: [
      "Mentoring", "Coaching", "Team Coordination", "Stakeholder Management",
      "Hiring", "Onboarding Others", "Delegation", "Conflict Resolution",
      "Performance Reviews", "Cross-functional Collaboration", "1:1 Management", "Vision Setting",
    ],
  },
];

// Case-insensitive match for selection state — handles "python" vs "Python".
const matches = (arr, label) => arr.some((s) => s.toLowerCase() === label.toLowerCase());

export default function StepSkills({ data, onChange, onNext, onBack }) {
  const skills = Array.isArray(data.skills) ? data.skills : [];
  const [input, setInput] = useState("");

  const setSkills = (next) => onChange({ ...data, skills: next });

  const toggleSkill = (label) => {
    if (matches(skills, label)) {
      setSkills(skills.filter((s) => s.toLowerCase() !== label.toLowerCase()));
    } else {
      setSkills([...skills, label]);
    }
  };

  const addCustom = () => {
    const v = input.trim();
    if (!v) return;
    if (!matches(skills, v)) setSkills([...skills, v]);
    setInput("");
  };

  // Custom skills the user typed that aren't in the bank — surfaced in the
  // "Selected" pill list so they're visible even when no chip section
  // contains them.
  const allBankLabels = new Set(SKILL_BANK.flatMap((s) => s.chips.map((c) => c.toLowerCase())));
  const customSkills = skills.filter((s) => !allBankLabels.has(s.toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#0A0A0A] tracking-tight">Your Skills</h2>
        <p className="text-sm text-[#525252] mt-1">
          Tap any skill to add it. Selected skills stay highlighted so you can keep browsing.
          Type below for anything not in the suggestions.
        </p>
        <p className="text-xs text-[#A3A3A3] mt-1">
          Only add skills you can actually demonstrate in an interview.
        </p>
      </div>

      {/* Free-text input + selected count */}
      <div className="bg-white rounded-xl border border-[#E5E5E5] p-5 space-y-3">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Type a skill not in the suggestions and press Enter"
            className="text-sm"
          />
          <Button variant="outline" size="sm" onClick={addCustom} disabled={!input.trim()} className="text-xs px-4">
            Add
          </Button>
        </div>

        {skills.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-2">
              Selected ({skills.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 text-xs bg-[#0A0A0A] text-white px-2.5 py-1 rounded-md"
                >
                  {skill}
                  {customSkills.includes(skill) && (
                    <span className="text-[9px] uppercase tracking-wider text-[#A3A3A3] ml-0.5">custom</span>
                  )}
                  <button onClick={() => toggleSkill(skill)} className="hover:text-red-300" aria-label={`Remove ${skill}`}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chip bank — six visual sections */}
      <div className="space-y-4">
        {SKILL_BANK.map((section) => {
          const Icon = section.icon;
          const sectionSelectedCount = section.chips.filter((c) => matches(skills, c)).length;
          return (
            <div key={section.key} className="bg-white rounded-xl border border-[#E5E5E5] p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-8 h-8 rounded-lg ${section.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4 h-4 ${section.color}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#0A0A0A]">{section.label}</p>
                  {sectionSelectedCount > 0 && (
                    <p className="text-[11px] text-[#A3A3A3]">{sectionSelectedCount} selected</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {section.chips.map((chip) => {
                  const selected = matches(skills, chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => toggleSkill(chip)}
                      className={
                        selected
                          ? "inline-flex items-center gap-1 text-xs bg-[#0A0A0A] text-white px-2.5 py-1 rounded-md border border-[#0A0A0A] hover:bg-[#262626] transition-colors"
                          : "inline-flex items-center gap-1 text-xs bg-white text-[#525252] px-2.5 py-1 rounded-md border border-[#D4D4D4] hover:border-[#A3A3A3] hover:bg-[#FAFAFA] transition-colors"
                      }
                    >
                      {selected && <Check className="w-3 h-3" />}
                      {chip}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={onBack} className="text-sm">Back</Button>
        <div className="flex items-center gap-4">
          <span className="text-xs text-[#A3A3A3]">{skills.length} skill{skills.length !== 1 ? "s" : ""} added</span>
          <Button onClick={onNext} className="bg-[#0A0A0A] hover:bg-[#262626] text-sm px-6">
            Continue to Career Direction
          </Button>
        </div>
      </div>
    </div>
  );
}
