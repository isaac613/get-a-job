import React, { useState, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { scoreApplication } from "@/lib/scoreApplication";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Lock, MessageSquare, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import CVManagement from "./CVManagement";
import SkillsRequired from "./SkillsRequired";
import ProjectsProof from "./ProjectsProof";
import NetworkingReferrals from "./NetworkingReferrals";
import InterviewPrep from "./InterviewPrep";
import FollowUp from "./FollowUp";
import ApplicationChecklist from "./ApplicationChecklist";

const STATUS_LABELS = {
  interested: { label: "Interested", className: "bg-gray-100 text-gray-700" },
  preparing: { label: "Preparing", className: "bg-blue-50 text-blue-700" },
  applied: { label: "Applied", className: "bg-purple-50 text-purple-700" },
  interviewing: { label: "Interviewing", className: "bg-amber-50 text-amber-700" },
  offer: { label: "Offer", className: "bg-emerald-50 text-emerald-700" },
  accepted: { label: "Accepted", className: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Rejected", className: "bg-red-50 text-red-700" },
};

export default function ApplicationRow({ app, onUpdate }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const handleOpenCVAgent = () => {
    navigate("/subagents?agent=cv-helper");
  };
  const [activeTab, setActiveTab] = useState("target");
  const [jdText, setJdText] = useState(app.job_description || "");
  const [appliedDate, setAppliedDate] = useState(app.applied_date || "");
  const [cvVersionUsed, setCvVersionUsed] = useState(app.cv_version_used || "");
  const [referralAttached, setReferralAttached] = useState(app.referral_attached || false);

  const hasUnsavedChanges =
    jdText !== (app.job_description || "") ||
    appliedDate !== (app.applied_date || "") ||
    cvVersionUsed !== (app.cv_version_used || "") ||
    referralAttached !== (app.referral_attached || false);

  const status = STATUS_LABELS[app.status] || STATUS_LABELS.interested;

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    // RLS enforces ownership; CAL2 migration's CASCADE on calendar_events
    // FK cleans up any tied calendar entries automatically.
    const { error } = await supabase.from("applications").delete().eq("id", app.id);
    if (error) {
      console.error("Failed to delete application:", error);
      toast.error("Failed to delete application: " + error.message);
      setConfirmingDelete(false);
      return;
    }
    toast.success("Application deleted");
    onUpdate();
  };

  const handleStatusChange = async (newStatus) => {
    const { error } = await supabase.from("applications").update({ status: newStatus }).eq("id", app.id);
    if (error) {
      console.error("Failed to update status:", error);
      toast.error("Failed to update status. Please try again.");
      return;
    }
    onUpdate();
  };

  const handleSaveJobDescription = async () => {
    const { error } = await supabase.from("applications").update({ job_description: jdText }).eq("id", app.id);
    if (error) {
      console.error("Failed to save job description:", error);
      toast.error("Failed to save job description. Please try again.");
      return;
    }
    onUpdate();
    // Re-score against the new JD. This is also how existing applications
    // (added before background scoring landed) get backfilled — user pastes
    // a JD and the score fills in ~5s later.
    if (jdText && jdText.trim()) {
      scoreApplication(supabase, queryClient, app.id, jdText);
    }
  };

  const handleSaveApplicationDetails = async () => {
    const { error } = await supabase.from("applications").update({
      applied_date: appliedDate,
      cv_version_used: cvVersionUsed,
      referral_attached: referralAttached,
    }).eq("id", app.id);
    if (error) {
      console.error("Failed to save application details:", error);
      toast.error("Failed to save application details. Please try again.");
      return;
    }
    onUpdate();
  };

  const [checklist, setChecklist] = useState(app.checklist || {});

  // Re-sync local state when the row collapses, or when the app prop refreshes
  // without the user having unsaved changes (e.g. a sub-component saves and triggers onUpdate).
  useEffect(() => {
    if (!expanded || !hasUnsavedChanges) {
      setJdText(app.job_description || "");
      setAppliedDate(app.applied_date || "");
      setCvVersionUsed(app.cv_version_used || "");
      setReferralAttached(app.referral_attached || false);
      setChecklist(app.checklist || {});
    }
  }, [expanded, app]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChecklistChange = async (updated) => {
    const previous = checklist;
    setChecklist(updated);
    const { error } = await supabase.from("applications").update({ checklist: updated }).eq("id", app.id);
    if (error) {
      console.error("Failed to save checklist:", error);
      setChecklist(previous);
      toast.error("Failed to save checklist. Please try again.");
      return;
    }
    onUpdate();
  };

  // Interview tab unlocks once the application reaches interviewing or later.
  // Follow-Up tab unlocks once there's a terminal outcome to follow up on.
  const INTERVIEW_UNLOCK_STATUSES = new Set(["interviewing", "offer", "accepted", "rejected"]);
  const FOLLOWUP_UNLOCK_STATUSES = new Set(["offer", "accepted", "rejected"]);
  const interviewLocked = !INTERVIEW_UNLOCK_STATUSES.has(app.status);
  const followupLocked = !FOLLOWUP_UNLOCK_STATUSES.has(app.status);

  const tabs = [
    { id: "checklist", label: "📋 Steps" },
    { id: "target", label: "Target Role" },
    { id: "cv", label: "CV" },
    { id: "skills", label: "Skills" },
    { id: "projects", label: "Projects" },
    { id: "networking", label: "Networking" },
    { id: "application", label: "Application" },
    { id: "interview", label: "Interview", locked: interviewLocked, unlockHint: "Move this application to 'Interviewing' to unlock interview prep." },
    { id: "followup", label: "Follow-Up", locked: followupLocked, unlockHint: "Unlocks once the application reaches Offer, Accepted, or Rejected." },
  ];

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] overflow-hidden">
      <button
        onClick={() => {
          if (expanded && hasUnsavedChanges) {
            if (!window.confirm("You have unsaved changes. Collapse anyway?")) return;
          }
          setExpanded(!expanded);
        }}
        aria-label={expanded ? "Collapse application" : "Expand application"}
        className="w-full px-5 py-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0", status.className)}>
            {status.label}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0A0A0A] truncate">{app.role_title}</p>
            <p className="text-xs text-[#A3A3A3] mt-0.5">{app.company || "No company"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {app.tier && (
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase",
              app.tier === "tier_1" ? "tier-badge-1" : app.tier === "tier_2" ? "tier-badge-2" : "tier-badge-3"
            )}>
              {app.tier?.replace("_", " ")}
            </span>
          )}
          {app.qualification_score !== undefined && app.qualification_score !== null ? (
            <span className={cn("text-[11px] font-semibold",
              app.qualification_score >= 0.45 ? "text-emerald-600" : "text-red-500"
            )}>
              {Math.round((app.qualification_score || 0) * 100)}%
            </span>
          ) : (app.job_description && app.job_description.trim()) ? (
            <span className="text-[11px] text-[#A3A3A3] italic">Calculating fit…</span>
          ) : null}
          {confirmingDelete ? (
            <>
              <button
                onClick={handleDelete}
                className="text-xs text-red-600 font-semibold hover:text-red-700"
                title="Confirm delete"
              >
                Delete?
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmingDelete(false); }}
                className="text-xs text-[#A3A3A3] hover:text-[#525252]"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={handleDelete}
              className="text-[#A3A3A3] hover:text-red-500"
              title="Delete application"
              aria-label="Delete application"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-[#A3A3A3]" /> : <ChevronDown className="w-4 h-4 text-[#A3A3A3]" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#F0F0F0]">
          <div className="px-5 py-3 flex items-center gap-3 border-b border-[#F0F0F0]">
            <span className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">Status</span>
            <Select value={app.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(([value, { label }]) => (
                  <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex border-b border-[#F0F0F0] overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                title={tab.locked ? tab.unlockHint : undefined}
                className={cn(
                  "px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5",
                  activeTab === tab.id
                    ? "text-[#0A0A0A] border-b-2 border-[#0A0A0A]"
                    : tab.locked
                    ? "text-[#D4D4D4] hover:text-[#A3A3A3]"
                    : "text-[#A3A3A3] hover:text-[#525252]"
                )}
              >
                {tab.locked && <Lock className="w-3 h-3" />}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="px-5 py-4">
            {activeTab === "checklist" && (
              <ApplicationChecklist checklist={checklist} onChange={handleChecklistChange} />
            )}

            {activeTab === "target" && (
              <div className="space-y-3">
                <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">
                  Target Role Information
                </p>
                <div className="bg-[#FAFAFA] rounded-lg p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-[#A3A3A3]">Role</span>
                    <span className="text-xs font-medium text-[#0A0A0A]">{app.role_title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#A3A3A3]">Company</span>
                    <span className="text-xs font-medium text-[#0A0A0A]">{app.company || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#A3A3A3]">Tier</span>
                    <span className="text-xs font-medium text-[#0A0A0A]">{app.tier?.replace("_", " ") || "Unclassified"}</span>
                  </div>
                  {app.qualification_score !== undefined && app.qualification_score !== null ? (
                    <div className="flex justify-between">
                      <span className="text-xs text-[#A3A3A3]">AI Confidence</span>
                      <span className={cn("text-xs font-semibold",
                        app.qualification_score >= 0.45 ? "text-emerald-600" : "text-red-500"
                      )}>
                        {Math.round(app.qualification_score * 100)}%
                      </span>
                    </div>
                  ) : (app.job_description && app.job_description.trim()) ? (
                    <div className="flex justify-between">
                      <span className="text-xs text-[#A3A3A3]">AI Confidence</span>
                      <span className="text-xs text-[#A3A3A3] italic">Calculating fit…</span>
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">
                    Job Description
                  </label>
                  <Textarea
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                    placeholder="Paste the job description here..."
                    rows={6}
                    className="text-sm"
                  />
                  <button
                    onClick={handleSaveJobDescription}
                    className="text-xs text-[#0A0A0A] underline underline-offset-2"
                  >
                    Save Job Description
                  </button>
                </div>
              </div>
            )}

            {activeTab === "cv" && (
              <div className="space-y-4">
                <CVManagement app={app} onUpdate={onUpdate} />
                <div className="border-t border-[#F0F0F0] pt-4">
                  <button
                    onClick={handleOpenCVAgent}
                    className="flex items-center gap-2 text-xs font-medium text-[#2563EB] hover:text-[#1d4ed8] transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Chat with CV Agent for this role
                  </button>
                  <p className="text-[11px] text-[#A3A3A3] mt-1">Opens a conversation pre-loaded with this application's context.</p>
                </div>
              </div>
            )}
            {activeTab === "skills" && <SkillsRequired app={app} onUpdate={onUpdate} />}
            {activeTab === "projects" && <ProjectsProof app={app} onUpdate={onUpdate} />}
            {activeTab === "networking" && <NetworkingReferrals app={app} onUpdate={onUpdate} />}

            {activeTab === "application" && (
              <div className="space-y-4">
                <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-medium">
                  Application Details
                </p>
                <div>
                  <label className="text-xs text-[#525252] mb-1 block">Date Applied</label>
                  <Input
                    type="date"
                    value={appliedDate}
                    onChange={(e) => setAppliedDate(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#525252] mb-1 block">CV Version Used</label>
                  <Input
                    value={cvVersionUsed}
                    onChange={(e) => setCvVersionUsed(e.target.value)}
                    placeholder="e.g., Customer Success CV - Monday"
                    className="text-sm"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-[#525252]">
                  <Checkbox
                    checked={referralAttached}
                    onCheckedChange={setReferralAttached}
                  />
                  Referral Attached
                </label>
                <button
                  onClick={handleSaveApplicationDetails}
                  className="text-xs text-[#0A0A0A] underline underline-offset-2"
                >
                  Save Application Details
                </button>
              </div>
            )}

            {activeTab === "interview" && (
              interviewLocked ? (
                <div className="flex items-start gap-3 px-4 py-4 bg-[#FAFAFA] border border-[#F0F0F0] rounded-lg">
                  <Lock className="w-4 h-4 text-[#A3A3A3] flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-[#525252] leading-relaxed">
                    Move this application to <strong>Interviewing</strong> to unlock interview prep. Jumping ahead before you have an interview scheduled just adds noise.
                  </p>
                </div>
              ) : (
                <InterviewPrep app={app} onUpdate={onUpdate} />
              )
            )}
            {activeTab === "followup" && (
              followupLocked ? (
                <div className="flex items-start gap-3 px-4 py-4 bg-[#FAFAFA] border border-[#F0F0F0] rounded-lg">
                  <Lock className="w-4 h-4 text-[#A3A3A3] flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-[#525252] leading-relaxed">
                    Follow-Up unlocks once the application reaches <strong>Offer</strong>, <strong>Accepted</strong>, or <strong>Rejected</strong>. There's nothing to follow up on yet.
                  </p>
                </div>
              ) : (
                <FollowUp app={app} onUpdate={onUpdate} />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}