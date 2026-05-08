import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { createPageUrl } from "@/utils";
import CommentCoach from "./networking/CommentCoach";
import OutreachConversationsList from "./networking/OutreachConversationsList";
import OutreachComposer from "./networking/OutreachComposer";

// NetworkingTab — Phase 4 (PRs A + B). Two AI tools:
//   - Comment Coach (AI tool, highest-leverage motion per research)
//   - Outreach Coach (PR B): conversation-coach for 8 outreach modes —
//     list of past conversations + new/resume composer with goal-aware
//     coaching, multi-turn threads, warm-up-vs-ask judgment.
//
// The networking strategy/principles content lives in Resources (linked
// at the top) — it's reference material, not something users want to
// scroll past on every visit to the tools.
export default function NetworkingTab() {
  // Outreach section view state. null/list = show list; "new" = composer
  // with no conversation; UUID = composer loaded for that conversation.
  const [outreachView, setOutreachView] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const openConversation = (id) => setOutreachView(id);
  const newConversation = () => setOutreachView("new");
  const backToList = () => {
    setOutreachView(null);
    setRefreshKey((k) => k + 1);
  };
  const onConvoChange = () => setRefreshKey((k) => k + 1);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link
        to={createPageUrl("Resources")}
        className="block bg-[#FAFAFA] hover:bg-[#F5F5F5] border border-[#E5E5E5] rounded-lg px-4 py-3 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[#525252] leading-snug">
            New to LinkedIn networking? <span className="font-medium text-[#0A0A0A]">Read the strategy guide</span> — comment + reply windows, connection-request strategy, cold outreach reply rates, Israeli market context.
          </p>
          <ArrowRight className="w-4 h-4 text-[#525252] flex-shrink-0" />
        </div>
      </Link>

      <Section title="Comment Coach">
        <CommentCoach />
      </Section>

      <Section title="Outreach Coach">
        {outreachView === null ? (
          <OutreachConversationsList
            onOpen={openConversation}
            onNew={newConversation}
            refreshKey={refreshKey}
          />
        ) : (
          <OutreachComposer
            conversationId={outreachView === "new" ? null : outreachView}
            onBack={backToList}
            onChange={onConvoChange}
          />
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider text-[#A3A3A3] font-medium mb-3">{title}</h2>
      {children}
    </section>
  );
}
