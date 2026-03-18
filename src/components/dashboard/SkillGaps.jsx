import React from "react";
import { AlertTriangle } from "lucide-react";

export default function SkillGaps({ gaps }) {
  if (!gaps || gaps.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E5E5E5] p-6">
        <h3 className="text-xs uppercase tracking-wider text-[#A3A3A3] font-medium mb-3">
          Identified Skill Gaps
        </h3>
        <p className="text-sm text-[#A3A3A3]">No skill gaps identified yet. Add your information and use the AI Agent to analyze your profile.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] p-6">
      <h3 className="text-xs uppercase tracking-wider text-[#A3A3A3] font-medium mb-4">
        Identified Skill Gaps
      </h3>
      <div className="space-y-2">
        {gaps.map((gap, i) => (
          <div key={i} className="flex items-center gap-2.5 py-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] flex-shrink-0" />
            <span className="text-sm text-[#525252]">{gap}</span>
          </div>
        ))}
      </div>
    </div>
  );
}