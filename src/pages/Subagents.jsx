import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { MessageSquare, Briefcase, BookOpen, GraduationCap, Send, Loader2, ArrowLeft, Plus, Paperclip, ChevronDown, ChevronUp, Info, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import MessageBubble from "../components/chat/MessageBubble";
import ConversationSelector from "../components/subagents/ConversationSelector";

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
    supportsMultipleChats: true,
    linkToApplications: false,
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
    supportsMultipleChats: true,
    linkToApplications: true,
  },
  {
    id: "interview_coach",
    agentName: "interview_coach",
    title: "Interview Coach",
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
    supportsMultipleChats: true,
    linkToApplications: false,
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
    supportsMultipleChats: true,
    linkToApplications: false,
  },
];

function AgentChat({ agent, onBack, onBackToSelector, initialConversation }) {
  const [activeConversation, setActiveConversation] = useState(initialConversation || null);
  const [messages, setMessages] = useState(initialConversation?.messages || []);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(!initialConversation);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const Icon = agent.icon;

  useEffect(() => {
    if (!initialConversation) {
      loadConversations();
    } else {
      setLoading(false);
    }
  }, [agent.agentName, initialConversation]);

  useEffect(() => {
    if (!activeConversation) return;
    const unsubscribe = base44.agents.subscribeToConversation(
      activeConversation.id,
      (data) => setMessages(data.messages || [])
    );
    return () => unsubscribe();
  }, [activeConversation?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversations = async () => {
    setLoading(true);
    const convos = await base44.agents.listConversations({ agent_name: agent.agentName });
    if (convos?.length > 0) {
      const latest = await base44.agents.getConversation(convos[0].id);
      setActiveConversation(latest);
      setMessages(latest.messages || []);
    }
    setLoading(false);
  };

  const createNewConversation = async () => {
    const convo = await base44.agents.createConversation({
      agent_name: agent.agentName,
      metadata: { name: agent.title },
    });
    setActiveConversation(convo);
    setMessages([]);
  };

  const handleFileSelect = (file) => {
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: selectedFile });

      let convo = activeConversation;
      if (!convo) {
        convo = await base44.agents.createConversation({
          agent_name: agent.agentName,
          metadata: { name: agent.title },
        });
        setActiveConversation(convo);
      }

      await base44.agents.addMessage(convo, {
        role: "user",
        content: `I've uploaded: ${selectedFile.name}`,
        file_urls: [file_url],
      });

      setSelectedFile(null);
    } finally {
      setUploading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    let convo = activeConversation;
    if (!convo) {
      convo = await base44.agents.createConversation({
        agent_name: agent.agentName,
        metadata: { name: agent.title },
      });
      setActiveConversation(convo);
    }

    await base44.agents.addMessage(convo, { role: "user", content: text });
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-[#A3A3A3]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-[#E5E5E5] bg-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-[#F5F5F5] transition-colors"
            title="Back to Agents"
          >
            <ArrowLeft className="w-4 h-4 text-[#525252]" />
          </button>
          <Icon className="w-4 h-4 text-[#525252]" />
          <div>
            <h2 className="text-sm font-semibold text-[#0A0A0A]">
              {activeConversation?.metadata?.name || agent.title}
            </h2>
            <p className="text-xs text-[#A3A3A3]">
              {activeConversation?.metadata?.application_id ? "Linked to application" : agent.description}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-[#A3A3A3]">
              Describe what you need help with. Be specific about the role, company, or skill.
            </p>
            <p className="text-xs text-[#A3A3A3] mt-2">
              You can also ask this agent to update your tracker, tasks, or profile directly.
            </p>
          </div>
        )}
        {messages.filter((m) => m.role !== "system").map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {/* Typing indicator */}
        {sending && (
          <div className="flex gap-3">
            <div className="h-7 w-7 rounded-lg bg-[#0A0A0A] flex items-center justify-center mt-0.5 flex-shrink-0">
              <div className="h-1.5 w-1.5 rounded-full bg-white" />
            </div>
            <div className="bg-white border border-[#E5E5E5] rounded-2xl px-4 py-2.5 flex gap-1">
              <div className="w-2 h-2 bg-[#A3A3A3] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-[#A3A3A3] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-[#A3A3A3] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* File Preview */}
      {selectedFile && (
        <div className="px-6 py-3 border-t border-[#E5E5E5] bg-[#F5F5F5]">
          <div className="flex items-center justify-between p-3 rounded-lg border border-[#E5E5E5] bg-white">
            <div className="flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-[#2563EB]" />
              <span className="text-sm text-[#525252]">{selectedFile.name}</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedFile(null)}
                className="text-xs text-[#A3A3A3] hover:text-[#525252]"
              >
                Remove
              </Button>
              <Button
                size="sm"
                onClick={handleFileUpload}
                disabled={uploading}
                className="bg-[#0A0A0A] hover:bg-[#262626] text-xs"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  "Upload"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-6 py-4 border-t border-[#E5E5E5] bg-white">
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx"
            onChange={(e) => handleFileSelect(e.target.files?.[0])}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sending || !!selectedFile}
            className="h-10 w-10 flex-shrink-0"
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question or upload your CV/job description..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-[#E5E5E5] px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#0A0A0A] focus:border-[#0A0A0A] placeholder:text-[#A3A3A3]"
            style={{ minHeight: "40px", maxHeight: "120px" }}
          />
          <Button
            onClick={sendMessage}
            disabled={sending || !input.trim()}
            className="bg-[#0A0A0A] hover:bg-[#262626] h-10 w-10 p-0 flex-shrink-0"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

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
  const [activeAgent, setActiveAgent] = useState(null);
  const [showConversationSelector, setShowConversationSelector] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState(null);

  // Handle deep-link from Tracker: ?conversation_id=xxx
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const convId = params.get("conversation_id");
    if (!convId) return;

    // Clear the param from URL
    navigate("/Subagents", { replace: true });

    const cvAgent = SUBAGENTS.find(a => a.id === "application_cv_success_agent");
    base44.agents.getConversation(convId).then((convo) => {
      setActiveAgent(cvAgent);
      setSelectedConversation(convo);
      setShowConversationSelector(false);
    });
  }, []);

  const handleAgentSelect = (agent) => {
    setActiveAgent(agent);
    setShowConversationSelector(true);
  };

  const handleConversationSelect = (convo) => {
    setSelectedConversation(convo);
    setShowConversationSelector(false);
  };

  const handleBack = () => {
    setSelectedConversation(null);
    setActiveAgent(null);
    setShowConversationSelector(false);
  };

  const handleBackToSelector = () => {
    setSelectedConversation(null);
    setShowConversationSelector(true);
  };

  if (activeAgent && !showConversationSelector) {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        <AgentChat agent={activeAgent} onBack={handleBack} onBackToSelector={handleBackToSelector} initialConversation={selectedConversation} />
      </div>
    );
  }

  if (activeAgent && showConversationSelector) {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E5E5E5] bg-white flex items-center gap-3">
          <button
            onClick={() => {
              setActiveAgent(null);
              setShowConversationSelector(false);
            }}
            className="p-1.5 rounded-lg hover:bg-[#F5F5F5] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-[#525252]" />
          </button>
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-[#525252]" />
            <h2 className="text-sm font-semibold text-[#0A0A0A]">{activeAgent.title}</h2>
          </div>
        </div>
        <ConversationSelector
          agentName={activeAgent.agentName}
          onSelect={handleConversationSelect}
          linkToApplications={activeAgent.linkToApplications}
        />
      </div>
    );
  }

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
          return (
            <div
              key={agent.id}
              className="bg-white rounded-xl border border-[#E5E5E5] p-6 hover:border-[#D4D4D4] transition-all group"
            >
              <button
                onClick={() => handleAgentSelect(agent)}
                className="flex items-start gap-4 w-full text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-[#F5F5F5] flex items-center justify-center flex-shrink-0 group-hover:bg-[#0A0A0A] transition-colors">
                  <Icon className="w-5 h-5 text-[#525252] group-hover:text-white transition-colors" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-[#0A0A0A]">{agent.title}</h3>
                  <p className="text-xs text-[#A3A3A3] mt-1 leading-relaxed">{agent.description}</p>
                </div>
              </button>
              <AgentInfoPanel agent={agent} />
            </div>
          );
        })}
      </div>
    </div>
  );
}