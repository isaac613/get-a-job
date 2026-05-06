import React from "react";
import { Briefcase, Lightbulb, Award } from "lucide-react";
import { cn } from "@/lib/utils";

// Card grid showing the 3 active post types (Phase 2). Phase 3 will add
// recap / observation / question / free_form — those don't appear yet
// per Eli's call PR #32: "no reason to advertise what's not ready yet."
const POST_TYPES = [
  {
    id: "project",
    label: "Project showcase",
    Icon: Briefcase,
    description: "Share a class project, side project, hackathon piece, or internship deliverable. Best when you have a specific outcome to lead with.",
    saveableHint: "Posts with a clear outcome lead get the highest engagement.",
  },
  {
    id: "lessons",
    label: "Lessons learned",
    Icon: Lightbulb,
    description: "3–5 concrete lessons from a course, role, project, book, or event. Each lesson tied to a specific example you actually lived.",
    saveableHint: "Numbered lists with examples are the most-saved post format.",
  },
  {
    id: "milestone",
    label: "Career milestone",
    Icon: Award,
    description: "Share a career update — internship offer, role start, certification, graduation. Specific gratitude with named people works far better than generic excitement.",
    saveableHint: "Skip 'Excited to share' / 'Thrilled to announce' — these are algorithmically suppressed.",
  },
];

export default function PostTypeGrid({ onSelect }) {
  return (
    <div>
      <p className="text-sm text-[#525252] mb-4">
        Pick a post type to start. The AI grounds each post in your profile, Story Bank, and career goals.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {POST_TYPES.map(({ id, label, Icon, description, saveableHint }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={cn(
              "text-left bg-white border border-[#E5E5E5] rounded-xl p-4",
              "hover:border-[#0A0A0A] hover:shadow-sm transition-all"
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4 text-[#0A0A0A]" />
              <h3 className="text-sm font-semibold text-[#0A0A0A]">{label}</h3>
            </div>
            <p className="text-xs text-[#525252] leading-snug mb-2">{description}</p>
            <p className="text-[11px] text-[#A3A3A3] italic leading-snug">{saveableHint}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
