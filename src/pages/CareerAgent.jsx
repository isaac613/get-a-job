import React from "react";
import ChatInterface from "../components/chat/ChatInterface";

const SUGGESTED_PROMPTS = [
  "Am I ready to apply for my Tier 1 roles?",
  "What should I focus on this week?",
  "Which role should I target first and why?",
  "What's my biggest gap blocking a Tier 1 role?",
  "Reassess my roadmap based on my current profile",
];

export default function CareerAgent() {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <ChatInterface
        agentName="career_agent"
        title="AI Career Agent"
        description="Honest, data-driven career strategy based on your actual profile and roadmap."
        suggestedPrompts={SUGGESTED_PROMPTS}
      />
    </div>
  );
}
