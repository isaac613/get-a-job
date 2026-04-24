import React, { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ChatInterface from "../components/chat/ChatInterface";

const SUGGESTED_PROMPTS = [
  "Generate a tailored CV for my top Tier 1 role",
  "Rewrite my summary for a Product Manager role",
  "Turn my most recent job into 5 strong CV bullets",
  "What keywords am I missing for a Data Analyst CV?",
  "Tailor my CV for the job I selected above",
];

export default function CVAgent() {
  const { user } = useAuth();
  const [selectedAppId, setSelectedAppId] = useState("general");

  const { data: applications = [] } = useQuery({
    queryKey: ["applications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("applications")
        .select("id, role_title, company, status")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const selectedApp = applications.find((a) => a.id === selectedAppId);
  const title = selectedApp
    ? `CV Agent — ${selectedApp.role_title}${selectedApp.company ? ` at ${selectedApp.company}` : ""}`
    : "CV Agent";
  const description = selectedApp
    ? "CV tailoring scoped to this application's role and job description."
    : "Pick an application above to anchor the CV, or ask general CV questions.";

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="px-6 py-3 border-b border-[#E5E5E5] bg-white flex items-center gap-3 shrink-0">
        <span className="text-xs font-medium text-[#525252] shrink-0">Tailoring for:</span>
        <Select value={selectedAppId} onValueChange={setSelectedAppId}>
          <SelectTrigger className="h-8 text-xs max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general">General CV help</SelectItem>
            {applications.map((app) => (
              <SelectItem key={app.id} value={app.id}>
                {app.role_title}{app.company ? ` at ${app.company}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-hidden">
        {/* key resets messages when the selected application changes */}
        <ChatInterface
          key={selectedAppId}
          agentName="application_cv_success_agent"
          title={title}
          description={description}
          applicationId={selectedAppId === "general" ? null : selectedAppId}
          suggestedPrompts={SUGGESTED_PROMPTS}
        />
      </div>
    </div>
  );
}
