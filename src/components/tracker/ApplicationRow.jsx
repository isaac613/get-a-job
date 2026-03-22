import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, MessageSquare, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  rejected: { label: "Rejected", className: "bg-red-50 text-red-700" },
};

export default function ApplicationRow({ app, onUpdate }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [startingChat, setStartingChat] = useState(false);

  const handleOpenCVAgent = async () => {
    setStartingChat(true);
    // Navigate to subagents with cv-helper agent context
    window.location.href = "/subagents?agent=cv-helper";
    setStartingChat(false);
  };
  const [activeTab, setActiveTab] = useState("target");
  const [jdText, setJdText] = useState(app.job_description || "");
  const [appliedDate, setAppliedDate] = useState(app.applied_date || "");
  const [cvVersionUsed, setCvVersionUsed] = useState(app.cv_version_used || "");
  const [referralAttached, setReferralAttached] = useState(app.referral_attached || false);

  const status = STATUS_LABELS[app.status] || STATUS_LABELS.interested;

  const handleSaveJobDescription = async () => {
    const { error } = await supabase.from("applications").update({ job_description: jdText }).eq("id", app.id);
    if (error) {
      console.error("Failed to save job description:", error);
      toast.error("Failed to save job description. Please try again.");
      return;
    }
    onUpdate();
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

  const tabs = [
    { id: "checklist", label: "📋 Steps" },
    { id: "target", label: "Target Role" },
    { id: "cv", label: "CV" },
    { id: "skills", label: "Skills" },
    { id: "projects", label: "Projects" },
    { id: "networking", label: "Networking" },
    { id: "application", label: "Application" },
    { id: "interview", label: "Interview" },
    { id: "followup", label: "Follow-Up" },
  ];

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
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
              app.tier === "tier_1" ? "tier-badge-1" : "tier-badge-2"
            )}>
              {app.tier?.replace("_", " ")}
            </span>
          )}
          {app.qualification_score !== undefined && app.qualification_score !== null && (
            <span className={cn("text-[11px] font-semibold",
              app.qualification_score >= 0.45 ? "text-emerald-600" : "text-red-500"
            )}>
              {Math.round((app.qualification_score || 0) * 100)}%
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-[#A3A3A3]" /> : <ChevronDown className="w-4 h-4 text-[#A3A3A3]" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#F0F0F0]">
          <div className="flex border-b border-[#F0F0F0] overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap",
                  activeTab === tab.id
                    ? "text-[#0A0A0A] border-b-2 border-[#0A0A0A]"
                    : "text-[#A3A3A3] hover:text-[#525252]"
                )}
              >
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
                    <span className="text-xs font-medium text-[#0A0A0A]">{app.tier?.replace("_", " ") || "—"}</span>
                  </div>
                  {app.qualification_score !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-xs text-[#A3A3A3]">AI Confidence</span>
                      <span className={cn("text-xs font-semibold",
                        app.qualification_score >= 0.45 ? "text-emerald-600" : "text-red-500"
                      )}>
                        {Math.round(app.qualification_score * 100)}%
                      </span>
                    </div>
                  )}
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
                    disabled={startingChat}
                    className="flex items-center gap-2 text-xs font-medium text-[#2563EB] hover:text-[#1d4ed8] transition-colors"
                  >
                    {startingChat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
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

            {activeTab === "interview" && <InterviewPrep app={app} onUpdate={onUpdate} />}
            {activeTab === "followup" && <FollowUp app={app} onUpdate={onUpdate} />}
          </div>
        </div>
      )}
    </div>
  );
}