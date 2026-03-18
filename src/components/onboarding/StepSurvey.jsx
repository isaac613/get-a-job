import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

const CHALLENGES = [
  "I don't know which roles to target",
  "I apply but get no responses",
  "I get interviews but no offers",
  "I don't know how to network effectively",
  "My CV doesn't stand out",
  "I don't know how to negotiate salary",
  "I'm not sure if my skills are relevant",
];

const CV_OPTIONS = [
  { value: "always", label: "Yes, I tailor it for most applications" },
  { value: "sometimes", label: "Sometimes, for roles I really want" },
  { value: "rarely", label: "Rarely — I mostly use one version" },
  { value: "never", label: "Never — I use the same CV for everything" },
];

const LINKEDIN_OPTIONS = [
  { value: "often", label: "Yes, often — I message recruiters or employees regularly" },
  { value: "sometimes", label: "Sometimes — I've tried it a few times" },
  { value: "rarely", label: "Rarely — I find it awkward" },
  { value: "never", label: "Never — I haven't tried" },
];

const CLARITY_OPTIONS = [
  { value: 1, label: "1 — No idea" },
  { value: 2, label: "2 — Vague idea" },
  { value: 3, label: "3 — Some clarity" },
  { value: 4, label: "4 — Fairly clear" },
  { value: 5, label: "5 — Very clear" },
];

export default function StepSurvey({ data, onChange, onNext, onBack }) {
  const [customChallenge, setCustomChallenge] = useState("");
  const [customCVStrategy, setCustomCVStrategy] = useState("");
  const [customLinkedInStrategy, setCustomLinkedInStrategy] = useState("");
  const [customClarityScore, setCustomClarityScore] = useState("");

  const set = (key, val) => onChange({ ...data, [key]: val });

  const toggleChallenge = (challenge) => {
    const current = data.biggest_challenge || [];
    const updated = current.includes(challenge)
      ? current.filter((c) => c !== challenge)
      : [...current, challenge];
    set("biggest_challenge", updated);
  };

  const addCustomChallenge = () => {
    if (customChallenge.trim()) {
      const current = data.biggest_challenge || [];
      if (!current.includes(customChallenge.trim())) {
        set("biggest_challenge", [...current, customChallenge.trim()]);
      }
      setCustomChallenge("");
    }
  };

  const addCustomCVStrategy = () => {
    if (customCVStrategy.trim()) {
      set("cv_tailoring_strategy", customCVStrategy.trim());
      setCustomCVStrategy("");
    }
  };

  const addCustomLinkedInStrategy = () => {
    if (customLinkedInStrategy.trim()) {
      set("linkedin_outreach_strategy", customLinkedInStrategy.trim());
      setCustomLinkedInStrategy("");
    }
  };

  const addCustomClarityScore = () => {
    if (customClarityScore.trim()) {
      set("role_clarity_score", customClarityScore.trim());
      setCustomClarityScore("");
    }
  };

  const canProceed = data.biggest_challenge?.length > 0 && data.cv_tailoring_strategy && data.linkedin_outreach_strategy && data.role_clarity_score;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#0A0A0A] tracking-tight">Job Search Reality Check</h2>
        <p className="text-sm text-[#525252] mt-1">
          Your answers help us understand where you actually are — not where you want to be. Be honest.
        </p>
      </div>

      <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-4 py-3 text-sm text-[#92400E]">
        💡 The options below are <strong>suggestions only</strong> — you can click to select them or type your own answer in the field below each question.
      </div>

      <div className="bg-white rounded-xl border border-[#E5E5E5] p-6 space-y-6">

        {/* Biggest challenge */}
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-2">
            What are your biggest job search challenges right now? (Select all that apply) <span className="text-red-400">*</span>
          </label>
          <div className="grid grid-cols-1 gap-2">
            {CHALLENGES.map((c) => {
              const isSelected = (data.biggest_challenge || []).includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleChallenge(c)}
                  className={`text-left text-sm px-4 py-3 rounded-lg border transition-colors ${
                    isSelected
                      ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                      : "bg-white text-[#525252] border-[#E5E5E5] hover:border-[#A3A3A3]"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <div className="mt-2">
            <Input
              value={customChallenge}
              onChange={(e) => setCustomChallenge(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomChallenge()}
              placeholder="Or type your own challenge and press Enter"
              className="text-sm"
            />
          </div>
        </div>

        {/* CV tailoring */}
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-2">
            Do you tailor your CV for each application? <span className="text-red-400">*</span>
          </label>
          <div className="space-y-2">
            {CV_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => set("cv_tailoring_strategy", o.value)}
                className={`w-full text-left text-sm px-4 py-3 rounded-lg border transition-colors ${
                  data.cv_tailoring_strategy === o.value
                    ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                    : "bg-white text-[#525252] border-[#E5E5E5] hover:border-[#A3A3A3]"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="mt-2">
            <Input
              value={customCVStrategy}
              onChange={(e) => setCustomCVStrategy(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomCVStrategy()}
              placeholder="Or type your own answer and press Enter"
              className="text-sm"
            />
          </div>
        </div>

        {/* LinkedIn outreach */}
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-2">
            Have you messaged people on LinkedIn as part of your job search? <span className="text-red-400">*</span>
          </label>
          <div className="space-y-2">
            {LINKEDIN_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => set("linkedin_outreach_strategy", o.value)}
                className={`w-full text-left text-sm px-4 py-3 rounded-lg border transition-colors ${
                  data.linkedin_outreach_strategy === o.value
                    ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                    : "bg-white text-[#525252] border-[#E5E5E5] hover:border-[#A3A3A3]"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="mt-2">
            <Input
              value={customLinkedInStrategy}
              onChange={(e) => setCustomLinkedInStrategy(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomLinkedInStrategy()}
              placeholder="Or type your own answer and press Enter"
              className="text-sm"
            />
          </div>
        </div>

        {/* Role clarity score */}
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-2">
            How clear are you about which specific roles you're targeting? <span className="text-red-400">*</span>
          </label>
          <div className="flex gap-2 flex-wrap">
            {CLARITY_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => set("role_clarity_score", o.value)}
                className={`text-sm px-4 py-2 rounded-lg border transition-colors ${
                  data.role_clarity_score === o.value
                    ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                    : "bg-white text-[#525252] border-[#E5E5E5] hover:border-[#A3A3A3]"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="mt-2">
            <Input
              value={customClarityScore}
              onChange={(e) => setCustomClarityScore(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomClarityScore()}
              placeholder="Or type your own answer and press Enter"
              className="text-sm"
            />
          </div>
        </div>

        {/* What have you tried */}
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-2">
            What have you already tried to improve your job search? (optional)
          </label>
          <Textarea
            value={data.job_search_efforts || ""}
            onChange={(e) => set("job_search_efforts", e.target.value)}
            placeholder="e.g. Applied to 50+ roles, attended career fairs, updated my LinkedIn..."
            className="text-sm min-h-[80px]"
          />
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} className="text-sm">Back</Button>
        <Button onClick={onNext} disabled={!canProceed} className="bg-[#0A0A0A] hover:bg-[#262626] text-sm px-6">
          Continue
        </Button>
      </div>
    </div>
  );
}