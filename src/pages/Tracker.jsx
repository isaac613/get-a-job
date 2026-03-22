import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import ApplicationRow from "../components/tracker/ApplicationRow";

export default function Tracker() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState("all");
  const [newApp, setNewApp] = useState({ role_title: "", company: "", status: "interested", job_description: "" });

  const [jobUrl, setJobUrl] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [addingApp, setAddingApp] = useState(false);

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["applications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("applications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const handleAdd = async () => {
    if (!newApp.role_title) return;
    setAddingApp(true);
    const jd = jobDescription || newApp.job_description || "";

    // Tier is not classified at creation time — Career Roadmap analysis assigns tiers.
    // null means unclassified; add the role to Career Roadmap to get tier classification.
    const tier = null;

    const { error } = await supabase.from("applications").insert({
      user_id: user.id,
      ...newApp,
      tier,
      ...(jd && { job_description: jd }),
    });
    if (error) {
      console.error("Error adding application:", error);
      setImportError(`Could not add application: ${error.message}`);
      setAddingApp(false);
      return;
    }

    setNewApp({ role_title: "", company: "", status: "interested", job_description: "" });
    setJobUrl("");
    setJobDescription("");
    setShowAdd(false);
    setAddingApp(false);
    queryClient.invalidateQueries({ queryKey: ["applications"] });
  };

  const handleImportFromUrl = async () => {
    if (!jobUrl.trim()) return;
    setImporting(true);
    setImportError("");
    // Job URL import is not yet supported — requires web scraping capabilities
    setImportError("Paste the job description text directly when adding a new application. URL-based import is planned for a future update.");
    setImporting(false);
  };

  const filtered =
    filter === "all"
      ? applications
      : applications.filter((a) => a.status === filter);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="w-5 h-5 animate-spin text-[#A3A3A3]" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0A0A0A]">
            Application Tracker
          </h1>
          <p className="text-sm text-[#A3A3A3] mt-1">
            Track every role, action, and outcome.
          </p>
        </div>
        <Button
          onClick={() => setShowAdd(true)}
          className="bg-[#0A0A0A] hover:bg-[#262626] text-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Application
        </Button>
      </div>

      {/* How to use guide */}
      <div className="bg-[#0A0A0A] rounded-xl p-5 mb-6 text-white">
        <p className="text-xs font-bold uppercase tracking-wider text-[#A3A3A3] mb-2">How to use this tracker</p>
        <p className="text-sm text-white leading-relaxed mb-3">
          Every application has a <strong>7-step process</strong>. Open any application and go to the <strong>"📋 Steps"</strong> tab. Work through each step before submitting — candidates who skip steps are the ones who get ignored.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-[11px] text-[#A3A3A3]">
          <div className="bg-white/5 rounded-lg px-3 py-2">
            <p className="text-white font-semibold mb-0.5">Steps 1–2</p>
            <p>Qualify yourself. Dissect the job description. Know the role before applying.</p>
          </div>
          <div className="bg-white/5 rounded-lg px-3 py-2">
            <p className="text-white font-semibold mb-0.5">Steps 3–5</p>
            <p>Tailor your CV, map skill evidence, and find a referral contact at the company.</p>
          </div>
          <div className="bg-white/5 rounded-lg px-3 py-2">
            <p className="text-white font-semibold mb-0.5">Steps 6–7</p>
            <p>Submit your application, then prep for the interview with STAR-format answers.</p>
          </div>
          <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg px-3 py-2">
            <p className="text-amber-300 font-semibold mb-0.5">⭐ Referral = your biggest edge</p>
            <p className="text-amber-200/80">Many companies offer referral bonuses to employees when a referred candidate gets hired. They're incentivised to get you in.</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {["all", "interested", "preparing", "applied", "interviewing", "offer", "rejected"].map(
          (s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filter === s
                  ? "bg-[#0A0A0A] text-white"
                  : "bg-white border border-[#E5E5E5] text-[#525252] hover:bg-[#F5F5F5]"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          )
        )}
      </div>

      {/* Applications */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E5E5E5] p-8 text-center">
          <p className="text-sm text-[#525252]">
            {applications.length === 0
              ? "No applications yet. Add one manually or use the Career Roadmap to auto-create tracked roles."
              : "No applications match this filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => (
            <ApplicationRow
              key={app.id}
              app={app}
              onUpdate={() =>
                queryClient.invalidateQueries({ queryKey: ["applications"] })
              }
            />
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Add Application
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* URL Import */}
            <div className="bg-[#F5F5F5] rounded-lg p-3">
              <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">
                Import from LinkedIn / Glassdoor URL
              </label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  value={jobUrl}
                  onChange={(e) => setJobUrl(e.target.value)}
                  placeholder="Paste job posting URL..."
                  className="text-sm bg-white"
                />
                <Button
                  onClick={handleImportFromUrl}
                  disabled={importing || !jobUrl.trim()}
                  className="bg-[#0A0A0A] hover:bg-[#262626] whitespace-nowrap"
                  size="sm"
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-3.5 h-3.5 mr-1" />Auto-fill</>}
                </Button>
              </div>
              {importError && <p className="text-xs text-red-500 mt-1.5">{importError}</p>}
              {newApp.job_description && <p className="text-xs text-emerald-600 mt-1.5">✓ Job details auto-filled below</p>}
            </div>

            <div className="text-[11px] text-center text-[#A3A3A3] font-medium">— or fill in manually —</div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">
                Role Title
              </label>
              <Input
                value={newApp.role_title}
                onChange={(e) =>
                  setNewApp({ ...newApp, role_title: e.target.value })
                }
                className="mt-1"
                placeholder="e.g. Junior Data Analyst"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">
                Company
              </label>
              <Input
                value={newApp.company}
                onChange={(e) =>
                  setNewApp({ ...newApp, company: e.target.value })
                }
                className="mt-1"
                placeholder="e.g. Google"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">
                Job Description <span className="text-[#A3A3A3] normal-case font-normal">(optional — AI will use this to set the tier)</span>
              </label>
              <Textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the job description here..."
                rows={5}
                className="mt-1 text-sm"
              />
              {!jobDescription && !newApp.job_description && (
                <p className="text-[11px] text-[#A3A3A3] mt-1">Without AI classification, tier will be unset. Add the role to your Career Roadmap to get tier classification.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAdd(false)}
              className="text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={addingApp || !newApp.role_title}
              className="bg-[#0A0A0A] hover:bg-[#262626] text-sm"
            >
              {addingApp ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing...</> : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}