import React, { useState } from "react";
import { ChevronDown, ChevronUp, Check, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const tierConfig = {
  tier_1: { label: "Tier 1", className: "tier-badge-1", border: "border-l-emerald-500" },
  tier_2: { label: "Tier 2", className: "tier-badge-2", border: "border-l-amber-400" },
  tier_3: { label: "Tier 3", className: "tier-badge-3", border: "border-l-indigo-400" },
};

const readinessConfig = {
  "Ready Now": { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  "Nearly Ready": { bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-400" },
  "Needs Work": { bg: "bg-red-100", text: "text-red-600", dot: "bg-red-400" },
};

export default function RoleCard({ role, onTrack }) {
  const [expanded, setExpanded] = useState(false);
  const tier = tierConfig[role.tier] || tierConfig.tier_1;

  const readiness = readinessConfig[role.readiness_status];

  return (
    <div className={cn("bg-white rounded-xl border border-[#E5E5E5] border-l-4 overflow-hidden transition-all duration-200 hover:border-[#D4D4D4] hover:shadow-sm", tier.border)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider", tier.className)}>
            {tier.label}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0A0A0A] truncate">{role.title}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {role.match_percentage != null && (
                <span className="text-xs text-[#A3A3A3]">{role.match_percentage}% match</span>
              )}
              {readiness && (
                <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full", readiness.bg, readiness.text)}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", readiness.dot)} />
                  {role.readiness_status}
                </span>
              )}
            </div>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-[#A3A3A3] flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#A3A3A3] flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-[#F0F0F0] pt-4 space-y-4">
          {role.reasoning && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-1.5">Reasoning</p>
              <p className="text-sm text-[#525252] leading-relaxed">{role.reasoning}</p>
            </div>
          )}

          {role.alignment_to_goal && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-1.5">Goal Alignment</p>
              <p className="text-sm text-[#525252] leading-relaxed">{role.alignment_to_goal}</p>
            </div>
          )}

          {role.matched_skills?.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-2">Matched Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {role.matched_skills.map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md border border-emerald-100">
                    <Check className="w-3 h-3" />{s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {role.missing_skills?.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-2">Missing Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {role.missing_skills.map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 px-2 py-1 rounded-md border border-red-100">
                    <X className="w-3 h-3" />{s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {role.action_items?.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-2">Action Items</p>
              <div className="space-y-1.5">
                {role.action_items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <ArrowRight className="w-3.5 h-3.5 text-[#A3A3A3] mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-[#525252]">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(role.tier === "tier_1" || role.tier === "tier_2") && (
            <button
              onClick={() => onTrack(role)}
              className="w-full mt-2 px-4 py-2 bg-[#0A0A0A] text-white text-sm font-medium rounded-lg hover:bg-[#262626] transition-colors"
            >
              Add to Tracker
            </button>
          )}
        </div>
      )}
    </div>
  );
}