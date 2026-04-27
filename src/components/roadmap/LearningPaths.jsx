import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import GeneratingBanner from "@/components/ui/GeneratingBanner";

const LEARNING_PATH_MESSAGES = [
  "Matching your skill gaps to courses…",
  "Selecting platforms with strong free options…",
  "Building capstone project ideas…",
  "Almost ready — finalising your path…",
];

// CR1 fix — no frontend invention. Render only fields the LLM actually
// supplies via generate-learning-paths. Previous version wrapped each path
// in fictional metadata (priority badge derived from array index, "Package N"
// framing where each path was just one skill, hardcoded null
// optional_certification, "8-12 weeks" fallback string) — same trust-eroding
// pattern AG1's NO_FABRICATION_GUARD targets in agent responses.
//
// Edge function returns { skill, why_important, resources: [{title, platform,
// url, type, time_commitment}], capstone_project }. We map 1:1 and let the
// UI degrade gracefully when individual fields are missing.

export default function LearningPaths({ skillGaps, targetRole }) {
  const [paths, setPaths] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateLearningPath = async () => {
    if (!skillGaps || skillGaps.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-learning-paths", {
        body: {
          skill_gaps: skillGaps,
          target_roles: targetRole ? [targetRole] : [],
        },
      });

      if (error) throw error;

      const mapped = (data?.learning_paths || []).map((lp) => ({
        skill: lp.skill || "Skill",
        why_needed: lp.why_important || "",
        resources: (lp.resources || []).map((r) => ({
          title: r.title || "",
          platform: r.platform || "",
          // Only treat r.url as a real link if it parses as http/https. Otherwise
          // fall back to an explicit Google search so the user knows it's an
          // unverified search, not a course URL we can vouch for.
          url: typeof r.url === "string" && /^https?:\/\//.test(r.url) ? r.url : null,
          time_commitment: r.time_commitment || "Self-paced",
          type: r.type || "course",
        })),
        capstone_project: lp.capstone_project || null,
      }));

      setPaths(mapped.length > 0 ? mapped : null);
    } catch (error) {
      console.error("Failed to generate learning path:", error);
      const msg = error?.message || "Couldn't generate learning paths. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[#0A0A0A]">Learning Paths</h3>
          <p className="text-sm text-[#A3A3A3] mt-1">
            Personalized courses, certifications, and projects to close your skill gaps
          </p>
        </div>
        <Button
          onClick={generateLearningPath}
          disabled={loading || !skillGaps || skillGaps.length === 0}
          variant="outline"
          size="sm"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              {paths ? <RefreshCw className="w-4 h-4 mr-2" /> : <BookOpen className="w-4 h-4 mr-2" />}
              {paths ? "Refresh" : "Generate Path"}
            </>
          )}
        </Button>
      </div>

      {loading && (
        <GeneratingBanner messages={LEARNING_PATH_MESSAGES} subtitle="Generating your learning path — this takes ~10 seconds" />
      )}

      {error && !loading && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6 text-center text-sm text-red-600">
            {error}
          </CardContent>
        </Card>
      )}

      {!paths && !loading && (
        <Card className="border-[#E5E5E5]">
          <CardContent className="pt-6 text-center text-sm text-[#A3A3A3]">
            {!skillGaps || skillGaps.length === 0
              ? "Your skill gaps will appear here after you run a Career Roadmap analysis. Once identified, click \"Generate Path\" for personalized learning recommendations."
              : "Click \"Generate Path\" to get personalized learning recommendations based on your skill gaps"}
          </CardContent>
        </Card>
      )}

      {paths && paths.length > 0 && (
        <div className="space-y-4">
          {paths.map((pkg, index) => (
            <Card key={index} className="border-[#E5E5E5]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-[#0A0A0A]">
                  {pkg.skill}
                </CardTitle>
                {pkg.why_needed && (
                  <p className="text-xs text-[#A3A3A3] mt-2">{pkg.why_needed}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Resources */}
                {pkg.resources && pkg.resources.length > 0 && (
                  <div className="bg-[#EFF6FF] rounded-lg p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-[#2563EB]" />
                      <span className="text-xs font-medium text-[#2563EB]">RESOURCE(S)</span>
                    </div>
                    <div className="space-y-2">
                      {pkg.resources.map((course, idx) => (
                        <div key={idx} className="space-y-1">
                          <h4 className="font-medium text-sm text-[#0A0A0A]">{course.title}</h4>
                          <div className="flex items-center gap-2 text-xs text-[#525252]">
                            {course.platform && <span className="font-medium">{course.platform}</span>}
                            {course.platform && course.time_commitment && <span>•</span>}
                            {course.time_commitment && <span>{course.time_commitment}</span>}
                          </div>
                          {course.url ? (
                            <a
                              href={course.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline"
                            >
                              Open course <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <a
                              href={`https://www.google.com/search?q=${encodeURIComponent(`${course.title} ${course.platform}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-[#525252] hover:underline"
                            >
                              Search Google for this course <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Capstone Project */}
                {pkg.capstone_project && (
                  <div className="bg-[#FFFBEB] rounded-lg p-3 space-y-2">
                    <span className="text-xs font-medium text-[#D97706]">CAPSTONE PROJECT</span>
                    <h4 className="font-medium text-sm text-[#0A0A0A]">{pkg.capstone_project.title}</h4>
                    <p className="text-xs text-[#525252]">{pkg.capstone_project.description}</p>
                    {pkg.capstone_project.why_it_proves && (
                      <p className="text-xs text-[#D97706] font-medium">
                        Proves: {pkg.capstone_project.why_it_proves}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
