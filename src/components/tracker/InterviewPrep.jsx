import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";

export default function InterviewPrep({ app, onUpdate }) {
  const [prep, setPrep] = useState(app.interview_prep || {});

  const handleToggle = async (field) => {
    const previous = prep;
    const updated = { ...prep, [field]: !prep[field] };
    setPrep(updated);
    const { error } = await supabase.from("applications").update({ interview_prep: updated }).eq("id", app.id);
    if (error) {
      console.error("Failed to save interview prep:", error);
      setPrep(previous);
      toast.error("Failed to save. Please try again.");
      return;
    }
    onUpdate();
  };

  const items = [
    { key: "questions_prepared", label: "Questions Prepared" },
    { key: "company_research_done", label: "Company Research Done" },
    { key: "mock_interview_completed", label: "Mock Interview Completed" },
  ];

  const completedCount = items.filter((item) => prep[item.key]).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">
          Interview Preparation
        </p>
        <span className="text-xs text-[#525252]">
          {completedCount}/{items.length} Complete
        </span>
      </div>

      {app.status !== "applied" && app.status !== "interviewing" ? (
        <p className="text-xs text-[#A3A3A3] py-4 text-center">
          Interview prep will unlock once you've applied to this role.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <label
              key={item.key}
              className="flex items-center gap-3 p-3 bg-[#FAFAFA] rounded-lg cursor-pointer hover:bg-[#F0F0F0] transition-colors"
            >
              <Checkbox
                checked={prep[item.key]}
                onCheckedChange={() => handleToggle(item.key)}
              />
              <span className="text-sm text-[#0A0A0A] flex-1">{item.label}</span>
              {prep[item.key] ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <Circle className="w-4 h-4 text-[#A3A3A3]" />
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}