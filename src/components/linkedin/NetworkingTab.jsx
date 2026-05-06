import React, { useState } from "react";
import NetworkingPrinciples from "./networking/NetworkingPrinciples";
import CommentCoach from "./networking/CommentCoach";
import OutreachConversationsList from "./networking/OutreachConversationsList";
import OutreachComposer from "./networking/OutreachComposer";

// NetworkingTab — Phase 4 (PRs A + B). Single scrollable page with three
// subsections:
//   - Networking principles (research-grounded static content, no LLM)
//   - Comment Coach (AI tool, highest-leverage motion per research)
//   - Outreach Coach (PR B): conversation-coach for 8 outreach modes —
//     list of past conversations + new/resume composer with goal-aware
//     coaching, multi-turn threads, warm-up-vs-ask judgment.
//
// Per Eli's PR #34 research-doc-driven framing: commenting on others'
// posts is arguably MORE valuable than posting for sub-1K-follower
// accounts (~55% profile-view lift when done substantively, 5-10x daily).
// That's why Comment Coach lives at the top.
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
      <div>
        <p className="text-sm text-[#525252] leading-relaxed">
          Commenting on others' posts is the highest-leverage networking activity for accounts under 1K followers.
          Research shows substantive comments delivered 5–10× daily produce a ~55% lift in profile views — more than
          posting alone for early-career accounts. The Comment Coach below grounds each comment in your real experience.
        </p>
      </div>

      <Section title="Networking principles">
        <NetworkingPrinciples />
      </Section>

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
