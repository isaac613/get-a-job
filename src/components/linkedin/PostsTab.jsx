import React from "react";
import { FileText } from "lucide-react";

// PostsTab — Phase 1 stub. Phase 2 wires up:
//   - linkedin_posts schema (migration in same PR as the edge function)
//   - generate-linkedin-post edge function (3 post types: project,
//     lessons, milestone)
//   - PostComposer + PostPreview components, hook preview, hashtag
//     suggestions, format recommendation badge ("better at 20K+
//     followers" gating for carousels)
//   - POST_VOICE_RULES already added in this PR (Phase 1)
//
// See docs/research/linkedin-post-performance.md for the source-of-truth
// findings, and ROADMAP for the phase plan.
export default function PostsTab() {
  return (
    <div className="max-w-3xl mx-auto py-12 text-center">
      <div className="bg-white rounded-xl border border-[#E5E5E5] p-8">
        <FileText className="w-8 h-8 text-[#A3A3A3] mx-auto mb-3" />
        <h2 className="text-base font-semibold text-[#0A0A0A] mb-1">Post Creator</h2>
        <p className="text-sm text-[#525252] mb-3">
          Coming soon — generate LinkedIn posts grounded in your profile, Story Bank, and career goals.
        </p>
        <p className="text-[11px] text-[#A3A3A3] leading-relaxed">
          Will support: project showcases, lessons learned, career milestones, hackathon recaps,
          industry observations, community questions, free-form. Each post is designed to be
          saveable (research shows saves are weighted ~5× a like in 2025-2026 ranking).
        </p>
      </div>
    </div>
  );
}
