import React, { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, Linkedin, RefreshCw, ExternalLink, Briefcase, MapPin, CheckCircle2, PlusCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

function JobCard({ job }) {
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const handleAddToTracker = async () => {
    setAdding(true);
    await supabase.from("applications").insert({
      user_id: user.id,
      role_title: job.title,
      company: job.company,
      tier: job.match_score >= 70 ? "tier_1" : "tier_2",
      qualification_score: job.match_score / 100,
      status: "interested",
      cv_skills_emphasized: job.matched_skills || [],
      skills_required: (job.missing_skills || []).map(s => ({ skill_name: s, status: "missing" })),
      job_description: job.job_description || "",
      notes: job.why_good_fit || "",
    });
    queryClient.invalidateQueries({ queryKey: ["applications"] });
    setAdding(false);
    setAdded(true);
  };

  const matchColor = job.match_score >= 75 ? "text-emerald-600 bg-emerald-50" : job.match_score >= 50 ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";
  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] p-5 hover:border-[#D4D4D4] transition-all">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-[#0A0A0A]">{job.title}</h3>
          <p className="text-sm text-[#525252] mt-0.5">{job.company}</p>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${matchColor}`}>
          {job.match_score}% match
        </span>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-[#A3A3A3] mb-3">
        {job.location && (
          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{job.location}</span>
        )}
      </div>

      <p className="text-xs text-[#525252] leading-relaxed mb-3">{job.why_good_fit}</p>

      {job.missing_skills?.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-semibold mb-1.5">Skill Gaps</p>
          <div className="flex flex-wrap gap-1.5">
            {job.missing_skills.map((skill, i) => (
              <span key={i} className="px-2 py-0.5 bg-red-50 text-red-600 text-xs rounded-full">{skill}</span>
            ))}
          </div>
        </div>
      )}

      {job.matched_skills?.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-semibold mb-1.5">Your Strengths</p>
          <div className="flex flex-wrap gap-1.5">
            {job.matched_skills.slice(0, 5).map((skill, i) => (
              <span key={i} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs rounded-full">{skill}</span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#F5F5F5]">
        {job.linkedin_search_url ? (
          <a
            href={job.linkedin_search_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[#0A66C2] hover:underline font-medium"
          >
            <Linkedin className="w-3.5 h-3.5" />
            Search on LinkedIn
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : <span />}

        <Button
          size="sm"
          onClick={handleAddToTracker}
          disabled={adding || added}
          className={added ? "bg-emerald-600 hover:bg-emerald-600 text-white" : "bg-[#0A0A0A] hover:bg-[#262626] text-white"}
        >
          {adding ? (
            <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Adding...</>
          ) : added ? (
            <><CheckCircle2 className="w-3 h-3 mr-1" />Added</>
          ) : (
            <><PlusCircle className="w-3 h-3 mr-1" />Add to Tracker</>
          )}
        </Button>
      </div>
    </div>
  );
}

export default function JobSuggestions() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [lastGenerated, setLastGenerated] = useState(null);
  const [error, setError] = useState(null);

  const { data: profileData } = useQuery({
    queryKey: ["userProfile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id);
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (profileData) setProfile(profileData);
  }, [profileData]);

  const generateSuggestions = async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);

    // TODO: Phase 5 — LLM job suggestion generation via Edge Function
    // For now, show placeholder message
    setLoading(false);
    setError("AI-powered job suggestions will be available after Edge Functions are configured (Phase 5). For now, use the Career Roadmap to explore matching roles.");
  };

  const noProfile = !profile && !loading;
  const noSkills = profile && (profile.hard_skills || []).length === 0 && (profile.technical_skills || []).length === 0;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Linkedin className="w-5 h-5 text-[#0A66C2]" />
          <h1 className="text-2xl font-bold tracking-tight text-[#0A0A0A]">Job Suggestions</h1>
        </div>
        <p className="text-sm text-[#A3A3A3]">
          Personalised job role suggestions based on your profile, skills, and experience — with real LinkedIn search links.
        </p>
      </div>

      {noProfile && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
          Complete your onboarding first so we can generate personalised suggestions.
        </div>
      )}

      {noSkills && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700 mb-6">
          Add skills to your profile (via Add Information) to get better suggestions.
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        {lastGenerated && (
          <p className="text-xs text-[#A3A3A3]">Last generated at {lastGenerated}</p>
        )}
        <div className={lastGenerated ? "ml-auto" : ""}>
          <Button
            onClick={generateSuggestions}
            disabled={loading || !profile}
            className="bg-[#0A0A0A] hover:bg-[#262626]"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Finding Jobs...</>
            ) : jobs.length > 0 ? (
              <><RefreshCw className="w-4 h-4 mr-2" />Refresh Suggestions</>
            ) : (
              <><Linkedin className="w-4 h-4 mr-2" />Generate Job Suggestions</>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700 mb-6">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-[#A3A3A3] mx-auto mb-4" />
          <p className="text-sm text-[#525252] font-medium">Searching LinkedIn & job boards...</p>
          <p className="text-xs text-[#A3A3A3] mt-1">Analysing your profile and finding matches. This takes ~15 seconds.</p>
        </div>
      )}

      {jobs.length > 0 && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {jobs.map((job, i) => (
            <JobCard key={i} job={job} />
          ))}
        </div>
      )}

      {jobs.length === 0 && !loading && !error && profile && (
        <div className="text-center py-16 bg-white rounded-xl border border-[#E5E5E5]">
          <Briefcase className="w-10 h-10 text-[#A3A3A3] mx-auto mb-4" />
          <p className="text-sm font-medium text-[#525252]">No suggestions yet</p>
          <p className="text-xs text-[#A3A3A3] mt-1">Click "Generate Job Suggestions" to find roles that match your profile</p>
        </div>
      )}
    </div>
  );
}