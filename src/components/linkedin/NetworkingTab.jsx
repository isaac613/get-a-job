import React from "react";
import NetworkingPrinciples from "./networking/NetworkingPrinciples";
import CommentCoach from "./networking/CommentCoach";

// NetworkingTab — Phase 4 PR A. Single scrollable page (option 8A from
// architecture call) with three subsections:
//   - Networking principles (research-grounded static content, no LLM)
//   - Comment Coach (AI tool, highest-leverage motion per research)
//   - Outreach (PR B: conversation-coach style for 8 outreach modes —
//     this is reserved here as a header/coming-soon block until PR B
//     lands; design decisions surfaced in PR #34 thread)
//
// Per Eli's PR #34 research-doc-driven framing: commenting on others'
// posts is arguably MORE valuable than posting for sub-1K-follower
// accounts (~55% profile-view lift when done substantively, 5-10x daily).
// That's why Comment Coach lives in PR A and ships first.
export default function NetworkingTab() {
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
        <div className="bg-white border border-[#E5E5E5] rounded-xl p-5">
          <p className="text-sm text-[#525252] mb-2 leading-snug">
            <strong className="text-[#0A0A0A]">Coming next.</strong> A conversation-coach tool for cold outreach — pick your goal (recruiter, hiring manager, alumni, informational interview, thank-you, reconnect, referral, recommendation), describe the person, send their reply back to coach the next response.
          </p>
          <p className="text-[11px] text-[#A3A3A3] italic leading-snug">
            For multi-step goals like asking for a referral, the AI coaches you to warm up first rather than asking immediately. The full conversation history stays visible so the AI knows where the conversation is heading.
          </p>
        </div>
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
