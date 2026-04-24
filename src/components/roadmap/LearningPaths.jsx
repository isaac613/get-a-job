import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, ExternalLink, RefreshCw, Loader2 } from "lucide-react";

export default function LearningPaths({ skillGaps, targetRole }) {
  const [courses, setCourses] = useState(null);
  const [totalWeeks, setTotalWeeks] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateLearningPath = async () => {
    if (!skillGaps || skillGaps.length === 0) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-learning-paths", {
        body: {
          skill_gaps: skillGaps,
          target_roles: targetRole ? [targetRole] : [],
        },
      });

      if (error) throw error;

      // Map learning_paths into the component's expected shape
      const paths = (data?.learning_paths || []).map((lp, i) => ({
        package_name: lp.skill || `Learning Path ${i + 1}`,
        skills_in_package: [lp.skill],
        priority: i === 0 ? "high" : i < 3 ? "medium" : "low",
        why_needed: lp.why_important || "",
        estimated_weeks: lp.resources?.reduce((sum, r) => {
          const match = r.time_commitment?.match(/(\d+)\s*week/i);
          return sum + (match ? parseInt(match[1]) : 1);
        }, 0) || 4,
        courses: (lp.resources || []).map(r => ({
          title: r.title,
          platform: r.platform,
          duration_weeks: r.time_commitment || "Self-paced",
          url_search: r.title + " " + r.platform,
        })),
        capstone_project: lp.capstone_project || null,
        optional_certification: null,
      }));

      setCourses(paths.length > 0 ? paths : null);
      setTotalWeeks(paths.reduce((sum, p) => sum + (p.estimated_weeks || 0), 0));
    } catch (error) {
      console.error("Failed to generate learning path:", error);
    } finally {
      setLoading(false);
    }
  };

  const priorityColors = {
    high: "bg-red-50 border-red-200 text-red-800",
    medium: "bg-amber-50 border-amber-200 text-amber-800",
    low: "bg-blue-50 border-blue-200 text-blue-800"
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
              {courses ? <RefreshCw className="w-4 h-4 mr-2" /> : <BookOpen className="w-4 h-4 mr-2" />}
              {courses ? "Refresh" : "Generate Path"}
            </>
          )}
        </Button>
      </div>

      {!courses && !loading && (
        <Card className="border-[#E5E5E5]">
          <CardContent className="pt-6 text-center text-sm text-[#A3A3A3]">
            {!skillGaps || skillGaps.length === 0
              ? "Your skill gaps will appear here after you run a Career Roadmap analysis. Once identified, click \"Generate Path\" for personalized learning recommendations."
              : "Click \"Generate Path\" to get personalized learning recommendations based on your skill gaps"}
          </CardContent>
        </Card>
      )}

      {courses && courses.length > 0 && (
        <div className="space-y-4">
          <div className="bg-[#F5F5F5] rounded-lg p-4 border border-[#E5E5E5]">
            <p className="text-sm text-[#525252]">
              <span className="font-semibold">Complete timeline:</span> {totalWeeks || courses.reduce((sum, p) => sum + (p.estimated_weeks || 0), 0) || "8-12"} weeks total
            </p>
          </div>

          <div className="space-y-4">
            {courses.map((pkg, index) => (
              <Card key={index} className="border-[#E5E5E5]">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold px-2 py-1 rounded bg-[#0A0A0A] text-white">
                          Package {index + 1}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full border ${priorityColors[pkg.priority]}`}>
                          {pkg.priority} priority
                        </span>
                      </div>
                      <CardTitle className="text-base font-semibold text-[#0A0A0A]">
                        {pkg.package_name}
                      </CardTitle>
                      <p className="text-xs text-[#A3A3A3] mt-2">{pkg.why_needed}</p>
                    </div>
                    <div className="text-right text-xs text-[#525252] whitespace-nowrap">
                      <span className="font-semibold">{pkg.estimated_weeks}</span> weeks
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Skills in package */}
                  <div className="flex flex-wrap gap-2">
                    {pkg.skills_in_package?.map((skill, idx) => (
                      <span
                        key={idx}
                        className="text-xs px-2.5 py-1 bg-[#ECFDF5] text-[#059669] rounded-md border border-[#D1FAE5]"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>

                  {/* Courses */}
                  {pkg.courses && pkg.courses.length > 0 && (
                    <div className="bg-[#EFF6FF] rounded-lg p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-[#2563EB]" />
                        <span className="text-xs font-medium text-[#2563EB]">CORE COURSE(S)</span>
                      </div>
                      <div className="space-y-2">
                        {pkg.courses.map((course, idx) => (
                          <div key={idx} className="space-y-1">
                            <h4 className="font-medium text-sm text-[#0A0A0A]">{course.title}</h4>
                            <div className="flex items-center gap-2 text-xs text-[#525252]">
                              <span className="font-medium">{course.platform}</span>
                              <span>•</span>
                              <span>{course.duration_weeks} weeks</span>
                            </div>
                            {course.url_search && (
                              <a
                                href={`https://www.google.com/search?q=${encodeURIComponent(course.url_search)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline"
                              >
                                Search <ExternalLink className="w-3 h-3" />
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
                      <p className="text-xs text-[#D97706] font-medium">
                        Proves: {pkg.capstone_project.why_it_proves}
                      </p>
                    </div>
                  )}

                  {/* Optional Certification */}
                  {pkg.optional_certification && pkg.optional_certification.name && (
                    <div className="bg-[#F5F5F5] rounded-lg p-3 space-y-1 border border-dashed border-[#D4D4D4]">
                      <span className="text-xs font-medium text-[#525252]">OPTIONAL: Certification</span>
                      <h4 className="font-medium text-sm text-[#0A0A0A]">{pkg.optional_certification.name}</h4>
                      <p className="text-xs text-[#A3A3A3]">
                        {pkg.optional_certification.issuer} • {pkg.optional_certification.value}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}