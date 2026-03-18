import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Loader2 } from "lucide-react";

import OnboardingShell from "../components/onboarding/OnboardingShell";
import StepResumeUpload from "../components/onboarding/StepResumeUpload";
import StepEducation from "../components/onboarding/StepEducation";
import StepExperience from "../components/onboarding/StepExperience";
import StepSkills from "../components/onboarding/StepSkills";
import StepCareerDirection from "../components/onboarding/StepCareerDirection";
import StepConstraints from "../components/onboarding/StepConstraints";
import StepSurvey from "../components/onboarding/StepSurvey";
import StepTierReveal from "../components/onboarding/StepTierReveal";

const EMPTY_PROFILE = {
  full_name: "",
  phone_number: "",
  summary: "",
  linkedin_url: "",
  resume_url: "",
  degree: "",
  education_level: "",
  field_of_study: "",
  relevant_coursework: [],
  academic_projects: [],
  gpa: "",
  honors: [],
  hard_skills: [],
  tools_software: [],
  technical_skills: [],
  analytical_skills: [],
  communication_skills: [],
  leadership_skills: [],
  five_year_role: "",
  target_job_titles: [],
  target_industries: [],
  work_environment: "",
  open_to_lateral: false,
  open_to_outside_degree: false,
  location: "",
  work_type: "",
  employment_status: "",
  salary_expectation: "",
  available_start_date: "",
  biggest_challenge: "",
  job_search_efforts: "",
  role_clarity_score: null,
  cv_tailoring_strategy: "",
  linkedin_outreach_strategy: "",
  volunteering: [],
};

// Steps: 0=CV, 1=Education, 2=Experience, 3=Skills, 4=CareerDirection, 5=Constraints, 6=Survey, 7=TierReveal
export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [profileData, setProfileData] = useState(EMPTY_PROFILE);
  const [experiences, setExperiences] = useState([]);
  const [projects, setProjects] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [existingProfileId, setExistingProfileId] = useState(null);

  // Tier reveal state
  const [generatingRoles, setGeneratingRoles] = useState(false);
  const [generatedRoles, setGeneratedRoles] = useState([]);
  const [qualificationLevel, setQualificationLevel] = useState("");
  const [overallAssessment, setOverallAssessment] = useState("");

  const [finalising, setFinalising] = useState(false);

  useEffect(() => {
    checkExistingProfile();
  }, []);

  const checkExistingProfile = async () => {
    const user = await base44.auth.me().catch(() => null);
    if (!user) { setCheckingProfile(false); return; }
    const profiles = await base44.entities.UserProfile.filter({ created_by: user.email });
    if (profiles?.[0]?.onboarding_complete) {
      navigate(createPageUrl("Home"));
    } else if (profiles?.[0]) {
      const p = profiles[0];
      setExistingProfileId(p.id);
      setProfileData((prev) => ({
        ...prev,
        ...p,
        honors: p.honors || [],
        volunteering: p.volunteering || [],
      }));
      setStep(p.onboarding_step || 0);
    }
    setCheckingProfile(false);
  };

  // Called from StepResumeUpload — pre-fill profile from resume extraction
  const handleResumeExtracted = (extracted) => {
    const edu = extracted.education?.[0] || {};
    setProfileData((prev) => ({
      ...prev,
      full_name: extracted.full_name || prev.full_name,
      phone_number: extracted.phone_number || prev.phone_number,
      linkedin_url: extracted.linkedin_url || prev.linkedin_url,
      summary: extracted.summary || prev.summary,
      resume_url: extracted.resume_url || prev.resume_url,
      field_of_study: [edu.degree, edu.field_of_study].filter(Boolean).join(" ") || prev.field_of_study,
      gpa: edu.gpa || prev.gpa,
      honors: edu.honors || prev.honors || [],
      skills: extracted.skills || prev.skills || [],
      hard_skills: extracted.skills || prev.hard_skills || [],
      volunteering: extracted.volunteering || prev.volunteering || [],
    }));

    // Pre-fill experiences from resume
    if (extracted.experience?.length > 0) {
      setExperiences(extracted.experience.map((e) => ({
        title: e.title || "",
        company: e.company || "",
        type: "full_time",
        start_date: e.start_date || "",
        end_date: e.end_date || "",
        is_current: e.is_current || false,
        responsibilities: (e.responsibilities || []).join("\n"),
        skills_used: e.skills_used || [],
        tools_used: [],
      })));
    }

    if (extracted.projects?.length > 0) {
      setProjects(extracted.projects);
    }

    if (extracted.certifications?.length > 0) {
      setCertifications(extracted.certifications);
    }
  };

  const saveProgress = async (stepNum) => {
    const user = await base44.auth.me();
    const payload = { ...profileData, onboarding_step: stepNum };
    if (existingProfileId) {
      await base44.entities.UserProfile.update(existingProfileId, payload);
    } else {
      const created = await base44.entities.UserProfile.create({ ...payload, full_name: profileData.full_name || user.full_name || "User" });
      setExistingProfileId(created.id);
    }
  };

  const goTo = async (nextStep) => {
    await saveProgress(nextStep).catch(() => {});
    setStep(nextStep);
  };

  // Step 6→7: Run the AI tier analysis
  const handleSurveyNext = async () => {
    setStep(7);
    setGeneratingRoles(true);

    const allSkills = [
      ...(profileData.hard_skills || []),
      ...(profileData.tools_software || []),
      ...(profileData.technical_skills || []),
      ...(profileData.analytical_skills || []),
      ...(profileData.communication_skills || []),
      ...(profileData.leadership_skills || []),
      ...(profileData.skills || []),
    ];

    const prompt = `Generate exactly 2 roles per tier (Tier 1, 2, 3) for this candidate.

PROFILE:
- Education: ${profileData.degree || profileData.education_level} in ${profileData.field_of_study || "N/A"}
- Skills: ${[...new Set(allSkills)].slice(0, 15).join(", ") || "None"}
- Experience: ${experiences.slice(0, 3).map((e) => `${e.title} at ${e.company}`).join("; ") || "None"}
- Target: ${(profileData.target_job_titles || []).join(", ") || profileData.five_year_role || "Not specified"}
- Challenge: ${Array.isArray(profileData.biggest_challenge) ? profileData.biggest_challenge[0] : profileData.biggest_challenge || "Not specified"}

Generate conservative confidence scores (0.0-1.0). Tier 1 max 0.6 unless highly qualified.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
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
                confidence_score: { type: "number" },
                required_skills: { type: "array", items: { type: "string" } },
                matched_skills: { type: "array", items: { type: "string" } },
                missing_skills: { type: "array", items: { type: "string" } },
                match_percentage: { type: "number" },
                reasoning: { type: "string" },
                action_items: { type: "array", items: { type: "string" } },
                alignment_to_goal: { type: "string" },
              },
            },
          },
          skill_gaps: { type: "array", items: { type: "string" } },
          weekly_actions: { type: "array", items: { type: "string" } },
          current_tier1_role: { type: "string" },
        },
      },
    });

    if (result?.roles) {
      setGeneratedRoles(result.roles);
    }
    setQualificationLevel(result?.qualification_level || "");
    setOverallAssessment(result?.overall_assessment || "");

    // Save roles and update profile
    const user = await base44.auth.me();
    const existingRoles = await base44.entities.CareerRole.filter({ created_by: user.email });
    await Promise.all(existingRoles.map((r) => base44.entities.CareerRole.delete(r.id)));
    if (result?.roles) {
      const normalizedRoles = result.roles.map((r) => ({
        ...r,
        readiness_score: r.readiness_score ?? r.confidence_score ?? (r.match_percentage != null ? r.match_percentage / 100 : 0),
      }));
      await base44.entities.CareerRole.bulkCreate(normalizedRoles);
    }

    const tier1 = result?.roles?.find((r) => r.tier === "tier_1");
    const profileId = existingProfileId;
    if (profileId) {
      await base44.entities.UserProfile.update(profileId, {
        skill_gaps: result?.skill_gaps || [],
        qualification_level: result?.qualification_level || "",
        overall_assessment: result?.overall_assessment || "",
        current_tier1_role: result?.current_tier1_role || tier1?.title || "",
        last_reality_check_date: new Date().toISOString().split("T")[0],
        weekly_action_plan: (result?.weekly_actions || []).map((a) => ({ action: a, completed: false })),
        onboarding_step: 7,
      });
    }

    setGeneratingRoles(false);
  };

  // Final step: save everything, generate tasks, mark complete, navigate
  const handleFinalise = async () => {
    setFinalising(true);
    const user = await base44.auth.me();

    const allSkills = [
      ...(profileData.hard_skills || []),
      ...(profileData.tools_software || []),
      ...(profileData.technical_skills || []),
      ...(profileData.analytical_skills || []),
      ...(profileData.communication_skills || []),
      ...(profileData.leadership_skills || []),
      ...(profileData.skills || []),
    ];

    // Save experiences, projects, certifications + generate tasks — all in parallel
    const tier1Roles = generatedRoles.filter((r) => r.tier === "tier_1");

    if (!existingProfileId) {
      setFinalising(false);
      return;
    }
    const [taskResult] = await Promise.all([
      base44.integrations.Core.InvokeLLM({

      prompt: `Generate 8 specific tasks for this candidate.

- Skill Gaps: ${generatedRoles.flatMap((r) => r.missing_skills || []).slice(0, 5).join(", ") || "None"}
- Challenge: ${Array.isArray(profileData.biggest_challenge) ? profileData.biggest_challenge[0] : profileData.biggest_challenge || "Unknown"}
- Target Roles: ${tier1Roles.map((r) => r.title).join(", ") || "None"}

Categories: skill, project, networking, cv, application.`,
      model: "gemini_3_flash",
      response_json_schema: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                category: { type: "string", enum: ["skill", "project", "networking", "cv", "application"] },
                role_title: { type: "string" },
                skill_gap: { type: "string" },
                priority: { type: "string", enum: ["high", "medium", "low"] },
              },
            },
          },
        },
      },
    }),
      base44.entities.Experience.bulkCreate(experiences),
      base44.entities.Project.bulkCreate(projects.map((proj) => ({ name: proj.name, description: proj.description, url: proj.url, skills_demonstrated: proj.skills_demonstrated || [] }))),
      base44.entities.Certification.bulkCreate(certifications.map((cert) => ({ name: cert.name, issuer: cert.issuer, date_earned: cert.date_earned }))),
    ]);

    if (taskResult?.tasks) {
      await base44.entities.Task.bulkCreate(taskResult.tasks.map((t) => ({ ...t, is_complete: false })));
    }

    // Mark onboarding complete
    const profileId = existingProfileId;
    if (profileId) {
      await base44.entities.UserProfile.update(profileId, {
        ...profileData,
        skills: [...new Set(allSkills)],
        onboarding_complete: true,
        onboarding_step: 8,
      });
    }

    navigate(createPageUrl("Home"));
  };

  if (checkingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <Loader2 className="w-5 h-5 animate-spin text-[#A3A3A3]" />
      </div>
    );
  }

  if (finalising) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-[#FAFAFA]">
        <Loader2 className="w-8 h-8 animate-spin text-[#525252]" />
        <div className="text-center">
          <p className="text-base font-bold text-[#0A0A0A]">Initialising your platform...</p>
          <p className="text-sm text-[#A3A3A3] mt-1">Generating tasks, configuring agents, building your dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <OnboardingShell currentStep={step}>
      {step === 0 && (
        <StepResumeUpload
          onExtracted={handleResumeExtracted}
          onNext={() => goTo(1)}
          profileData={profileData}
          onChange={(patch) => setProfileData(prev => ({ ...prev, ...patch }))}
        />
      )}
      {step === 1 && (
        <StepEducation
          data={profileData}
          onChange={setProfileData}
          onNext={() => goTo(2)}
          onBack={() => goTo(0)}
        />
      )}
      {step === 2 && (
        <StepExperience
          experiences={experiences}
          onChange={setExperiences}
          onNext={() => goTo(3)}
          onBack={() => goTo(1)}
        />
      )}
      {step === 3 && (
        <StepSkills
          data={profileData}
          onChange={setProfileData}
          onNext={() => goTo(4)}
          onBack={() => goTo(2)}
        />
      )}
      {step === 4 && (
        <StepCareerDirection
          data={profileData}
          onChange={setProfileData}
          onNext={() => goTo(5)}
          onBack={() => goTo(3)}
        />
      )}
      {step === 5 && (
        <StepConstraints
          data={profileData}
          onChange={setProfileData}
          onSubmit={() => goTo(6)}
          onBack={() => goTo(4)}
          submitting={false}
        />
      )}
      {step === 6 && (
        <StepSurvey
          data={profileData}
          onChange={setProfileData}
          onNext={handleSurveyNext}
          onBack={() => goTo(5)}
        />
      )}
      {step === 7 && (
        <StepTierReveal
          roles={generatedRoles}
          qualificationLevel={qualificationLevel}
          overallAssessment={overallAssessment}
          generating={generatingRoles}
          onNext={handleFinalise}
          onBack={() => goTo(6)}
        />
      )}
    </OnboardingShell>
  );
}