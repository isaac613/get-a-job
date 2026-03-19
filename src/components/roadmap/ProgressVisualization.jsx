import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp } from "lucide-react";

export default function ProgressVisualization({ profile, roles, experiences, courses, certifications }) {
  // Calculate overall readiness based on various factors
  const calculateReadiness = () => {
    let score = 0;
    let maxScore = 100;

    // Skills (40 points)
    const hasSkills = (profile?.skills?.length || 0) > 0;
    score += hasSkills ? Math.min((profile?.skills?.length || 0) * 2, 40) : 0;

    // Experience (30 points)
    const expCount = experiences?.length || 0;
    score += Math.min(expCount * 10, 30);

    // Education (15 points)
    if (profile?.degree) score += 15;

    // Certifications (10 points)
    const certCount = certifications?.length || 0;
    score += Math.min(certCount * 5, 10);

    // Projects/Courses (5 points)
    const courseCount = courses?.length || 0;
    score += Math.min(courseCount * 2, 5);

    return Math.min(Math.round((score / maxScore) * 100), 100);
  };

  // Calculate tier-specific readiness
  const calculateTierReadiness = (tier) => {
    const tierRoles = roles?.filter(r => r.tier === tier) || [];
    if (tierRoles.length === 0) return 0;

    const avgConfidence = tierRoles.reduce((sum, role) => {
      const score = role.readiness_score ?? (role.match_percentage != null ? role.match_percentage / 100 : 0);
      return sum + score;
    }, 0) / tierRoles.length;
    return Math.round(avgConfidence * 100);
  };

  const overallReadiness = calculateReadiness();
  const tier1Readiness = calculateTierReadiness("tier_1");
  const tier2Readiness = calculateTierReadiness("tier_2");
  const tier3Readiness = calculateTierReadiness("tier_3");

  // Skill gap breakdown
  const skillGaps = profile?.skill_gaps || [];
  const totalSkills = (profile?.skills?.length || 0) + skillGaps.length;
  const skillCompleteness = totalSkills > 0 ? Math.round(((profile?.skills?.length || 0) / totalSkills) * 100) : 0;

  return (
    <Card className="border-[#E5E5E5]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="w-5 h-5 text-[#2563EB]" />
          Career Progress Dashboard
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Readiness */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[#0A0A0A]">Overall Career Readiness</span>
            <span className="text-2xl font-bold text-[#0A0A0A]">{overallReadiness}%</span>
          </div>
          <Progress value={overallReadiness} className="h-3" />
          <p className="text-xs text-[#A3A3A3] mt-2">
            Based on skills, experience, education, and certifications
          </p>
        </div>

        {/* Tier Readiness Breakdown */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-[#525252]">Role Tier Readiness</h4>
          
          <div className="space-y-3">
            {/* Tier 1 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm text-[#525252]">Tier 1 (Qualified Today)</span>
                </div>
                <span className="text-sm font-semibold text-[#059669]">{tier1Readiness}%</span>
              </div>
              <Progress value={tier1Readiness} className="h-2 [&>div]:bg-emerald-500" />
            </div>

            {/* Tier 2 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-sm text-[#525252]">Tier 2 (Slight Stretch)</span>
                </div>
                <span className="text-sm font-semibold text-[#D97706]">{tier2Readiness}%</span>
              </div>
              <Progress value={tier2Readiness} className="h-2 [&>div]:bg-amber-500" />
            </div>

            {/* Tier 3 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span className="text-sm text-[#525252]">Tier 3 (Future Path)</span>
                </div>
                <span className="text-sm font-semibold text-[#6366F1]">{tier3Readiness}%</span>
              </div>
              <Progress value={tier3Readiness} className="h-2 [&>div]:bg-indigo-500" />
            </div>
          </div>
        </div>

        {/* Skill Completeness */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[#0A0A0A]">Skill Coverage</span>
            <span className="text-sm font-semibold text-[#0A0A0A]">{skillCompleteness}%</span>
          </div>
          <Progress value={skillCompleteness} className="h-2" />
          <div className="flex items-center justify-between mt-2 text-xs text-[#A3A3A3]">
            <span>{profile?.skills?.length || 0} skills acquired</span>
            <span>{skillGaps.length} skill gaps identified</span>
          </div>
        </div>


      </CardContent>
    </Card>
  );
}