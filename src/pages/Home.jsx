import React, { useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowRight, Loader2, CheckCircle2, XCircle, AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import SkillGapCourses from "../components/dashboard/SkillGapCourses";
import JobMatchChecker from "../components/dashboard/JobMatchChecker";

export default function Home() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [resetConfirming, setResetConfirming] = useState(false);
  const [resetError, setResetError] = useState(null);

  const { data: profiles = [], isLoading: loadingProfile, isFetched: profileFetched, isError: profileError } = useQuery({
    queryKey: ["userProfile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: roles = [], isLoading: loadingRoles, isError: rolesError } = useQuery({
    queryKey: ["careerRoles", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("career_roles").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: applications = [], isLoading: loadingApps, isError: appsError } = useQuery({
    queryKey: ["applications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("applications").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: experiences = [] } = useQuery({
    queryKey: ["experiences", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("experiences").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const profile = profiles?.[0] || null;
  const isLoading = loadingProfile || loadingRoles || loadingApps;

  React.useEffect(() => {
    if (!user || !profileFetched) return;
    if (profileError) return; // don't redirect if the query failed
    if (profiles?.length === 0) {
      navigate(createPageUrl("Onboarding"));
    } else if (profile && !profile.onboarding_complete) {
      navigate(createPageUrl("Onboarding"));
    }
  }, [user, profileFetched, profileError, profile, profiles, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="w-5 h-5 animate-spin text-[#A3A3A3]" />
      </div>
    );
  }

  const tier1Role = roles.find((r) => r.tier === "tier_1");
  const matchedSkills = tier1Role?.matched_skills || [];
  const missingSkills = tier1Role?.missing_skills || [];
  const skillGaps = Array.isArray(profile?.skill_gaps) ? profile.skill_gaps : [];
  const pendingTasks = tasks.filter((t) => !t.is_complete);
  const activeApps = applications.filter((a) => !["rejected", "withdrawn", "offer"].includes(a.status));
  const score = tier1Role?.readiness_score ?? (tier1Role?.match_percentage != null ? tier1Role.match_percentage / 100 : null);

  const handleResetOnboarding = async () => {
    if (!profile?.id) return;
    if (!resetConfirming) {
      setResetConfirming(true);
      return;
    }
    setResetConfirming(false);
    setResetError(null);
    const { error: rpcError } = await supabase.rpc("reset_user_data", {
      p_user_id: user.id,
    });
    if (rpcError) {
      console.error("Failed to reset user data:", rpcError);
      setResetError("Reset failed. Please try again.");
      return;
    }
    queryClient.removeQueries({ queryKey: ["userProfile"] });
    queryClient.removeQueries({ queryKey: ["careerRoles"] });
    queryClient.removeQueries({ queryKey: ["tasks"] });
    queryClient.removeQueries({ queryKey: ["applications"] });
    queryClient.removeQueries({ queryKey: ["experiences"] });
    navigate(createPageUrl("Onboarding"));
  };

  return (
    <motion.div
      className="max-w-4xl mx-auto px-6 py-8"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {resetError && (
        <div className="flex items-center gap-2 mb-6 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {resetError}
        </div>
      )}
      {/* Data load error banner */}
      {(rolesError || appsError) && (
        <div className="flex items-center gap-2 mb-6 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Some data failed to load. Refresh the page to try again.
        </div>
      )}

      {/* Header */}
      <div className="mb-8 flex justify-between items-start">
        <div>
          <p className="text-xs uppercase tracking-wider text-[#A3A3A3] font-medium mb-1">Career Operating System</p>
          <h1 className="text-2xl font-bold tracking-tight text-[#0A0A0A]">
            Where do I stand?
          </h1>
          {profile?.last_reality_check_date && (
            <p className="text-xs text-[#A3A3A3] mt-1">
              Last analysis: {profile.last_reality_check_date}
            </p>
          )}
        </div>
        {resetConfirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-600 font-medium">This deletes all your data.</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleResetOnboarding}
              className="gap-1.5 bg-red-600 hover:bg-red-700"
            >
              <RotateCcw className="w-3 h-3" />
              Confirm Reset
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResetConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetOnboarding}
            className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Onboarding
          </Button>
        )}
      </div>

      {/* Overall Assessment */}
      {profile?.overall_assessment ? (
        <div className="bg-white rounded-xl border border-[#E5E5E5] p-5 mb-5">
          <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-2">Assessment</p>
          <p className="text-sm text-[#525252] leading-relaxed">{profile.overall_assessment}</p>
        </div>
      ) : roles.length === 0 ? (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-5 mb-5">
          <p className="text-sm font-medium text-amber-800">No roadmap generated yet.</p>
          <p className="text-xs text-amber-700 mt-1">Go to Career Roadmap → Generate Roadmap to get your qualification assessment.</p>
        </div>
      ) : null}

      {/* Reality Check Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">

        {/* Qualification Level */}
        <div className="bg-white rounded-xl border border-[#E5E5E5] p-5">
          <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-3">Qualification Level</p>
          {profile?.qualification_level ? (
            <p className="text-sm text-[#0A0A0A] font-medium leading-snug">{profile.qualification_level}</p>
          ) : (
            <p className="text-sm text-[#A3A3A3]">Not yet determined</p>
          )}
          {profile?.field_of_study && (
            <p className="text-xs text-[#A3A3A3] mt-2">
              {profile.education_level?.replaceAll("_", " ")} · {profile.field_of_study}
            </p>
          )}
        </div>

        {/* Closest Tier 1 Role */}
        <div className="bg-white rounded-xl border border-[#E5E5E5] p-5">
          <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-3">Closest Tier 1 Role</p>
          {tier1Role ? (
            <>
              <p className="text-sm font-semibold text-[#0A0A0A]">{tier1Role.title}</p>
              {score !== null && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${score >= 0.45 ? "bg-emerald-500" : score >= 0.25 ? "bg-amber-400" : "bg-red-400"}`}
                      style={{ width: `${Math.round(score * 100)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-semibold ${score >= 0.45 ? "text-emerald-600" : score >= 0.25 ? "text-amber-600" : "text-red-500"}`}>
                    {Math.round(score * 100)}%
                  </span>
                </div>
              )}
              {tier1Role.alignment_to_goal && (
                <p className="text-xs text-[#A3A3A3] mt-2 leading-relaxed">{tier1Role.alignment_to_goal}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-[#A3A3A3]">No Tier 1 roles yet</p>
          )}
        </div>

        {/* Skills: Confirmed vs Missing */}
        <div className="bg-white rounded-xl border border-[#E5E5E5] p-5">
          <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-3">
            Skills — Confirmed vs Missing
          </p>
          {tier1Role ? (
            <div className="space-y-3">
              {matchedSkills.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-600 font-semibold mb-1.5">Confirmed</p>
                  <div className="flex flex-wrap gap-1.5">
                    {matchedSkills.slice(0, 6).map((s, i) => (
                      <span key={i} className="flex items-center gap-1 text-[11px] px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md">
                        <CheckCircle2 className="w-3 h-3" /> {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {missingSkills.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-red-500 font-semibold mb-1.5">Missing</p>
                  <div className="flex flex-wrap gap-1.5">
                    {missingSkills.slice(0, 6).map((s, i) => (
                      <span key={i} className="flex items-center gap-1 text-[11px] px-2 py-0.5 bg-red-50 text-red-600 rounded-md">
                        <XCircle className="w-3 h-3" /> {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[#A3A3A3]">Generate your roadmap to see skill analysis.</p>
          )}
        </div>

        {/* Execution Status */}
        <div className="bg-white rounded-xl border border-[#E5E5E5] p-5">
          <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-3">Execution Status</p>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#525252]">Active Applications</span>
              <span className="text-sm font-semibold text-[#0A0A0A]">{activeApps.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#525252]">Pending Tasks</span>
              <span className={`text-sm font-semibold ${pendingTasks.length > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {pendingTasks.length}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#525252]">Skill Gaps Identified</span>
              <span className={`text-sm font-semibold ${skillGaps.length > 0 ? "text-red-500" : "text-emerald-600"}`}>
                {skillGaps.length}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#525252]">5-Year Target</span>
              <span className="text-xs text-[#525252] text-right max-w-[140px] truncate">
                {profile?.five_year_role || "Not set"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Skill Gaps */}
      {skillGaps.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E5E5E5] p-5 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Identified Skill Gaps</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {skillGaps.map((gap, i) => (
              <span key={i} className="text-xs px-2.5 py-1 bg-amber-50 border border-amber-100 text-amber-700 rounded-lg">
                {gap}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Job Match Checker */}
      <JobMatchChecker />

      {/* Course Recommendations */}
      {skillGaps.length > 0 && <SkillGapCourses skillGaps={skillGaps} />}

      {skillGaps.length > 0 && <div className="h-5" />}

      {/* Next Action */}
      {pendingTasks.length > 0 && (
        <div className="bg-[#0A0A0A] rounded-xl p-5 mb-6">
          <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium mb-2">Next Assigned Action</p>
          <p className="text-sm text-white font-medium">{pendingTasks[0].title}</p>
          {pendingTasks[0].description && (
            <p className="text-xs text-[#A3A3A3] mt-1 leading-relaxed">{pendingTasks[0].description}</p>
          )}
          <Link to={createPageUrl("Tasks")} className="inline-flex items-center gap-1 text-xs text-[#A3A3A3] hover:text-white mt-3 transition-colors">
            View all tasks <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Career Roadmap", page: "CareerRoadmap", desc: "Tier-classified roles with reasoning" },
          { label: "AI Career Agent", page: "CareerAgent", desc: "Get evidence-based guidance" },
          { label: "Application Tracker", page: "Tracker", desc: "7-step disciplined application flow" },
        ].map((link) => (
          <Link
            key={link.page}
            to={createPageUrl(link.page)}
            className="bg-white rounded-xl border border-[#E5E5E5] p-4 hover:border-[#D4D4D4] transition-colors group"
          >
            <p className="text-sm font-semibold text-[#0A0A0A]">{link.label}</p>
            <p className="text-xs text-[#A3A3A3] mt-1">{link.desc}</p>
            <ArrowRight className="w-4 h-4 text-[#A3A3A3] mt-3 group-hover:translate-x-1 transition-transform" />
          </Link>
        ))}
      </div>
    </motion.div>
  );
}