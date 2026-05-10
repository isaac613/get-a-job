import React from "react";
import { BookMarked, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ExperienceStories({ stories, onEdit, onDelete }) {
  if (!stories || stories.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      <h4 className="text-xs uppercase tracking-wider text-[#A3A3A3] font-medium flex items-center gap-1.5">
        <BookMarked className="w-3.5 h-3.5" />
        Stories ({stories.length})
      </h4>
      <div className="grid gap-3">
        {stories.map((story) => (
          <div key={story.id} className="bg-[#FAFAFA] border border-[#E5E5E5] rounded-lg p-3">
            <div className="flex items-start justify-between mb-2">
              <h5 className="text-sm font-semibold text-[#0A0A0A]">{story.title}</h5>
              <div className="flex items-center gap-1">
                {/* We don't have an edit flow implemented yet, but we provide the prop */}
                {/* <Button variant="ghost" size="sm" className="h-6 w-6 p-1" onClick={() => onEdit?.(story)}>
                  <PenLine className="w-3 h-3 text-[#A3A3A3] hover:text-[#0A0A0A]" />
                </Button> */}
                <Button variant="ghost" size="sm" className="h-6 w-6 p-1" onClick={() => onDelete?.(story)}>
                  <Trash2 className="w-3 h-3 text-[#A3A3A3] hover:text-red-500" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5 mb-3">
              {story.situation && (
                <p className="text-xs text-[#525252] leading-snug">
                  <span className="font-semibold text-[#0A0A0A]">S:</span> {story.situation}
                </p>
              )}
              {story.task && (
                <p className="text-xs text-[#525252] leading-snug">
                  <span className="font-semibold text-[#0A0A0A]">T:</span> {story.task}
                </p>
              )}
              {story.action && (
                <p className="text-xs text-[#525252] leading-snug">
                  <span className="font-semibold text-[#0A0A0A]">A:</span> {story.action}
                </p>
              )}
              {story.result && (
                <p className="text-xs text-[#525252] leading-snug">
                  <span className="font-semibold text-[#0A0A0A]">R:</span> {story.result}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {story.metrics?.map((m, i) => (
                <span key={`m-${i}`} className="inline-flex items-center text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                  {m}
                </span>
              ))}
              {story.skills_demonstrated?.map((s, i) => (
                <span key={`s-${i}`} className="inline-flex items-center text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">
                  {s}
                </span>
              ))}
              {story.tools_used?.map((t, i) => (
                <span key={`t-${i}`} className="inline-flex items-center text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">
                  {t}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
