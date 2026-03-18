import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import SkillTagInput from "./SkillTagInput";

export default function StepCareerDirection({ data, onChange, onNext, onBack }) {
  const set = (key, val) => onChange({ ...data, [key]: val });

  const canProceed = data.five_year_role?.trim();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#0A0A0A] tracking-tight">Career Direction</h2>
        <p className="text-sm text-[#525252] mt-1">
          Your answers here define the aspiration vector. The system will separate what you qualify for now from what you're aiming for.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-[#E5E5E5] p-6 space-y-5">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-1">
            Where do you want to be in 5 years? <span className="text-red-400">*</span>
          </label>
          <Input
            value={data.five_year_role || ""}
            onChange={(e) => set("five_year_role", e.target.value)}
            placeholder="e.g. Senior Product Manager at a fintech company"
          />
        </div>

        <SkillTagInput
          label="Job Titles That Interest You Now"
          description="Roles you are considering applying to in the next 3–6 months."
          tags={data.target_job_titles || []}
          onChange={(v) => set("target_job_titles", v)}
          placeholder="e.g. Data Analyst, Marketing Coordinator"
          suggestionType="job_titles"
        />

        <SkillTagInput
          label="Target Industries"
          description="Sectors or industries you want to work in."
          tags={data.target_industries || []}
          onChange={(v) => set("target_industries", v)}
          placeholder="e.g. Fintech, Healthcare, Consulting"
          suggestionType="industries"
        />

        <SkillTagInput
          label="Preferred Work Environment"
          description="Select all environments you're open to working in."
          tags={data.work_environment || []}
          onChange={(v) => set("work_environment", v)}
          placeholder="e.g. Startup, Corporate"
          suggestionType="work_environment"
        />

        <div className="space-y-3 pt-1">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={data.open_to_lateral || false}
              onChange={(e) => set("open_to_lateral", e.target.checked)}
              className="rounded"
            />
            <div>
              <p className="text-sm text-[#0A0A0A] font-medium">Open to lateral roles</p>
              <p className="text-xs text-[#A3A3A3]">Roles at the same level in a different function or industry</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={data.open_to_outside_degree || false}
              onChange={(e) => set("open_to_outside_degree", e.target.checked)}
              className="rounded"
            />
            <div>
              <p className="text-sm text-[#0A0A0A] font-medium">Open to roles outside my degree field</p>
              <p className="text-xs text-[#A3A3A3]">E.g. a Finance major applying to Operations or Product roles</p>
            </div>
          </label>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} className="text-sm">Back</Button>
        <Button onClick={onNext} disabled={!canProceed} className="bg-[#0A0A0A] hover:bg-[#262626] text-sm px-6">
          Continue to Constraints
        </Button>
      </div>
    </div>
  );
}