import React from "react";
import ChatInterface from "../components/chat/ChatInterface";

export default function CareerAgent() {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <ChatInterface
        agentName="career_agent"
        title="AI Career Reasoning Agent"
        description="Evidence-driven career analysis. No fluff, no hype."
      />
    </div>
  );
}