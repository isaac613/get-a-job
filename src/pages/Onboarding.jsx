import React, { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  const { user } = useAuth();
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
  const [saveError, setSaveError] = useState(null);
  const [finaliseError, setFinaliseError] = useState(null);
  const [tierRevealError, setTierRevealError] = useState(null);

  useEffect(() => {
    if (user) checkExistingProfile();
    else setCheckingProfile(false);
  }, [user]);

  const checkExistingProfile = async () => {
    if (!user) { setCheckingProfile(false); return; }
    const { data: profiles } = await supabase.from("profiles").select("*").eq("id", user.id);
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
      location: extracted.location || prev.location,
      linkedin_url: extracted.linkedin_url || prev.linkedin_url,
      summary: extracted.summary || prev.summary,
      degree: extracted.degree || edu.degree || prev.degree,
      field_of_study: extracted.field_of_study || [edu.degree, edu.field_of_study].filter(Boolean).join(" ") || prev.field_of_study,
      education_level: extracted.education_level || prev.education_level,
      gpa: edu.gpa || prev.gpa,
      honors: edu.honors || prev.honors || [],
      skills: extracted.skills || prev.skills || [],
      tools_software: extracted.tools_software?.length ? extracted.tools_software : prev.tools_software || [],
      hard_skills: extracted.hard_skills?.length ? extracted.hard_skills : (extracted.skills || prev.hard_skills || []),
      technical_skills: extracted.technical_skills?.length ? extracted.technical_skills : prev.technical_skills || [],
      analytical_skills: extracted.analytical_skills?.length ? extracted.analytical_skills : prev.analytical_skills || [],
      communication_skills: extracted.communication_skills?.length ? extracted.communication_skills : prev.communication_skills || [],
      leadership_skills: extracted.leadership_skills?.length ? extracted.leadership_skills : prev.leadership_skills || [],
      volunteering: extracted.volunteering || prev.volunteering || [],
    }));

    // Pre-fill experiences from resume
    const exps = extracted.experiences || extracted.experience || [];
    if (exps.length > 0) {
      setExperiences(exps.map((e) => ({
        title: e.title || "",
        company: e.company || "",
        type: "full_time",
        start_date: e.start_date || "",
        end_date: e.end_date || "",
        is_current: e.is_current || false,
        responsibilities: Array.isArray(e.responsibilities)
          ? e.responsibilities.join("\n")
          : (e.responsibilities || ""),
        skills_used: e.skills_used || [],
        tools_used: [],
      })));
    }

    const projs = extracted.projects || [];
    if (projs.length > 0) {
      setProjects(extracted.projects);
    }

    if (extracted.certifications?.length > 0) {
      setCertifications(extracted.certifications);
    }
  };

  const cleanProfilePayload = (data) => {
    // Only keep fields that actually exist in the ‘profiles’ DB table schema!
    const {
      full_name, phone_number, location, linkedin_url, summary, skills, 
      degree, field_of_study, education_level, gpa, honors, relevant_coursework, resume_url,
      onboarding_step, onboarding_complete,
      skill_gaps, qualification_level, overall_assessment, last_reality_check_date
    } = data;
    return {
      full_name, phone_number, location, linkedin_url, summary, skills,
      degree, field_of_study, education_level, gpa, honors, relevant_coursework, resume_url,
      onboarding_step, onboarding_complete,
      skill_gaps, qualification_level, overall_assessment, last_reality_check_date
    };
  };

  const saveProgress = async (stepNum) => {
    const rawPayload = { ...profileData, onboarding_step: stepNum };
    const payload = cleanProfilePayload(rawPayload);
    
    // Remove undefined values so we don't accidentally overwrite DB fields with null/undefined unnecessarily
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
    
    if (existingProfileId) {
      const { error: updateError } = await supabase.from("profiles").update(payload).eq("id", existingProfileId);
      if (updateError) throw updateError;
    } else {
      const { data, error } = await supabase.from("profiles").insert({
        id: user.id,
        ...payload,
        full_name: profileData.full_name || user.user_metadata?.full_name || "User",
      }).select();
      if (!error && data?.[0]) {
        setExistingProfileId(data[0].id);
      }
    }
  };

  const goTo = async (nextStep) => {
    setSaveError(null);
    try {
      await saveProgress(nextStep);
      setStep(nextStep);
    } catch (err) {
      console.error("Failed to save onboarding progress:", err);
      setSaveError(`Could not save your progress: ${err?.message || "Unknown error"}. Please try again.`);
    }
  };

  // Step 6→7: Run the AI tier analysis
  const handleSurveyNext = async () => {
    setStep(7);
    setTierRevealError(null);
    setGeneratingRoles(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-career-analysis", {
        body: {
          profile_data: profileData,
          dream_roles: profileData.dream_roles || [],
        },
      });

      if (error) throw error;

      const analysisRoles = data?.roles || [];
      setGeneratedRoles(analysisRoles);
      setQualificationLevel(data?.qualification_level || "Not determined");
      setOverallAssessment(data?.overall_assessment || "");

      // Save roles to DB — insert first, then delete old to avoid data loss window
      if (user && analysisRoles.length > 0) {
        const { data: existingRoles } = await supabase
          .from("career_roles")
          .select("id")
          .eq("user_id", user.id);

        const existingIds = existingRoles?.map((r) => r.id) || [];

        const { error: insertError } = await supabase
          .from("career_roles")
          .insert(analysisRoles.map((r) => ({
            title: r.title,
            tier: r.tier,
            match_score: r.readiness_score,
            readiness_score: r.readiness_score,
            matched_skills: r.matched_skills || [],
            missing_skills: r.missing_skills || [],
            skills_gap: r.missing_skills || [],
            alignment_to_goal: r.alignment_to_goal || "",
            user_id: user.id,
          })));

        if (insertError) throw insertError;

        if (existingIds.length > 0) {
          await supabase.from("career_roles").delete().in("id", existingIds);
        }
      }

      if (existingProfileId) {
        await supabase.from("profiles").update({
          skill_gaps: data?.skill_gaps || [],
          qualification_level: data?.qualification_level || "",
          overall_assessment: data?.overall_assessment || "",
          last_reality_check_date: new Date().toISOString().split("T")[0],
          onboarding_step: 7,
        }).eq("id", existingProfileId);
      }
    } catch (err) {
      console.error("Career analysis error:", err);
      setTierRevealError("Career analysis failed. Please go back and try again.");
    }

    setGeneratingRoles(false);
  };

  // Final step: save everything, mark complete, navigate
  const handleFinalise = async () => {
    setFinalising(true);

    const allSkills = [
      ...(profileData.hard_skills || []),
      ...(profileData.tools_software || []),
      ...(profileData.technical_skills || []),
      ...(profileData.analytical_skills || []),
      ...(profileData.communication_skills || []),
      ...(profileData.leadership_skills || []),
      ...(profileData.skills || []),
    ];

    let targetProfileId = existingProfileId;

    if (!targetProfileId) {
      // The user somehow reached the end without a profile row saved!
      // Attempt to save it now explicitly.
      const rawPayload = { ...profileData, onboarding_step: 99 };
      const payload = cleanProfilePayload(rawPayload);
      Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

      const { data, error } = await supabase.from("profiles").insert({
        id: user.id,
        ...payload,
        full_name: profileData.full_name || user.user_metadata?.full_name || "User",
      }).select();

      if (error || !data?.[0]) {
        console.error("Critical error saving profile on finalise:", error);
        alert(`Could not create profile. Reason: ${error?.message || "Unknown error"}. Please check console.`);
        setFinalising(false);
        return;
      }
      
      targetProfileId = data[0].id;
      setExistingProfileId(targetProfileId);
    }

    // Capture existing IDs before inserting new data — delete only after inserts succeed
    const [existingExpRes, existingProjRes, existingCertRes, existingTaskRes] = await Promise.all([
      supabase.from("experiences").select("id").eq("user_id", user.id),
      supabase.from("projects").select("id").eq("user_id", user.id),
      supabase.from("certifications").select("id").eq("user_id", user.id),
      supabase.from("tasks").select("id").eq("user_id", user.id),
    ]);
    const oldExpIds = existingExpRes.data?.map((r) => r.id) || [];
    const oldProjIds = existingProjRes.data?.map((r) => r.id) || [];
    const oldCertIds = existingCertRes.data?.map((r) => r.id) || [];
    const oldTaskIds = existingTaskRes.data?.map((r) => r.id) || [];

    // Save experiences, projects, certifications
    const promises = [];

    if (experiences.length > 0) {
      promises.push(
        supabase.from("experiences").insert(
          experiences.map((e) => ({ ...e, user_id: user.id }))
        )
      );
    }

    if (projects.length > 0) {
      promises.push(
        supabase.from("projects").insert(
          projects.map((proj) => ({
            name: proj.name,
            description: proj.description,
            url: proj.url,
            skills_demonstrated: proj.skills_demonstrated || [],
            user_id: user.id,
          }))
        )
      );
    }

    if (certifications.length > 0) {
      promises.push(
        supabase.from("certifications").insert(
          certifications.map((cert) => ({
            name: cert.name,
            issuer: cert.issuer,
            date_earned: cert.date_earned,
            user_id: user.id,
          }))
        )
      );
    }

    // Generate personalized tasks via Edge Function
    try {
      const { data: taskData, error: taskInvokeError } = await supabase.functions.invoke("generate-tasks", {
        body: { context: "onboarding initial tasks" },
      });
      if (taskInvokeError) throw taskInvokeError;
      if (taskData?.tasks?.length > 0) {
        promises.push(
          supabase.from("tasks").insert(
            taskData.tasks.map((t) => ({
              title: t.title,
              description: t.description,
              category: t.category || "application",
              priority: t.priority || "medium",
              role_title: t.role_title || null,
              is_complete: false,
              user_id: user.id,
            }))
          )
        );
      }
    } catch (err) {
      console.error("Task generation error during onboarding:", err);
      // Fallback: insert basic tasks if LLM fails
      promises.push(
        supabase.from("tasks").insert([
          { title: "Update your CV for target roles", description: "Tailor your CV based on skill gaps.", category: "cv", priority: "high", is_complete: false, user_id: user.id },
          { title: "Research target companies", description: "Find active job postings.", category: "application", priority: "high", is_complete: false, user_id: user.id },
        ])
      );
    }

    try {
      await Promise.all(promises);
    } catch (err) {
      console.error("Error saving onboarding data:", err);
      setFinaliseError(`Some data could not be saved: ${err?.message || "Unknown error"}. Please try again.`);
      setFinalising(false);
      return;
    }

    // Delete old records by ID — only after new data is safely inserted
    const deleteOps = [];
    if (oldExpIds.length > 0) deleteOps.push(supabase.from("experiences").delete().in("id", oldExpIds));
    if (oldProjIds.length > 0) deleteOps.push(supabase.from("projects").delete().in("id", oldProjIds));
    if (oldCertIds.length > 0) deleteOps.push(supabase.from("certifications").delete().in("id", oldCertIds));
    if (oldTaskIds.length > 0) deleteOps.push(supabase.from("tasks").delete().in("id", oldTaskIds));
    if (deleteOps.length > 0) await Promise.all(deleteOps);

    // Mark onboarding complete
    const finalRawPayload = {
      ...profileData,
      skills: [...new Set(allSkills)],
      onboarding_complete: true,
      onboarding_step: 8,
    };
    const finalPayload = cleanProfilePayload(finalRawPayload);
    Object.keys(finalPayload).forEach(key => finalPayload[key] === undefined && delete finalPayload[key]);

    const { error: finalUpdateError } = await supabase.from("profiles").update(finalPayload).eq("id", targetProfileId);
    if (finalUpdateError) {
      console.error("Failed to mark onboarding complete:", finalUpdateError);
      setFinaliseError(`Could not complete setup: ${finalUpdateError.message}. Please try again.`);
      setFinalising(false);
      return;
    }

    // Remove all cached query data so Home fetches fresh — invalidateQueries only marks stale
    // but leaves old data visible, which can trigger the onboarding redirect guard
    queryClient.removeQueries();

    setFinalising(false);
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
      {saveError && (
        <div className="mx-auto max-w-lg mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {saveError}
        </div>
      )}
      {finaliseError && (
        <div className="mx-auto max-w-lg mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{finaliseError}</p>
          <button onClick={handleFinalise} className="mt-2 text-xs font-medium text-red-800 underline underline-offset-2">
            Retry
          </button>
        </div>
      )}
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
        <>
          {tierRevealError && (
            <div className="mx-auto max-w-lg mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between gap-3">
              <p className="text-sm text-red-700">{tierRevealError}</p>
              <button onClick={() => { setTierRevealError(null); goTo(6); }} className="text-xs font-medium text-red-800 underline underline-offset-2 whitespace-nowrap">
                Go back
              </button>
            </div>
          )}
          <StepTierReveal
            roles={generatedRoles}
            qualificationLevel={qualificationLevel}
            overallAssessment={overallAssessment}
            generating={generatingRoles}
            onNext={handleFinalise}
            onBack={() => goTo(6)}
          />
        </>
      )}
    </OnboardingShell>
  );
}