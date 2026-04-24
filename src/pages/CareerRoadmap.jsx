import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Loader2, Brain, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import GeneratingBanner from "@/components/ui/GeneratingBanner";
import RoleCard from "../components/roadmap/RoleCard";
import LearningPaths from "../components/roadmap/LearningPaths";
import ProgressVisualization from "../components/roadmap/ProgressVisualization";

const ROADMAP_MESSAGES = [
  "Searching LinkedIn & Glassdoor for real job postings…",
  "Matching your skills to market requirements…",
  "Calculating skill match scores per role…",
  "Identifying your skill gaps…",
  "Classifying roles into tiers…",
  "Ranking roles by readiness & alignment…",
  "Almost done — finalising your roadmap…",
];

export default function CareerRoadmap() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [tracking, setTracking] = useState(false);

  const { data: roles = [], isLoading, isError: rolesError } = useQuery({
    queryKey: ["careerRoles", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("career_roles").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["userProfile", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: experiences = [] } = useQuery({
    queryKey: ["experiences", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("experiences").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const { data: certifications = [] } = useQuery({
    queryKey: ["certifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("certifications").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const profile = profiles?.[0];

  const tier1 = roles.filter((r) => r.tier === "tier_1");
  const tier2 = roles.filter((r) => r.tier === "tier_2");
  const tier3 = roles.filter((r) => r.tier === "tier_3");
  const uncategorized = roles.filter((r) => !["tier_1", "tier_2", "tier_3"].includes(r.tier));

  const handleGenerate = async () => {
    if (!profile) return;
    setGenerating(true);
    try {
      // Direct fetch to bypass supabase.functions.invoke client-side errors
      // Use refreshSession to ensure we have a fresh, non-expired token
      const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession();
      const accessToken = sessionData?.session?.access_token;
      if (sessionError || !accessToken) throw new Error("Session expired. Please log out and log back in.");

      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-career-analysis`;
      const response = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ dream_roles: profile?.five_year_role ? [profile.five_year_role] : [] }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || data?.msg || `HTTP ${response.status}`);
      if (data?.error) throw new Error(data.error);

      // Atomically replace career roles using a DB transaction via RPC
      if (data?.roles?.length > 0) {
        const rolesPayload = data.roles.map((r) => ({
          title: r.title,
          tier: r.tier,
          match_score: r.readiness_score,
          readiness_score: r.readiness_score,
          goal_alignment_score: r.goal_alignment_score ?? null,
          matched_skills: r.matched_skills || [],
          missing_skills: r.missing_skills || [],
          skills_gap: r.missing_skills || [],
          alignment_to_goal: r.alignment_to_goal || "",
          alignment_reason: r.alignment_reason || "",
          reasoning: r.reasoning || "",
          action_items: r.action_items || [],
        }));

        const { error: rpcError } = await supabase.rpc("replace_career_roles", {
          p_user_id: user.id,
          p_roles: rolesPayload,
        });

        if (rpcError) throw rpcError;

        // Keep the "Last updated" stamp fresh on the profile
        await supabase
          .from("profiles")
          .update({
            last_reality_check_date: new Date().toLocaleDateString("sv"),
            qualification_level: data?.qualification_level || profile?.qualification_level || "",
            overall_assessment: data?.overall_assessment || profile?.overall_assessment || "",
            skill_gaps: data?.skill_gaps || [],
          })
          .eq("id", user.id);
      }

      queryClient.invalidateQueries({ queryKey: ["careerRoles"] });
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      toast.success("Analysis refreshed.");
    } catch (err) {
      console.error("Roadmap generation error:", err);
      toast.error(`Failed to generate roadmap: ${err.message || 'Please try again.'}`);
    } finally {
      setGenerating(false);
    }
  };


  const handleTrack = async (role) => {
    if (tracking) return;
    setTracking(true);
    try {
    const { data: existing } = await supabase
      .from("applications")
      .select("id")
      .eq("user_id", user.id)
      .ilike("role_title", role.title)
      .limit(1);

    if (existing?.length > 0) {
      toast.info("This role is already in your tracker.");
      navigate(createPageUrl("Tracker"));
      return;
    }

    const { error } = await supabase.from("applications").insert({
      user_id: user.id,
      role_title: role.title,
      tier: role.tier,
      status: "interested",
    });
    if (error) {
      console.error("Failed to add to tracker:", error);
      toast.error("Failed to add to tracker. Please try again.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["applications"] });
    navigate(createPageUrl("Tracker"));
    } finally {
      setTracking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="w-5 h-5 animate-spin text-[#A3A3A3]" />
      </div>
    );
  }

  if (rolesError) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4" />
          Failed to load your career roadmap. Refresh the page to try again.
        </div>
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
          {profile?.last_reality_check_date && roles.length > 0 && (
            <p className="text-xs text-[#A3A3A3] mt-1">
              Last updated: {new Date(profile.last_reality_check_date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
            </p>
          )}
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
            ) : roles.length > 0 ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh Analysis
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

      {generating && <GeneratingBanner messages={ROADMAP_MESSAGES} subtitle="Generating your roadmap — this takes ~30–60 seconds" />}

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
            courses={[]}
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
            Tier 1 — Your Move
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
            Tier 2 — Plan B
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
            Tier 3 — Work Toward
          </h2>
          <div className="space-y-3">
            {tier3.map((role) => (
              <RoleCard key={role.id} role={role} onTrack={handleTrack} />
            ))}
          </div>
        </div>
      )}

      {uncategorized.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs uppercase tracking-wider text-[#A3A3A3] font-semibold mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            Other Roles
          </h2>
          <div className="space-y-3">
            {uncategorized.map((role) => (
              <RoleCard key={role.id} role={role} onTrack={handleTrack} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}