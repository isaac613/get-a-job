import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Loader2, Plus, ListTodo, CheckCircle2, ArrowRight, Route, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import MessageBubble from "./MessageBubble";

const TIER_LABELS = {
  tier_1: "Tier 1 — Qualified Today",
  tier_2: "Tier 2 — Slight Stretch",
  tier_3: "Tier 3 — Future Path",
};

function TaskSuggestionCard({ messageId, tasks, addedTaskSets, onAdd }) {
  const addedForMessage = addedTaskSets[messageId] || {};
  return (
    <div className="ml-10 mt-2 bg-blue-50 border border-blue-200 rounded-xl p-4 max-w-xl">
      <div className="flex items-center gap-2 mb-3">
        <ListTodo className="w-3.5 h-3.5 text-blue-700" />
        <p className="text-xs font-semibold text-blue-800">Suggested Tasks</p>
      </div>
      <ul className="space-y-2">
        {tasks.map((task, i) => (
          <li key={i} className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-blue-800 leading-snug">{task.title}</p>
              {task.description && (
                <p className="text-[11px] text-blue-600 mt-0.5 leading-snug">{task.description}</p>
              )}
            </div>
            {addedForMessage[i] ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <button
                onClick={() => onAdd(messageId, task, i)}
                className="text-[11px] font-medium text-blue-700 hover:text-blue-900 bg-white border border-blue-300 hover:border-blue-500 rounded px-2 py-0.5 shrink-0 transition-colors"
              >
                Add
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoadmapChangeCard({ messageId, changes, applied, onApply }) {
  if (applied[messageId]) {
    return (
      <div className="ml-10 mt-2 bg-emerald-50 border border-emerald-200 rounded-xl p-4 max-w-xl">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <p className="text-xs font-semibold text-emerald-800">Roadmap changes applied</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ml-10 mt-2 bg-indigo-50 border border-indigo-200 rounded-xl p-4 max-w-xl">
      <div className="flex items-center gap-2 mb-3">
        <Route className="w-3.5 h-3.5 text-indigo-700" />
        <p className="text-xs font-semibold text-indigo-800">Proposed Roadmap Changes</p>
      </div>
      <ul className="space-y-2 mb-3">
        {changes.map((change, i) => (
          <li key={i} className="text-xs text-indigo-700 leading-relaxed">
            {change.action === "update_tier" && (
              <span>Move <strong>{change.role_title}</strong> → {TIER_LABELS[change.new_tier] || change.new_tier}</span>
            )}
            {change.action === "add_role" && (
              <span>Add <strong>{change.title}</strong> as {TIER_LABELS[change.tier] || change.tier}</span>
            )}
            {change.action === "remove_role" && (
              <span>Remove <strong>{change.role_title}</strong></span>
            )}
            {change.reason && (
              <span className="text-indigo-500"> — {change.reason}</span>
            )}
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        onClick={() => onApply(messageId, changes)}
        className="h-7 text-xs bg-indigo-700 hover:bg-indigo-800 gap-1.5"
      >
        Apply Changes
      </Button>
    </div>
  );
}

function ApplicationActionsCard({ messageId, actions, applied, onApply }) {
  if (applied[messageId]) {
    return (
      <div className="ml-10 mt-2 bg-emerald-50 border border-emerald-200 rounded-xl p-4 max-w-xl">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <p className="text-xs font-semibold text-emerald-800">Applications updated</p>
        </div>
      </div>
    );
  }
  return (
    <div className="ml-10 mt-2 bg-blue-50 border border-blue-200 rounded-xl p-4 max-w-xl">
      <div className="flex items-center gap-2 mb-3">
        <Briefcase className="w-3.5 h-3.5 text-blue-700" />
        <p className="text-xs font-semibold text-blue-800">Proposed Application Changes</p>
      </div>
      <ul className="space-y-2 mb-3">
        {actions.map((a, i) => (
          <li key={i} className="text-xs text-blue-900 leading-relaxed">
            {a.action === "add_application" && (
              <span>Add <strong>{a.company}</strong> — {a.role_title} ({a.status || "interested"}{a.tier ? `, ${a.tier}` : ""})</span>
            )}
            {a.action === "update_application" && (
              <span>
                Update <strong>{a.match_company}</strong> — {a.match_role_title}:
                {a.new_status && <span> status → {a.new_status}</span>}
                {a.new_interview_stage && <span>, stage → {a.new_interview_stage}</span>}
                {a.new_tier && <span>, tier → {a.new_tier}</span>}
                {a.new_notes && <span>, notes updated</span>}
              </span>
            )}
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        onClick={() => onApply(messageId, actions)}
        className="h-7 text-xs bg-blue-700 hover:bg-blue-800 gap-1.5"
      >
        Apply Changes
      </Button>
    </div>
  );
}

function AgentRedirectCard({ suggestion, onSwitch }) {
  return (
    <div className="ml-10 mt-2">
      <Button
        size="sm"
        onClick={() => onSwitch(suggestion.page)}
        className="h-7 text-xs bg-amber-700 hover:bg-amber-800 gap-1.5"
      >
        Switch to {suggestion.label}
        <ArrowRight className="w-3 h-3" />
      </Button>
    </div>
  );
}

export default function ChatInterface({ agentName, title, description, applicationId, suggestedPrompts }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [addedTaskSets, setAddedTaskSets] = useState({});
  const [appliedRoadmapSets, setAppliedRoadmapSets] = useState({});
  const [appliedAppActionSets, setAppliedAppActionSets] = useState({});
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");

    const userMsg = { role: "user", content: text, id: crypto.randomUUID() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: {
          message: text,
          agent: agentName || "career-coach",
          // Strip system-role entries to prevent prompt injection
          conversation_history: updatedMessages.slice(-20).filter((m) => m.role !== "system"),
          ...(applicationId && { application_id: applicationId }),
        },
      });

      if (error) throw error;

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "Sorry, I could not generate a response.",
          id: crypto.randomUUID(),
          suggestedTasks: data.suggested_tasks?.length > 0 ? data.suggested_tasks : null,
          suggestedAgent: data.suggested_agent || null,
          suggestedRoadmapChanges: data.suggested_roadmap_changes?.length > 0 ? data.suggested_roadmap_changes : null,
          suggestedApplicationActions: data.suggested_application_actions?.length > 0 ? data.suggested_application_actions : null,
        },
      ]);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again.", id: crypto.randomUUID() },
      ]);
    }
    setSending(false);
  };

  const handleAddTasks = async (messageId, task, taskIndex) => {
    if (!user?.id || addedTaskSets[messageId]?.[taskIndex]) return;
    const { error } = await supabase.from("tasks").insert({
      title: task.title,
      description: task.description || "",
      category: task.category || "application",
      priority: task.priority || "medium",
      role_title: task.role_title || "",
      user_id: user.id,
      is_complete: false,
    });
    if (error) {
      console.error("Failed to add task:", error);
      toast.error("Could not add task. Please try again.");
      return;
    }
    setAddedTaskSets((prev) => ({
      ...prev,
      [messageId]: { ...(prev[messageId] || {}), [taskIndex]: true },
    }));
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    toast.success("Task added");
  };

  const handleApplyRoadmapChanges = async (messageId, changes) => {
    if (!user?.id || appliedRoadmapSets[messageId]) return;
    let hasError = false;
    for (const change of changes) {
      if (change.action === "update_tier") {
        const { error } = await supabase
          .from("career_roles")
          .update({ tier: change.new_tier })
          .eq("user_id", user.id)
          .ilike("title", change.role_title);
        if (error) { console.error("Roadmap update_tier error:", error); hasError = true; }
      } else if (change.action === "add_role") {
        const { error } = await supabase.from("career_roles").insert({
          user_id: user.id,
          title: change.title,
          tier: change.tier,
        });
        if (error) { console.error("Roadmap add_role error:", error); hasError = true; }
      } else if (change.action === "remove_role") {
        const { error } = await supabase
          .from("career_roles")
          .delete()
          .eq("user_id", user.id)
          .ilike("title", change.role_title);
        if (error) { console.error("Roadmap remove_role error:", error); hasError = true; }
      }
    }
    if (hasError) {
      toast.error("Some changes could not be applied. Please try again.");
      return;
    }
    setAppliedRoadmapSets((prev) => ({ ...prev, [messageId]: true }));
    queryClient.invalidateQueries({ queryKey: ["careerRoles"] });
    toast.success("Roadmap updated");
  };

  const handleApplyApplicationActions = async (messageId, actions) => {
    if (!user?.id || appliedAppActionSets[messageId]) return;
    let hasError = false;
    for (const a of actions) {
      if (a.action === "add_application") {
        const row = {
          user_id: user.id,
          company: a.company,
          role_title: a.role_title,
          status: a.status || "interested",
          ...(a.tier && { tier: a.tier }),
          ...(a.url && { url: a.url }),
          ...(a.location && { location: a.location }),
          ...(a.notes && { notes: a.notes }),
        };
        const { error } = await supabase.from("applications").insert(row);
        if (error) { console.error("add_application error:", error); hasError = true; }
      } else if (a.action === "update_application") {
        const patch = {};
        if (a.new_status) patch.status = a.new_status;
        if (a.new_interview_stage) patch.interview_stage = a.new_interview_stage;
        if (a.new_tier) patch.tier = a.new_tier;
        if (a.new_notes) patch.notes = a.new_notes;
        if (Object.keys(patch).length === 0) continue;
        const { error } = await supabase
          .from("applications")
          .update(patch)
          .eq("user_id", user.id)
          .ilike("company", a.match_company)
          .ilike("role_title", a.match_role_title);
        if (error) { console.error("update_application error:", error); hasError = true; }
      }
    }
    if (hasError) {
      toast.error("Some applications could not be updated. Please try again.");
      return;
    }
    setAppliedAppActionSets((prev) => ({ ...prev, [messageId]: true }));
    queryClient.invalidateQueries({ queryKey: ["applications"] });
    toast.success("Applications updated");
  };

  const handleSwitchAgent = (page) => {
    navigate(createPageUrl(page));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#E5E5E5] bg-white flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#0A0A0A]">{title}</h2>
          {description && (
            <p className="text-xs text-[#A3A3A3] mt-0.5">{description}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMessages([])}
          className="text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          New
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 space-y-4">
            <p className="text-sm text-[#A3A3A3]">
              Start a conversation. Ask a question about your career path.
            </p>
            {suggestedPrompts?.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestedPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(prompt)}
                    className="text-xs bg-[#F5F5F5] hover:bg-[#E5E5E5] text-[#525252] rounded-full px-3 py-1.5 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages
          .filter((m) => m.role !== "system")
          .map((msg, i) => (
            <React.Fragment key={msg.id || i}>
              <MessageBubble message={msg} />
              {msg.suggestedTasks && (
                <TaskSuggestionCard
                  messageId={msg.id}
                  tasks={msg.suggestedTasks}
                  addedTaskSets={addedTaskSets}
                  onAdd={handleAddTasks}
                />
              )}
              {msg.suggestedRoadmapChanges && (
                <RoadmapChangeCard
                  messageId={msg.id}
                  changes={msg.suggestedRoadmapChanges}
                  applied={appliedRoadmapSets}
                  onApply={handleApplyRoadmapChanges}
                />
              )}
              {msg.suggestedApplicationActions && (
                <ApplicationActionsCard
                  messageId={msg.id}
                  actions={msg.suggestedApplicationActions}
                  applied={appliedAppActionSets}
                  onApply={handleApplyApplicationActions}
                />
              )}
              {msg.suggestedAgent && (
                <AgentRedirectCard
                  suggestion={msg.suggestedAgent}
                  onSwitch={handleSwitchAgent}
                />
              )}
            </React.Fragment>
          ))}

        {/* Typing indicator */}
        {sending && (
          <div className="flex gap-3">
            <div className="h-7 w-7 rounded-lg bg-[#0A0A0A] flex items-center justify-center mt-0.5 flex-shrink-0">
              <div className="h-1.5 w-1.5 rounded-full bg-white" />
            </div>
            <div className="bg-white border border-[#E5E5E5] rounded-2xl px-4 py-2.5 flex gap-1">
              <div className="w-2 h-2 bg-[#A3A3A3] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-2 h-2 bg-[#A3A3A3] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-2 h-2 bg-[#A3A3A3] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-[#E5E5E5] bg-white">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-[#E5E5E5] px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#0A0A0A] focus:border-[#0A0A0A] placeholder:text-[#A3A3A3]"
            style={{ minHeight: "40px", maxHeight: "120px" }}
          />
          <Button
            onClick={sendMessage}
            disabled={sending || !input.trim()}
            aria-label="Send message"
            className="bg-[#0A0A0A] hover:bg-[#262626] h-10 w-10 p-0 flex-shrink-0"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
