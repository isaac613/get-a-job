import React from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, TrendingUp } from "lucide-react";

const TIER_CONFIG = {
  tier_1: {
    label: "Tier 1 — Your Move",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    badge: "bg-emerald-100 text-emerald-700",
  },
  tier_2: {
    label: "Tier 2 — Plan B",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-700",
  },
  tier_3: {
    label: "Tier 3 — Work Toward",
    color: "text-indigo-700",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    badge: "bg-indigo-100 text-indigo-700",
  },
};

export default function StepTierReveal({ roles, qualificationLevel, overallAssessment, generating, onNext, onBack }) {
  if (generating) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-6 text-center">
        <Loader2 className="w-10 h-10 animate-spin text-[#525252]" />
        <div>
          <p className="text-lg font-bold text-[#0A0A0A]">Analysing your profile...</p>
          <p className="text-sm text-[#A3A3A3] mt-1">
            We're running your career assessment against real market data. This takes 15–30 seconds.
          </p>
        </div>
      </div>
    );
  }

  const tier1 = roles.filter((r) => r.tier === "tier_1");
  const tier2 = roles.filter((r) => r.tier === "tier_2");
  const tier3 = roles.filter((r) => r.tier === "tier_3");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-[#A3A3A3] font-medium mb-1">Career Roadmap Generated</p>
        <h2 className="text-xl font-bold text-[#0A0A0A] tracking-tight">Your Role Assessment</h2>
        {qualificationLevel && (
          <p className="text-sm font-medium text-[#525252] mt-1">{qualificationLevel}</p>
        )}
      </div>

      {overallAssessment && (
        <div className="bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider text-[#A3A3A3] font-medium mb-1">Assessment</p>
          <p className="text-sm text-[#525252] leading-relaxed">{overallAssessment}</p>
        </div>
      )}

      {[
        { key: "tier_1", roles: tier1 },
        { key: "tier_2", roles: tier2 },
        { key: "tier_3", roles: tier3 },
      ].map(({ key, roles: tierRoles }) => {
        const cfg = TIER_CONFIG[key];
        if (!tierRoles.length) return null;
        return (
          <div key={key}>
            <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${cfg.color}`}>{cfg.label}</p>
            <div className="space-y-2">
              {tierRoles.map((role, i) => (
                <div key={i} className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-[#0A0A0A]">{role.title}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex-shrink-0 ${cfg.badge}`}>
                      {Math.round((role.readiness_score || 0) * 100)}% match
                    </span>
                  </div>
                  {role.reasoning && (
                    <p className="text-xs text-[#525252] mt-1.5 leading-relaxed">{role.reasoning}</p>
                  )}
                  {role.missing_skills?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {role.missing_skills.slice(0, 4).map((s, j) => (
                        <span key={j} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-white border border-red-100 text-red-600 rounded">
                          <XCircle className="w-2.5 h-2.5" /> {s}
                        </span>
                      ))}
                    </div>
                  )}
                  {role.matched_skills?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {role.matched_skills.slice(0, 4).map((s, j) => (
                        <span key={j} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-white border border-emerald-100 text-emerald-700 rounded">
                          <CheckCircle2 className="w-2.5 h-2.5" /> {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="bg-[#0A0A0A] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-[#A3A3A3]" />
          <p className="text-xs uppercase tracking-wider text-[#A3A3A3] font-medium">What happens next</p>
        </div>
        <p className="text-sm text-white leading-relaxed">
          We're now building your personalised task list, dashboard, and configuring all AI agents with your specific profile data. Every agent will know your gaps, your goals, and your current qualification level.
        </p>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} className="text-sm">Back</Button>
        <Button onClick={onNext} className="bg-[#0A0A0A] hover:bg-[#262626] text-sm px-6">
          Initialise My Platform
        </Button>
      </div>
    </div>
  );
}