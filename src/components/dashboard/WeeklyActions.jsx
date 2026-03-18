import React from "react";
import { supabase } from "@/api/supabaseClient";
import { Square, CheckSquare } from "lucide-react";

export default function WeeklyActions({ profile, onUpdate }) {
  const actions = profile?.weekly_action_plan || [];

  const toggleAction = async (index) => {
    if (!profile) return;
    const updated = [...actions];
    updated[index] = { ...updated[index], completed: !updated[index].completed };
    await supabase.from("profiles").update({
      weekly_action_plan: updated,
    }).eq("id", profile.id);
    onUpdate();
  };

  if (actions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E5E5E5] p-6">
        <h3 className="text-xs uppercase tracking-wider text-[#A3A3A3] font-medium mb-3">
          This Week's Actions
        </h3>
        <p className="text-sm text-[#A3A3A3]">
          No action items yet. The AI Agent will generate your weekly plan.
        </p>
      </div>
    );
  }

  const completed = actions.filter((a) => a.completed).length;

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs uppercase tracking-wider text-[#A3A3A3] font-medium">
          This Week's Actions
        </h3>
        <span className="text-xs text-[#A3A3A3]">
          {completed}/{actions.length}
        </span>
      </div>
      <div className="space-y-2">
        {actions.map((action, i) => (
          <button
            key={i}
            onClick={() => toggleAction(i)}
            className="flex items-center gap-3 w-full text-left py-1.5 group"
          >
            {action.completed ? (
              <CheckSquare className="w-4 h-4 text-[#059669] flex-shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-[#A3A3A3] group-hover:text-[#525252] flex-shrink-0" />
            )}
            <span
              className={`text-sm ${
                action.completed
                  ? "text-[#A3A3A3] line-through"
                  : "text-[#525252]"
              }`}
            >
              {action.action}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}