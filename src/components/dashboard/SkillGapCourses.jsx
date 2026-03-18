import React, { useState } from "react";
import { ExternalLink, Loader2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

export default function SkillGapCourses({ skillGaps }) {
  const [courses, setCourses] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchCourses = async () => {
    setLoading(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a career development advisor. Generate course recommendations from Coursera, Udemy, or edX for these skill gaps: ${skillGaps.join(", ")}.

For each skill gap, provide:
- Course title
- Platform (Coursera, Udemy, edX, LinkedIn Learning)
- Brief description (1 line)
- Estimated time commitment
- Why it addresses the gap

Return 2-3 courses per skill gap (total 5-8 courses max).`,
      response_json_schema: {
        type: "object",
        properties: {
          courses: {
            type: "array",
            items: {
              type: "object",
              properties: {
                skill_gap: { type: "string" },
                course_title: { type: "string" },
                platform: { type: "string" },
                description: { type: "string" },
                time_commitment: { type: "string" },
                relevance: { type: "string" },
              },
            },
          },
        },
      },
    });
    setCourses(result?.courses || []);
    setLoading(false);
  };

  if (skillGaps.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#0A0A0A]" />
          <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">
            Recommended Courses
          </p>
        </div>
        {!courses && (
          <Button
            onClick={fetchCourses}
            disabled={loading}
            size="sm"
            className="bg-[#0A0A0A] hover:bg-[#262626]"
          >
            {loading ? (
              <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Loading...</>
            ) : (
              "Get Recommendations"
            )}
          </Button>
        )}
      </div>

      {courses && courses.length > 0 && (
        <div className="space-y-3 mt-4">
          {courses.map((course, i) => (
            <div key={i} className="border border-[#F0F0F0] rounded-lg p-3 hover:border-[#E5E5E5] transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#0A0A0A] mb-0.5">{course.course_title}</p>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 bg-[#F5F5F5] text-[#525252] rounded">
                      {course.platform}
                    </span>
                    <span className="text-[10px] text-[#A3A3A3]">{course.time_commitment}</span>
                  </div>
                  <p className="text-[11px] text-[#525252] mb-1.5 leading-relaxed">{course.description}</p>
                  <p className="text-[10px] text-[#A3A3A3] italic">
                    <span className="font-medium text-amber-600">Gap:</span> {course.skill_gap} — {course.relevance}
                  </p>
                </div>
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(course.course_title + " " + course.platform)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 text-[#0A0A0A] hover:text-[#525252] transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          ))}
          <button
            onClick={fetchCourses}
            className="w-full text-xs text-[#525252] hover:text-[#0A0A0A] transition-colors py-1"
          >
            Refresh recommendations
          </button>
        </div>
      )}
    </div>
  );
}