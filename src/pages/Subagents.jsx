import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare, Briefcase, BookOpen, GraduationCap, ChevronDown, ChevronUp, Info, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPageUrl } from "@/utils";

const SUBAGENTS = [
  {
    id: "career_agent",
    agentName: "career_agent",
    title: "AI Career Agent",
    icon: Brain,
    description: "Your main career advisor — analyzes your full profile, maps qualifications to roles, and creates actionable plans.",
    capabilities: [
      "🧭 Maps your qualifications to realistic target roles",
      "🔍 Identifies gaps between where you are and where you want to be",
      "📊 Gives honest confidence scores for each role you're targeting",
      "✅ Updates your tracker, tasks, and profile directly",
      "💡 Suggests next steps based on your actual data — no generic advice",
    ],
    howToUse: "Start by asking it to evaluate your profile or assess your fit for a specific role. Be direct — e.g. 'Am I ready for a Product Manager role?' or 'What should I focus on this week?'",
  },
  {
    id: "application_cv_success_agent",
    agentName: "application_cv_success_agent",
    title: "Application & CV Agent",
    icon: Briefcase,
    description: "Complete application management: CV tailoring, application tracking, referral strategy, and outreach.",
    capabilities: [
      "📄 Generates a tailored CV for any specific job or company",
      "🎯 Analyzes your match against a job description",
      "📬 Creates outreach messages and referral strategies",
      "✅ Updates your application tracker automatically",
      "📝 Adds tasks to your job search to-do list",
    ],
    howToUse: "Paste in a job description or a LinkedIn job URL, then ask it to tailor your CV, assess your fit, or plan your outreach. You can also upload a job posting as a file.",
  },
  {
    id: "interview_coach",
    agentName: "interview_coach",
    title: "Interview Coach",
    page: "InterviewCoach",
    icon: MessageSquare,
    description: "Prepares you for interviews with likely questions, answer frameworks, and gap analysis.",
    capabilities: [
      "💬 Generates role-specific interview questions",
      "🧠 Provides STAR-method answer frameworks",
      "🔍 Identifies your weak areas for the role",
      "📋 Creates interview prep tasks in your tracker",
      "🎤 Can do mock interview practice with feedback",
    ],
    howToUse: "Tell it the role and company you're interviewing for. Ask for likely questions, or start a mock interview. Be specific — e.g. 'I have a Product Manager interview at Google next week'.",
  },
  {
    id: "skill_development_agent",
    agentName: "skill_development_agent",
    title: "Skill Development Advisor",
    icon: GraduationCap,
    description: "Analyzes skill gaps, recommends courses, maps skills to projects, and creates learning roadmaps.",
    capabilities: [
      "📊 Analyzes which skills you're missing for target roles",
      "🎓 Recommends specific courses (Coursera, LinkedIn Learning, etc.)",
      "🛠️ Suggests projects to prove your skills to employers",
      "🗺️ Builds a structured learning roadmap with timelines",
      "➕ Adds courses and projects directly to your profile",
    ],
    howToUse: "Tell it which role you want to get ready for, or ask it to analyze your skill gaps. You can also ask for a full learning plan — e.g. 'I want to become a Data Analyst in 3 months'.",
  },
];

function AgentInfoPanel({ agent }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-[#F0F0F0] pt-3">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="flex items-center gap-1.5 text-xs text-[#2563EB] hover:text-[#1d4ed8] font-medium transition-colors"
      >
        <Info className="w-3.5 h-3.5" />
        {open ? "Hide details" : "What can this agent do?"}
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[#A3A3A3] font-semibold mb-1.5">Capabilities</p>
            <ul className="space-y-1">
              {agent.capabilities.map((cap, i) => (
                <li key={i} className="text-xs text-[#525252] leading-relaxed">{cap}</li>
              ))}
            </ul>
          </div>
          <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wider text-[#D97706] font-semibold mb-1">How to use</p>
            <p className="text-xs text-[#525252] leading-relaxed">{agent.howToUse}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Subagents() {
  const navigate = useNavigate();

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-[#0A0A0A]">Specialist Agents</h1>
        <p className="text-sm text-[#A3A3A3] mt-1">
          Specialized tools for specific career tasks. Each agent can update your tracker, tasks, or profile — just ask.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SUBAGENTS.map((agent) => {
          const Icon = agent.icon;
          const isLive = !!agent.page;
          return (
            <div
              key={agent.id}
              onClick={isLive ? () => navigate(createPageUrl(agent.page)) : undefined}
              className={`bg-white rounded-xl border border-[#E5E5E5] p-6 transition-all group ${isLive ? "hover:border-[#D4D4D4] cursor-pointer" : "opacity-60"}`}
            >
              <div className="flex items-start gap-4 w-full text-left">
                <div className={`w-10 h-10 rounded-lg bg-[#F5F5F5] flex items-center justify-center flex-shrink-0 transition-colors ${isLive ? "group-hover:bg-[#0A0A0A]" : ""}`}>
                  <Icon className={`w-5 h-5 text-[#525252] transition-colors ${isLive ? "group-hover:text-white" : ""}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[#0A0A0A]">{agent.title}</h3>
                    {isLive ? (
                      <span className="text-[10px] font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Live</span>
                    ) : (
                      <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Coming Soon</span>
                    )}
                  </div>
                  <p className="text-xs text-[#A3A3A3] mt-1 leading-relaxed">{agent.description}</p>
                </div>
              </div>
              <AgentInfoPanel agent={agent} />
            </div>
          );
        })}
      </div>
    </div>
  );
}