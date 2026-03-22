import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";

export default function FollowUp({ app, onUpdate }) {
  const [followUp, setFollowUp] = useState(app.follow_up || {});

  const handleToggle = async (field) => {
    const previous = followUp;
    const updated = { ...followUp, [field]: !followUp[field] };
    setFollowUp(updated);
    const { error } = await supabase.from("applications").update({ follow_up: updated }).eq("id", app.id);
    if (error) {
      console.error("Failed to save follow-up:", error);
      setFollowUp(previous);
      toast.error("Failed to save. Please try again.");
      return;
    }
    onUpdate();
  };

  const items = [
    { key: "follow_up_sent", label: "Follow-up Email Sent" },
    { key: "recruiter_contacted", label: "Recruiter Contacted" },
    { key: "response_received", label: "Response Received" },
  ];

  const completedCount = items.filter((item) => followUp[item.key] === true).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">
          Follow-Up Actions
        </p>
        <span className="text-xs text-[#525252]">
          {completedCount}/{items.length} Complete
        </span>
      </div>

      {app.status !== "applied" && app.status !== "interviewing" ? (
        <p className="text-xs text-[#A3A3A3] py-4 text-center">
          Follow-up tracking will unlock once you've applied.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <label
              key={item.key}
              className="flex items-center gap-3 p-3 bg-[#FAFAFA] rounded-lg cursor-pointer hover:bg-[#F0F0F0] transition-colors"
            >
              <Checkbox
                checked={followUp[item.key]}
                onCheckedChange={() => handleToggle(item.key)}
              />
              <span className="text-sm text-[#0A0A0A] flex-1">{item.label}</span>
              {followUp[item.key] ? (
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