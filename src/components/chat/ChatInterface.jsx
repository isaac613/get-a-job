import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Loader2, Plus, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import MessageBubble from "./MessageBubble";

export default function ChatInterface({ agentName, title, description }) {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadConversations();
  }, [agentName]);

  useEffect(() => {
    if (!activeConversation) return;
    const unsubscribe = base44.agents.subscribeToConversation(
      activeConversation.id,
      (data) => {
        setMessages(data.messages || []);
      }
    );
    return () => unsubscribe();
  }, [activeConversation?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversations = async () => {
    setLoading(true);
    const convos = await base44.agents.listConversations({ agent_name: agentName });
    setConversations(convos || []);
    if (convos?.length > 0) {
      const latest = await base44.agents.getConversation(convos[0].id);
      setActiveConversation(latest);
      setMessages(latest.messages || []);
    }
    setLoading(false);
  };

  const createNewConversation = async () => {
    const convo = await base44.agents.createConversation({
      agent_name: agentName,
      metadata: { name: title || "New Conversation" },
    });
    setActiveConversation(convo);
    setMessages([]);
    setConversations((prev) => [convo, ...prev]);
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
          agent_name: agentName,
          metadata: { name: title || "New Conversation" },
        });
        setActiveConversation(convo);
        setConversations((prev) => [convo, ...prev]);
      }

      await base44.agents.addMessage(convo, {
        role: "user",
        content: `I've uploaded my CV: ${selectedFile.name}`,
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
        agent_name: agentName,
        metadata: { name: title || "New Conversation" },
      });
      setActiveConversation(convo);
      setConversations((prev) => [convo, ...prev]);
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
          onClick={createNewConversation}
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
            placeholder="Type your message or upload a file..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-[#E5E5E5] px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#0A0A0A] focus:border-[#0A0A0A] placeholder:text-[#A3A3A3]"
            style={{ minHeight: "40px", maxHeight: "120px" }}
          />
          <Button
            onClick={sendMessage}
            disabled={sending || !input.trim()}
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