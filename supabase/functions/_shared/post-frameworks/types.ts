// types.ts — typed input shape per LinkedIn post type.
//
// Phase 2 (PR #32) wired up the first 3 types: project, lessons,
// milestone. Phase 3 (PR #33) adds: recap, observation, question, free_form.
//
// The frontend Compose form generates payloads matching these types; the
// edge function validates against them at the boundary. Any change here
// is a contract change between PostsTab.jsx and generate-linkedin-post.

export type PostType =
  | 'project'
  | 'lessons'
  | 'milestone'
  | 'recap'         // Phase 3
  | 'observation'   // Phase 3
  | 'question'      // Phase 3
  | 'free_form'     // Phase 3

export interface ProjectInputs {
  project_name: string
  context: 'course' | 'company' | 'hackathon' | 'personal'
  // 1-2 sentences describing the project + why it mattered
  what_you_built: string
  // Specific outcome — number, metric, shipped artifact, what changed.
  // Free-text per Eli's call PR #32: "lets users frame how they want."
  outcome: string
  portfolio_link?: string
}

export interface LessonsInputs {
  source_type: 'course' | 'role' | 'project' | 'book' | 'event'
  // e.g. "Customer Discovery class with Prof. Lee"
  source_name: string
  // 3-5 lessons. Each ≤200 chars (PR #32 smoke showed real lessons with
  // embedded specific examples run 100-180 chars; 120 was too tight).
  lessons: string[]
}

export interface MilestoneInputs {
  milestone_type: 'internship_offer' | 'role_start' | 'certification' | 'graduation' | 'other'
  // e.g. "Customer Success Specialist offer at Guardio"
  the_thing: string
  // Encouraged but not required (Eli's call PR #32). Real names, real
  // reasons — research shows specific gratitude > generic gratitude.
  people_to_thank: { name: string; reason: string }[]
  // Optional 1-sentence forward-look
  whats_next?: string
}

// PR #33 — Phase 3 input shapes.
export interface RecapInputs {
  // e.g. "TechCrunch Disrupt 2026", "Reichman AI Hackathon"
  event_name: string
  // What the user did at the event — e.g. "Team lead", "Backend dev",
  // "Pitch presenter", "Volunteer organizer"
  role_played: string
  // People to tag. linkedin_handle is optional — the LLM uses the name
  // verbatim and includes a tagging hint when handle is provided. Research
  // shows tagging materially lifts reach on event recaps.
  team_members: { name: string; linkedin_handle?: string }[]
  // Specific concrete result — won prize? built X? presented to whom?
  outcome: string
  // Optional ≤200-char single takeaway worth carrying forward
  key_lesson?: string
}

export interface ObservationInputs {
  // The trend / thing happening in the industry/space
  trend: string
  // Concrete example anchoring the user's authority to comment.
  // CRITICAL — without a specific example, observation posts read as
  // overreach for early-career accounts.
  specific_example: string
  // The actual opinion / insight grounded in the example
  your_take: string
}

export interface QuestionInputs {
  // What the user is asking about
  decision_or_topic: string
  // What the user has already considered — shows thought went in.
  // Mandatory per Eli's call PR #33: posts that skip this perform poorly.
  what_youve_considered: string
  // The specific question / what they're stuck on
  what_youre_stuck_on: string
}

export interface FreeFormInputs {
  // 1-2 sentences on what the post is about
  topic: string
  // Why posting — drives the structural defaults the LLM applies
  intent: 'share_experience' | 'ask_question' | 'make_announcement' | 'spark_discussion' | 'showcase_work'
}

// Discriminated union — used by the edge function input validator and the
// frontend payload builder.
export type PostInputs =
  | ({ post_type: 'project' } & ProjectInputs)
  | ({ post_type: 'lessons' } & LessonsInputs)
  | ({ post_type: 'milestone' } & MilestoneInputs)
  | ({ post_type: 'recap' } & RecapInputs)
  | ({ post_type: 'observation' } & ObservationInputs)
  | ({ post_type: 'question' } & QuestionInputs)
  | ({ post_type: 'free_form' } & FreeFormInputs)

// Edge function output shape (returned to the frontend + persisted to
// linkedin_posts.generated_data).
export interface GeneratedPost {
  post_text: string
  // First 140 chars — the mobile truncation point. Surfaced in the UI so
  // the user sees what shows above the "see more" cutoff.
  hook_preview: string
  hashtag_suggestions: string[]
  // For under-5K-follower accounts (every pilot user), default is
  // 'image_text'. 'carousel' is only emitted when the LLM thinks the
  // post genuinely warrants the format (rare for our pilot).
  format_recommendation: 'text_only' | 'image_text' | 'carousel'
  format_reason: string
  // Caveats the user should consider — e.g. "Public Open To Work badge
  // is contested for competitive markets" if the post mentions OTW.
  warnings: string[]
  // 1-10 LLM-self-assessed; not a hard quality gate, just a signal for
  // the UI to nudge users toward more saveable structures.
  saveable_score: number
  generated_at: string
}
