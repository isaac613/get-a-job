import React from "react";
import ChatInterface from "../components/chat/ChatInterface";

const SUGGESTED_PROMPTS = [
  "Analyse my skill gaps for my target roles",
  "Build me a 3-month learning plan",
  "What projects would prove my skills to employers?",
  "Which skill should I prioritise first?",
  "Recommend courses to close my biggest gap",
];

export default function SkillDevelopmentAdvisor() {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <ChatInterface
        agentName="skill_development_agent"
        title="Skill Development Advisor"
        description="Gap analysis, learning plans, and project recommendations tailored to your profile."
        suggestedPrompts={SUGGESTED_PROMPTS}
      />
    </div>
  );
}
