import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Send, Loader2, Plus, ListTodo, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import MessageBubble from "./MessageBubble";

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

export default function ChatInterface({ agentName, title, description, applicationId, suggestedPrompts }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [addedTaskSets, setAddedTaskSets] = useState({});
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
    toast.success("Task added");
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
