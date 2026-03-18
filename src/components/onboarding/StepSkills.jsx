import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import SkillTagInput from "./SkillTagInput";
import { Wrench, BarChart2, MessageSquare, Users, Code, Briefcase } from "lucide-react";

const SKILL_CATEGORIES = [
  {
    key: "tools_software",
    label: "Tools & Software",
    icon: Wrench,
    color: "text-blue-600",
    bg: "bg-blue-50",
    description: "Apps, platforms, and tools you can use confidently right now.",
    placeholder: "e.g. Excel, Figma, Salesforce, Python, Notion",
    examples: ["Excel", "Figma", "HubSpot", "SQL", "Tableau", "Python"],
  },
  {
    key: "hard_skills",
    label: "Domain Knowledge",
    icon: Briefcase,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    description: "Subject-matter expertise specific to your field — what you know, not just what tools you use.",
    placeholder: "e.g. Financial modeling, Market research, Contract law, UX research",
    examples: ["Financial modeling", "Market research", "Contract law", "Supply chain", "SEO"],
  },
  {
    key: "technical_skills",
    label: "Technical / Engineering Skills",
    icon: Code,
    color: "text-violet-600",
    bg: "bg-violet-50",
    description: "Only fill this if you work in tech, engineering, or data. Leave blank if not applicable.",
    placeholder: "e.g. Machine learning, React, API design, Cloud architecture",
    examples: ["Machine learning", "React", "API design", "Docker", "System design"],
  },
  {
    key: "analytical_skills",
    label: "Analytical Skills",
    icon: BarChart2,
    color: "text-amber-600",
    bg: "bg-amber-50",
    description: "How you work with data, solve problems, and draw conclusions.",
    placeholder: "e.g. Data analysis, A/B testing, Root cause analysis, Forecasting",
    examples: ["Data analysis", "A/B testing", "Forecasting", "Business intelligence", "Reporting"],
  },
  {
    key: "communication_skills",
    label: "Communication Skills",
    icon: MessageSquare,
    color: "text-pink-600",
    bg: "bg-pink-50",
    description: "How you convey ideas — written, verbal, or visual.",
    placeholder: "e.g. Stakeholder presentations, Technical writing, Public speaking",
    examples: ["Presentations", "Technical writing", "Public speaking", "Copywriting", "Report writing"],
  },
  {
    key: "leadership_skills",
    label: "Leadership & Collaboration",
    icon: Users,
    color: "text-orange-600",
    bg: "bg-orange-50",
    description: "How you work with and lead others — even without a management title.",
    placeholder: "e.g. Cross-functional collaboration, Mentoring, Project coordination",
    examples: ["Project management", "Team coordination", "Mentoring", "Stakeholder management"],
  },
];

export default function StepSkills({ data, onChange, onNext, onBack }) {
  const [expanded, setExpanded] = useState(new Set(["tools_software", "hard_skills"]));

  const set = (key, val) => onChange({ ...data, [key]: val });

  const toggleExpand = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const totalSkills = SKILL_CATEGORIES.reduce(
    (sum, c) => sum + (data[c.key]?.length || 0),
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#0A0A0A] tracking-tight">Your Skills</h2>
        <p className="text-sm text-[#525252] mt-1">
          Only add skills you can actually demonstrate in an interview. Be specific — vague entries reduce your match accuracy.
        </p>
        <p className="text-xs text-[#A3A3A3] mt-1">
          Type a skill and press Enter, or click a suggestion. You don't need to fill every section.
        </p>
      </div>

      <div className="space-y-3">
        {SKILL_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isOpen = expanded.has(cat.key);
          const count = data[cat.key]?.length || 0;
          return (
            <div key={cat.key} className="bg-white rounded-xl border border-[#E5E5E5] overflow-hidden">
              <button
                type="button"
                onClick={() => toggleExpand(cat.key)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-[#FAFAFA] transition-colors"
              >
                <div className={`w-8 h-8 rounded-lg ${cat.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4 h-4 ${cat.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#0A0A0A]">{cat.label}</span>
                    {count > 0 && (
                      <span className="text-xs bg-[#F0F0F0] text-[#525252] px-1.5 py-0.5 rounded-full">
                        {count}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#A3A3A3] mt-0.5 truncate">{cat.description}</p>
                </div>
                <span className="text-[#A3A3A3] text-xs ml-2">{isOpen ? "▲" : "▼"}</span>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 border-t border-[#F5F5F5]">
                  <div className="pt-4">
                    <SkillTagInput
                      tags={data[cat.key] || []}
                      onChange={(v) => set(cat.key, v)}
                      placeholder={cat.placeholder}
                    />
                    {data[cat.key]?.length === 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-[#A3A3A3] mb-2">Quick add:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {cat.examples.map((ex) => (
                            <button
                              key={ex}
                              type="button"
                              onClick={() => set(cat.key, [...(data[cat.key] || []), ex])}
                              className="text-xs px-2.5 py-1 rounded-full border border-dashed border-[#D4D4D4] text-[#737373] hover:border-[#0A0A0A] hover:text-[#0A0A0A] transition-colors"
                            >
                              + {ex}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={onBack} className="text-sm">Back</Button>
        <div className="flex items-center gap-4">
          <span className="text-xs text-[#A3A3A3]">{totalSkills} skill{totalSkills !== 1 ? "s" : ""} added</span>
          <Button onClick={onNext} className="bg-[#0A0A0A] hover:bg-[#262626] text-sm px-6">
            Continue to Career Direction
          </Button>
        </div>
      </div>
    </div>
  );
}