import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Loader2, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";

const ROADMAP_MESSAGES = [
  "Searching LinkedIn & Glassdoor for real job postings…",
  "Matching your skills to market requirements…",
  "Calculating skill match scores per role…",
  "Identifying your skill gaps…",
  "Classifying roles into tiers…",
  "Ranking roles by readiness & alignment…",
  "Almost done — finalising your roadmap…",
];

function GeneratingBanner({ messages }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % messages.length), 3500);
    return () => clearInterval(t);
  }, [messages.length]);
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-3 mb-6">
      <Loader2 className="w-4 h-4 animate-spin text-amber-600 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold text-amber-800">Generating your roadmap — this takes ~30–60 seconds</p>
        <p className="text-xs text-amber-700 mt-1 transition-all">{messages[idx]}</p>
      </div>
    </div>
  );
}
import RoleCard from "../components/roadmap/RoleCard";
import LearningPaths from "../components/roadmap/LearningPaths";
import ProgressVisualization from "../components/roadmap/ProgressVisualization";
import { Link } from "react-router-dom";

export default function CareerRoadmap() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [generating, setGenerating] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const { data: roles, isLoading } = useQuery({
    queryKey: ["careerRoles", user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return base44.entities.CareerRole.filter({ created_by: user.email });
    },
    enabled: !!user?.email,
    initialData: [],
  });

  const { data: profiles } = useQuery({
    queryKey: ["userProfile", user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return base44.entities.UserProfile.filter({ created_by: user.email });
    },
    enabled: !!user?.email,
    initialData: [],
  });

  const { data: experiences } = useQuery({
    queryKey: ["experiences", user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return base44.entities.Experience.filter({ created_by: user.email });
    },
    enabled: !!user?.email,
    initialData: [],
  });

  const { data: courses } = useQuery({
    queryKey: ["courses", user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return base44.entities.Course.filter({ created_by: user.email });
    },
    enabled: !!user?.email,
    initialData: [],
  });

  const { data: certifications } = useQuery({
    queryKey: ["certifications", user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return base44.entities.Certification.filter({ created_by: user.email });
    },
    enabled: !!user?.email,
    initialData: [],
  });

  const profile = profiles?.[0];

  const tier1 = roles.filter((r) => r.tier === "tier_1");
  const tier2 = roles.filter((r) => r.tier === "tier_2");
  const tier3 = roles.filter((r) => r.tier === "tier_3");

  const handleGenerate = async () => {
    if (!profile) return;
    setGenerating(true);
    try {

    const allSkills = profile.skills || [];
    const prompt = `You are a Career Tier Assignment System. Your job is to determine which tier roles belong in based on the person's capability profile vs REAL market requirements sourced from LinkedIn, Glassdoor, and current job postings.

Use the internet to:
1. Find the most in-demand job titles on LinkedIn/Glassdoor matching the user's skills and goal (${profile.five_year_role || "unspecified"})
2. Use REAL required skills from actual current job postings — not generic lists
3. Base salary ranges on real market data for ${profile.location || "the user's location"}
4. Make role titles match exactly how they appear in real job listings right now
5. For salary_range: look up REAL current salary data from Glassdoor, LinkedIn Salary, Levels.fyi, and Indeed for this EXACT role title in ${profile.location || "the user's location"}. Do NOT estimate or use generic ranges. Cite the actual range you find (e.g. "$65,000–$85,000/yr based on Glassdoor data for ${profile.location || "this location"}"). If you cannot find location-specific data, explicitly say so and give the closest market you found data for.

STUDENT PROFILE (CAPABILITY DATA):
- Name: ${profile.full_name}
- Education: ${profile.degree || ""} in ${profile.field_of_study || "N/A"} (${profile.education_level || ""})
- GPA: ${profile.gpa || "Not specified"}
- Relevant Coursework: ${profile.relevant_coursework?.join(", ") || "None listed"}
- Academic Projects: ${profile.academic_projects?.join(", ") || "None listed"}
- Hard Skills: ${profile.hard_skills?.join(", ") || "None"}
- Tools/Software: ${profile.tools_software?.join(", ") || "None"}
- Technical Skills: ${profile.technical_skills?.join(", ") || "None"}
- Analytical Skills: ${profile.analytical_skills?.join(", ") || "None"}
- Communication Skills: ${profile.communication_skills?.join(", ") || "None"}
- Leadership Skills: ${profile.leadership_skills?.join(", ") || "None"}
- All Skills Combined: ${allSkills.join(", ") || "None"}
- 5-Year Goal: ${profile.five_year_role || "Not specified"}
- Target Job Titles: ${profile.target_job_titles?.join(", ") || "Not specified"}
- Target Industries: ${profile.target_industries?.join(", ") || "Not specified"}
- Preferred Environment: ${profile.work_environment || "Any"}
- Open to Lateral Moves: ${profile.open_to_lateral ? "Yes" : "No"}
- Open to Roles Outside Degree: ${profile.open_to_outside_degree ? "Yes" : "No"}
- Location: ${profile.location || "Not specified"}
- Work Type Preference: ${profile.work_type || "Flexible"}
- Years of Experience: ${profile.years_experience || 0}

TIER ASSIGNMENT FRAMEWORK:
Use this exact methodology to classify 15 roles:

Step 1: Build Capability Profile
Extract: education, experience, skills (technical/analytical/communication/leadership), projects, tools.

Step 2: Analyze Market Requirements for Each Role
For each potential role, reference typical market requirements (what employers ask for).

Step 3: Calculate Skill Match
Match score = (skills user has / skills required) × 100
Example: User has 4/5 required skills = 80% match

Step 4: Identify Gap Severity
- Minor gaps: Can be learned quickly (tool-specific, terminology)
- Major gaps: Require significant experience (managing teams, building systems)

Step 5: Assign Tier (MANDATORY):

**TIER 1 — THE SWEET SPOT**
- match_percentage: 70–90%
- Criteria: Qualifications you have NOW + aligns with your 5-year goal
- Timeline: Apply TODAY, leads directly to your goal
- readiness_status: "Ready Now"
- readiness_score: 0.70–0.90 (mirrors match_percentage)
- Examples: Roles that are your next logical step AND your 5-year target direction

**TIER 2 — ALTERNATIVE PATHS**
- match_percentage: 55–75%
- Criteria: You're qualified for these, but they're slightly "out of the way" — not direct paths, but still lead to your 5-year goal
- Timeline: Still get you to your goal in 5 years, just different trajectory
- readiness_status: "Nearly Ready" or "Ready Now" depending on match
- readiness_score: 0.55–0.75 (mirrors match_percentage)
- Examples: Lateral moves, adjacent industries, different niches that still align with goal

**TIER 3 — STEPPING STONE (JOB AFTER TIER 1)**
- match_percentage: 70–85%
- Criteria: The job you'd take AFTER Tier 1 to progress toward your 5-year goal. Middle rung between your next role and where you want to be.
- Timeline: 1–2 years into career progression
- readiness_status: "Ready Now"
- readiness_score: 0.70–0.85 (mirrors match_percentage)
- Examples: Next-level advancement from Tier 1 roles (e.g., Senior Analyst after Junior Analyst)

Step 6: Alignment Check
Even if a user qualifies for a role, exclude it from Tier 1 if it does NOT lead toward their 5-year goal: ${profile.five_year_role || "Not specified"}

Step 7: Rank Within Each Tier
Order by: skill match score → industry alignment → experience relevance → market accessibility

⚠️ MANDATORY: GENERATE EXACTLY 12 ROLES ⚠️
- EXACTLY 5 Tier 1 roles (realistic NOW applications)
- EXACTLY 5 Tier 2 roles (targeted improvements needed)
- EXACTLY 2 Tier 3 roles (long-term trajectory)

YOU MUST VALIDATE BEFORE RETURNING:
- Count Tier 1 roles. Must be exactly 5.
- Count Tier 2 roles. Must be exactly 5.
- Count Tier 3 roles. Must be exactly 2.
- NEVER return with fewer roles than specified. This is non-negotiable.

For EACH role, provide:
- title: Role name
- tier: "tier_1", "tier_2", or "tier_3"
- readiness_status: "Ready Now" (70-90% match + minor gaps), "Nearly Ready" (50-70% match + some gaps), or "Needs Work" (<50% match + major gaps)
- readiness_score: 0.0–1.0 underlying score (same as before, just labeled now)
- required_skills: What employers ask for
- matched_skills: What THIS person has (cite from their profile)
- missing_skills: What they lack (honest assessment)
- match_percentage: (matched / required) × 100
- reasoning: EXPLAIN using their specific background. Reference their actual skills, projects, experience. NOT generic.
- action_items: Specific next steps for THIS person to qualify
- alignment_to_goal: How this role moves them toward their 5-year goal
- salary_range: REAL salary range from Glassdoor/LinkedIn Salary/Indeed for this exact role in ${profile.location || "the user's location"} — must include the source (e.g. "£32,000–£45,000/yr · Glassdoor, London 2024"). Never guess.

REASONING MUST CITE THEIR DATA:
✓ "Has client relations from 2 years in [specific role]. Communication skills align with CRM-heavy role. Missing: SaaS experience (minor gap—tools can be learned in weeks)."
✗ "Communication is important in this role."

GENERATION WORKFLOW:
1. Extract their 2–3 strongest skill domains from profile
2. Identify their 5-year goal from profile (five_year_role)

TIER 1 (The Sweet Spot) — EXACTLY 5 ROLES:
- Skills match: 70-90%
- Gap severity: MINOR ONLY (tools, domain-specific knowledge)
- Alignment: DIRECTLY reaches 5-year goal (exact role or immediate next step)
- readiness_status: "Ready Now"
- Examples: If goal is "Senior Data Analyst", Tier 1 might be "Junior Data Analyst", "Data Analyst", "Analytics Coordinator"

TIER 2 (Alternative Paths) — EXACTLY 5 ROLES:
- Skills match: 55-75%
- Gap severity: MODERATE (some important skills missing, but learnable)
- Alignment: Different path but still reaches 5-year goal within 5 years
- readiness_status: "Nearly Ready"
- Examples: If goal is "Senior Data Analyst", Tier 2 might be "Business Analyst", "Financial Analyst", "Marketing Analyst" (same domain, different niche)

TIER 3 (Stepping Stone) — EXACTLY 2 ROLES:
- Skills match: 70-85%
- Gap severity: MINOR (mostly experience-based gaps)
- Alignment: The NEXT JOB after Tier 1 — progression step toward 5-year goal
- readiness_status: "Ready Now"
- Examples: If Tier 1 is "Junior Data Analyst", Tier 3 is "Data Analyst", "Senior Analyst", "Analytics Manager" (one level up)

GENERATION APPROACH:

For TIER 1: Generate 7-10 diverse role candidates with 70-90% match that DIRECTLY reach their 5-year goal
For TIER 2: Generate 7-10 diverse role candidates with 55-75% match that are alternative paths to the goal
For TIER 3: Generate 2-3 role candidates with 70-85% match that represent progression AFTER Tier 1

Requirements for each role:
- readiness_score = match_percentage / 100 (always)
- Reasoning must cite their specific skills and experience
- Ensure diversity in company types, industries, and role variations`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: "gemini_3_flash",
      response_json_schema: {
        type: "object",
        properties: {
          qualification_level: { type: "string" },
          overall_assessment: { type: "string" },
          roles: {
            type: "array",
            items: {
              type: "object",
              properties: {
                 title: { type: "string" },
                tier: { type: "string", enum: ["tier_1", "tier_2", "tier_3"] },
                readiness_status: { type: "string", enum: ["Ready Now", "Nearly Ready", "Needs Work"] },
                readiness_score: { type: "number" },
                required_skills: { type: "array", items: { type: "string" } },
                matched_skills: { type: "array", items: { type: "string" } },
                missing_skills: { type: "array", items: { type: "string" } },
                match_percentage: { type: "number" },
                reasoning: { type: "string" },
                action_items: { type: "array", items: { type: "string" } },
                alignment_to_goal: { type: "string" },
                // salary_range intentionally excluded
                },
            },
          },
          skill_gaps: { type: "array", items: { type: "string" } },
          current_tier1_role: { type: "string" },
        },
      },
    });

    // Delete old roles and create new ones
    await Promise.all(roles.map((role) => base44.entities.CareerRole.delete(role.id)));
    if (result?.roles) {
      // Normalize confidence_score to readiness_score for backwards compatibility
      const normalizedRoles = result.roles.map(r => ({
        ...r,
        readiness_score: r.readiness_score ?? r.confidence_score ?? (r.match_percentage != null ? r.match_percentage / 100 : 0),
      }));

      // Enforce exactly 5 roles per tier
      const tier1Roles = normalizedRoles.filter(r => r.tier === "tier_1").sort((a, b) => b.match_percentage - a.match_percentage).slice(0, 5);
      const tier2Roles = normalizedRoles.filter(r => r.tier === "tier_2").sort((a, b) => b.match_percentage - a.match_percentage).slice(0, 5);
      const tier3Roles = normalizedRoles.filter(r => r.tier === "tier_3").sort((a, b) => b.match_percentage - a.match_percentage).slice(0, 2);

      const finalRoles = [...tier1Roles, ...tier2Roles, ...tier3Roles];
      await base44.entities.CareerRole.bulkCreate(finalRoles);
    }

    const allMissing = [...new Set(result?.skill_gaps || result?.roles?.flatMap((r) => r.missing_skills || []) || [])];
    const tier1 = result?.roles?.filter(r => r.tier === "tier_1")?.[0];
    await base44.entities.UserProfile.update(profile.id, {
      skill_gaps: allMissing,
      qualification_level: result?.qualification_level || "",
      overall_assessment: result?.overall_assessment || "",
      current_tier1_role: result?.current_tier1_role || tier1?.title || "",
      last_reality_check_date: new Date().toISOString().split("T")[0],
    });

    queryClient.invalidateQueries({ queryKey: ["careerRoles"] });
    queryClient.invalidateQueries({ queryKey: ["userProfile"] });
    } finally {
      setGenerating(false);
    }
  };

  const handleTrack = async (role) => {
    await base44.entities.Application.create({
      role_title: role.title,
      tier: role.tier,
      status: "interested",
    });
    queryClient.invalidateQueries({ queryKey: ["applications"] });
    navigate(createPageUrl("Tracker"));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="w-5 h-5 animate-spin text-[#A3A3A3]" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0A0A0A]">Career Roadmap</h1>
          <p className="text-sm text-[#A3A3A3] mt-1">
            Roles classified by your current qualification level.
          </p>
        </div>
        {profile && (
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-[#0A0A0A] hover:bg-[#262626] text-sm"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Brain className="w-4 h-4 mr-2" />
                Generate Roadmap
              </>
            )}
          </Button>
        )}
      </div>

      {generating && <GeneratingBanner messages={ROADMAP_MESSAGES} />}

      {!profile && (
        <div className="bg-white rounded-xl border border-[#E5E5E5] p-8 text-center">
          <p className="text-sm text-[#525252] mb-4">
            Set up your profile first to generate a career roadmap.
          </p>
          <Link
            to={createPageUrl("AddInformation")}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0A0A0A] text-white text-sm font-medium rounded-lg hover:bg-[#262626]"
          >
            Add Information
          </Link>
        </div>
      )}

      {roles.length === 0 && profile && (
        <div className="bg-white rounded-xl border border-[#E5E5E5] p-8 text-center">
          <p className="text-sm text-[#525252]">
            No roles generated yet. Click "Generate Roadmap" to analyze your profile and create your tier-classified career map.
          </p>
        </div>
      )}

      {/* Progress Dashboard */}
      {roles.length > 0 && (
        <div className="mb-8">
          <ProgressVisualization
            profile={profile}
            roles={roles}
            experiences={experiences}
            courses={courses}
            certifications={certifications}
          />
        </div>
      )}

      {/* Learning Paths */}
      {roles.length > 0 && profile?.skill_gaps && profile.skill_gaps.length > 0 && (
        <div className="mb-8">
          <LearningPaths
            skillGaps={profile.skill_gaps}
            targetRole={profile.current_tier1_role || profile.five_year_role}
          />
        </div>
      )}

      {tier1.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-[#059669] font-semibold mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Tier 1 -- Qualified Today
          </h2>
          <div className="space-y-3">
            {tier1.map((role) => (
              <RoleCard key={role.id} role={role} onTrack={handleTrack} />
            ))}
          </div>
        </div>
      )}

      {tier2.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-[#D97706] font-semibold mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Tier 2 -- Slight Stretch
          </h2>
          <div className="space-y-3">
            {tier2.map((role) => (
              <RoleCard key={role.id} role={role} onTrack={handleTrack} />
            ))}
          </div>
        </div>
      )}

      {tier3.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-[#6366F1] font-semibold mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            Tier 3 -- Future Path
          </h2>
          <div className="space-y-3">
            {tier3.map((role) => (
              <RoleCard key={role.id} role={role} onTrack={handleTrack} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}