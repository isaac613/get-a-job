import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/api/supabaseClient";
import { Send, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import MessageBubble from "./MessageBubble";

export default function ChatInterface({ agentName, title, description }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");

    // Add user message and capture updated history for the API call
    const userMsg = { role: "user", content: text };
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
        },
      });

      if (error) throw error;

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || "Sorry, I could not generate a response." },
      ]);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    }
    setSending(false);
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
          <div className="text-center py-12">
            <p className="text-sm text-[#A3A3A3]">
              Start a conversation. Ask a question about your career path.
            </p>
          </div>
        )}
        {messages
          .filter((m) => m.role !== "system")
          .map((msg, i) => (
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