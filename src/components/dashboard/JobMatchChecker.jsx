import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

import { Sparkles, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Plus, FileText, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const LOADING_MESSAGES = [
  "Parsing job requirements...",
  "Matching your skills...",
  "Evaluating your experience...",
  "Calculating fit score...",
  "Building your assessment...",
];

export default function JobMatchChecker({ profile, experiences }) {
  const { user } = useAuth();
  const [mode, setMode] = useState("text"); // "url" or "text"
  const [url, setUrl] = useState("");
  const [jobText, setJobText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [addingToTracker, setAddingToTracker] = useState(false);
  const [addedToTracker, setAddedToTracker] = useState(false);
  const msgInterval = useRef(null);

  useEffect(() => {
    if (loading) {
      let i = 0;
      msgInterval.current = setInterval(() => {
        i = (i + 1) % LOADING_MESSAGES.length;
        setLoadingMsg(LOADING_MESSAGES[i]);
      }, 2500);
    } else {
      clearInterval(msgInterval.current);
    }
    return () => clearInterval(msgInterval.current);
  }, [loading]);

  const handleCheck = async () => {
    const hasInput = mode === "url" ? url.trim() : jobText.trim();
    if (!hasInput) return;

    setLoading(true);
    setLoadingMsg(LOADING_MESSAGES[0]);
    setError("");
    setResult(null);
    setAddedToTracker(false);

    const allSkills = [
      ...(profile?.hard_skills || []),
      ...(profile?.technical_skills || []),
      ...(profile?.tools_software || []),
      ...(profile?.analytical_skills || []),
      ...(profile?.skills || []),
    ];

    const expSummary = (experiences || []).map(e => `${e.title} at ${e.company}`).join(", ");

    const jobSource = mode === "url"
      ? `STEP 1: Fetch and read the full job posting at this exact URL: ${url}\nRead the actual page content. Do NOT infer or guess.`
      : `STEP 1: Use the following job posting text provided directly by the user:\n\n${jobText}`;

    // Call LLM job match analysis via Edge Function
    try {
      const { data, error } = await supabase.functions.invoke("analyze-job-match", {
        body: {
          job_description: mode === "text" ? jobText.trim() : null,
          job_url: mode === "url" ? url.trim() : null,
          mode,
        },
      });

      if (error) throw error;

      setResult({
        job_title: data.job_title || "Job Match Analysis",
        company: data.company || "",
        job_description: data.job_description || (mode === "text" ? jobText.trim() : ""),
        match_score: data.match_score || 0,
        verdict: data.verdict || "Analysis complete.",
        matched_requirements: data.matched_requirements || [],
        missing_requirements: data.missing_requirements || [],
        recommendation: data.recommendation || "",
        source_url: data.source_url || (mode === "url" ? url : null),
      });
      setExpanded(true);
    } catch (err) {
      console.error("Job match error:", err);
      setError(err.message || "Failed to analyze job match.");
    }
    setLoading(false);
  };

  const handleAddToTracker = async () => {
    if (!result) return;
    setAddingToTracker(true);
    await supabase.from("applications").insert({
      user_id: user?.id,
      role_title: result.job_title || "Unknown Role",
      company: result.company || "",
      status: "interested",
      tier: "tier_1",
      job_description: result.job_description || "",
      qualification_score: (result.match_score || 0) / 100,
      notes: result.source_url ? `Source: ${result.source_url}` : "",
    });
    setAddingToTracker(false);
    setAddedToTracker(true);
  };

  const scoreColor = result
    ? result.match_score >= 70 ? "text-emerald-600" : result.match_score >= 45 ? "text-amber-600" : "text-red-500"
    : "";
  const barColor = result
    ? result.match_score >= 70 ? "bg-emerald-500" : result.match_score >= 45 ? "bg-amber-400" : "bg-red-400"
    : "";

  const canSubmit = mode === "url" ? url.trim() : jobText.trim();

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] p-5 mb-5">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-[#0A0A0A]" />
        <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Job Match Checker</p>
      </div>
      <p className="text-xs text-[#525252] mb-3">See exactly how well you match a job — and what's holding you back.</p>

      {/* Mode toggle */}
      <div className="flex gap-1 mb-3 bg-[#F5F5F5] rounded-lg p-1 w-fit">
        <button
          onClick={() => { setMode("text"); setError(""); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${mode === "text" ? "bg-white text-[#0A0A0A] shadow-sm" : "text-[#525252] hover:text-[#0A0A0A]"}`}
        >
          <FileText className="w-3 h-3" /> Paste Text
        </button>
        <button
          onClick={() => { setMode("url"); setError(""); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${mode === "url" ? "bg-white text-[#0A0A0A] shadow-sm" : "text-[#525252] hover:text-[#0A0A0A]"}`}
        >
          <Link className="w-3 h-3" /> URL
        </button>
      </div>

      {mode === "text" ? (
        <div className="mb-2">
          <textarea
            value={jobText}
            onChange={(e) => setJobText(e.target.value)}
            placeholder="Paste the full job description here..."
            className="w-full text-sm border border-[#E5E5E5] rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-[#0A0A0A] min-h-[100px] text-[#0A0A0A] placeholder:text-[#A3A3A3]"
            rows={4}
          />
          <p className="text-[11px] text-[#A3A3A3] mt-1">Tip: Copy the entire job posting from LinkedIn/Glassdoor and paste it here for the most accurate results.</p>
        </div>
      ) : (
        <div className="mb-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste job posting URL..."
            className="text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleCheck()}
          />
          <p className="text-[11px] text-amber-600 mt-1">⚠️ URLs may not work if the job board requires login. Use "Paste Text" for best results.</p>
        </div>
      )}

      <Button
        onClick={handleCheck}
        disabled={loading || !canSubmit}
        className="bg-[#0A0A0A] hover:bg-[#262626] w-full"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
        Analyse Match
      </Button>

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

      {loading && (
        <div className="mt-3 flex items-center gap-3 py-3 px-3 bg-[#F5F5F5] rounded-lg">
          <Loader2 className="w-4 h-4 animate-spin text-[#525252] flex-shrink-0" />
          <p className="text-xs text-[#525252]">{loadingMsg}</p>
        </div>
      )}

      {result && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex-1 min-w-0 pr-3">
              <p className="text-sm font-semibold text-[#0A0A0A]">{result.job_title}{result.company ? ` · ${result.company}` : ""}</p>
              <p className="text-xs text-[#525252] mt-0.5">{result.verdict}</p>
            </div>
            <span className={`text-2xl font-bold flex-shrink-0 ${scoreColor}`}>{result.match_score}%</span>
          </div>
          <div className="h-2 bg-[#F0F0F0] rounded-full overflow-hidden mb-3">
            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${result.match_score}%` }} />
          </div>

          {/* Add to Tracker */}
          <div className="mb-3">
            {addedToTracker ? (
              <div>
                <p className="text-xs text-emerald-600 flex items-center gap-1 mb-1"><CheckCircle2 className="w-3.5 h-3.5" /> Added to Application Tracker</p>
                {(!result.company || result.company.toLowerCase().includes("confidential")) && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">⚠️ The company may be listed as "Confidential" — open the Tracker to update it with the real company name.</p>
                )}
              </div>
            ) : (
              <Button
                onClick={handleAddToTracker}
                disabled={addingToTracker}
                size="sm"
                className="bg-[#0A0A0A] hover:bg-[#262626] text-white text-xs h-8 px-3"
              >
                {addingToTracker ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                Add to Tracker
              </Button>
            )}
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-[#525252] hover:text-[#0A0A0A] font-medium mb-3"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? "Hide breakdown" : "Show full breakdown"}
          </button>

          {expanded && (
            <div className="space-y-4">
              {result.matched_requirements?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-600 font-semibold mb-2">What you bring ✓</p>
                  <div className="space-y-1.5">
                    {result.matched_requirements.map((m, i) => (
                      <div key={i} className="flex gap-2 text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span><span className="font-medium text-[#0A0A0A]">{m.requirement}</span> — <span className="text-[#525252]">{m.reason}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {result.missing_requirements?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-red-500 font-semibold mb-2">What's missing ✗</p>
                  <div className="space-y-1.5">
                    {result.missing_requirements.map((m, i) => (
                      <div key={i} className="flex gap-2 text-xs">
                        <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                        <span><span className="font-medium text-[#0A0A0A]">{m.requirement}</span> — <span className="text-[#525252]">{m.gap}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {result.recommendation && (
                <div className="bg-[#F5F5F5] rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-[#A3A3A3] font-semibold mb-1">Recommendation</p>
                  <p className="text-xs text-[#525252] leading-relaxed">{result.recommendation}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}