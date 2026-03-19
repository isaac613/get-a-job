import React, { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Loader2, Brain } from "lucide-react";
import { toast } from "sonner";
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
  const { user } = useAuth();
  const [generating, setGenerating] = useState(false);

  const { data: roles, isLoading } = useQuery({
    queryKey: ["careerRoles", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("career_roles").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    initialData: [],
  });

  const { data: profiles } = useQuery({
    queryKey: ["userProfile", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    initialData: [],
  });

  const { data: experiences } = useQuery({
    queryKey: ["experiences", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("experiences").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    initialData: [],
  });

  const { data: courses } = useQuery({
    queryKey: ["courses", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      // TODO: Add courses table in migration if needed
      return [];
    },
    enabled: !!user?.id,
    initialData: [],
  });

  const { data: certifications } = useQuery({
    queryKey: ["certifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from("certifications").select("*").eq("user_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
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
      // TODO: Phase 5 — LLM roadmap generation via Edge Function
      // For now, show a message that this feature requires Edge Functions
      toast.info("AI-powered roadmap generation will be available after Edge Functions are configured (Phase 5).");

      queryClient.invalidateQueries({ queryKey: ["careerRoles"] });
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
    } finally {
      setGenerating(false);
    }
  };

  const handleTrack = async (role) => {
    await supabase.from("applications").insert({
      user_id: user.id,
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