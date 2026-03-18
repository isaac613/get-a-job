import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, MessageSquare, Briefcase, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ConversationSelector({ agentName, onSelect, linkToApplications = false }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [applications, setApplications] = useState([]);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, [agentName]);

  const loadData = async () => {
    setLoading(true);
    const promises = [base44.agents.listConversations({ agent_name: agentName })];
    if (linkToApplications) {
      promises.push(base44.entities.Application.list("-updated_date", 100));
    }
    const [convos, apps] = await Promise.all(promises);
    setConversations(convos || []);
    setApplications(apps || []);
    setLoading(false);
  };

  const createConversation = async () => {
    setCreating(true);
    const app = applications.find((a) => a.id === selectedAppId);
    const metadata = app
      ? { name: `${app.role_title} at ${app.company}`, application_id: app.id }
      : { name: "New Conversation" };

    const convo = await base44.agents.createConversation({ agent_name: agentName, metadata });

    // If linked to an application, send an automatic opening message so the agent
    // immediately knows which role this conversation is about and starts creating the CV
    if (app) {
      const cleanConvo = {
        ...convo,
        messages: (convo.messages || []).map(({ outcome, ...rest }) => rest),
      };
      await base44.agents.addMessage(cleanConvo, {
        role: "user",
        content: `Please create a tailored CV for my application for the ${app.role_title} role at ${app.company} (application ID: ${app.id}).${app.job_description ? ` Here is the job description to tailor it to:\n\n${app.job_description}` : " There is no job description saved yet, so use what you know about this role type."} Use my real profile, experience, skills, and projects from the database. Make it personalized to me but optimized for this specific role. Start generating now.`,
      });
    }

    const fullConvo = await base44.agents.getConversation(convo.id);
    setShowNewDialog(false);
    setSelectedAppId("");
    setCreating(false);
    onSelect(fullConvo);
  };

  const deleteConversation = async (e, convoId) => {
    e.stopPropagation();
    setDeletingId(convoId);
    await base44.agents.deleteConversation(convoId);
    setConversations((prev) => prev.filter((c) => c.id !== convoId));
    setDeletingId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-[#A3A3A3]" />
      </div>
    );
  }

  return (
    <>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-[#0A0A0A]">Your Conversations</h2>
            <p className="text-xs text-[#A3A3A3] mt-1">
              {linkToApplications
                ? "Each conversation can be linked to a specific application for focused assistance."
                : "Start a new chat or continue a previous one."}
            </p>
          </div>
          <Button onClick={() => setShowNewDialog(true)} size="sm" className="bg-[#0A0A0A] hover:bg-[#262626]">
            <Plus className="w-4 h-4 mr-1.5" />
            New Chat
          </Button>
        </div>

        <div className="space-y-3">
          {conversations.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-[#E5E5E5]">
              <MessageSquare className="w-8 h-8 text-[#A3A3A3] mx-auto mb-3" />
              <p className="text-sm text-[#525252]">No conversations yet</p>
              <p className="text-xs text-[#A3A3A3] mt-1">Click "New Chat" to get started</p>
            </div>
          )}

          {conversations.map((convo) => (
            <button
              key={convo.id}
              onClick={() => onSelect(convo)}
              className="w-full bg-white rounded-lg border border-[#E5E5E5] p-4 text-left hover:border-[#D4D4D4] transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#F5F5F5] flex items-center justify-center flex-shrink-0 group-hover:bg-[#0A0A0A] transition-colors">
                  {convo.metadata?.application_id ? (
                    <Briefcase className="w-4 h-4 text-[#525252] group-hover:text-white transition-colors" />
                  ) : (
                    <MessageSquare className="w-4 h-4 text-[#525252] group-hover:text-white transition-colors" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-[#0A0A0A]">
                    {convo.metadata?.name || "Unnamed Conversation"}
                  </h3>
                  <p className="text-xs text-[#A3A3A3] mt-0.5">
                    {new Date(convo.created_date).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={(e) => deleteConversation(e, convo.id)}
                  disabled={deletingId === convo.id}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-50 text-[#A3A3A3] hover:text-red-500 transition-all"
                >
                  {deletingId === convo.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </button>
          ))}
        </div>
      </div>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start New Conversation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {linkToApplications && (
              <div className="space-y-2">
                <Label>Link to Application (Optional)</Label>
                <Select value={selectedAppId} onValueChange={setSelectedAppId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an application or leave blank" />
                  </SelectTrigger>
                  <SelectContent>
                    {applications.map((app) => (
                      <SelectItem key={app.id} value={app.id}>
                        {app.role_title} at {app.company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-[#A3A3A3]">
                  Linking to an application provides focused context for CV tailoring and strategy.
                </p>
              </div>
            )}
            {!linkToApplications && (
              <p className="text-sm text-[#525252]">A new conversation will be created and opened immediately.</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancel</Button>
            <Button onClick={createConversation} disabled={creating} className="bg-[#0A0A0A] hover:bg-[#262626]">
              {creating ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Starting...</> : "Start Chat"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}