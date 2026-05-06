import React from "react";
import { Users } from "lucide-react";

// NetworkingTab — Phase 1 stub. Phase 4 wires up:
//   - Static educational content (60% of the page) — the research
//     findings presented as in-app guidance. Hardcoded, no LLM calls.
//   - Comment generator (highest-value feature per the research):
//     paste a post → 3 substantive comment options grounded in user's
//     experience. 15+ words each. Drives the "comments on others'
//     posts → 55% profile view lift" motion that's higher-leverage
//     than posting for sub-1K-follower accounts.
//   - Outreach message generator: cold DMs to recruiters / hiring
//     managers, personalized via user context.
//   - Connection request note generator: short notes referencing
//     mutual context (alumni, course, shared event).
//
// See docs/research/linkedin-post-performance.md sections 5+6 for the
// source-of-truth findings.
export default function NetworkingTab() {
  return (
    <div className="max-w-3xl mx-auto py-12 text-center">
      <div className="bg-white rounded-xl border border-[#E5E5E5] p-8">
        <Users className="w-8 h-8 text-[#A3A3A3] mx-auto mb-3" />
        <h2 className="text-base font-semibold text-[#0A0A0A] mb-1">Networking</h2>
        <p className="text-sm text-[#525252] mb-3">
          Coming soon — guidance and tools for LinkedIn networking.
        </p>
        <p className="text-[11px] text-[#A3A3A3] leading-relaxed">
          Will include: substantive comment generator, cold outreach templates,
          connection request notes, and the research showing that thoughtful
          comments on others' posts (15+ words, 5–10/day) drive ~55% more
          profile views than posting alone for early-career accounts.
        </p>
      </div>
    </div>
  );
}
