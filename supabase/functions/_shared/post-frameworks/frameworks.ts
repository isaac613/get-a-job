// frameworks.ts — per-post-type structural templates injected into the
// LLM system prompt alongside POST_VOICE_RULES.
//
// Each framework is the structural template the LLM follows for that
// post type — what hook style, what body structure, what required
// signals (named gratitude for milestone, lessons numbered for lessons),
// what hashtag direction, what format recommendation.
//
// Per Eli's design call PR #32: per-post-type templates over a single
// universal prompt. ~30-50 lines each. Per-type produces sharper output
// because the model gets explicit structure rather than inferring from
// inputs alone — same pattern that worked for generate-tailored-cv.
//
// Grounded in docs/research/linkedin-post-performance.md sections 4
// (post structure) + 5 (early-career posting). When pilot data
// contradicts a framework rule, update the research doc first then
// revise here.

export const PROJECT_FRAMEWORK = `POST TYPE — PROJECT SHOWCASE:

The user finished a class project, side project, hackathon piece, or internship deliverable and wants to share it. Audience is recruiters + peers + potential collaborators.

HOOK (first 140 chars — mobile truncation point):
Anchor on the specific outcome, not the topic. The reader should know what shipped or what changed in the first sentence.
- Good: "I cut our team's onboarding time from 14 days to 3 — here's how I redesigned the flow."
- Good: "Built a Slack bot that auto-flags stuck deals — saved my CS team 8 hours a week."
- Bad: "Recently I had the opportunity to work on an exciting project..."
- Bad: "Some thoughts on customer onboarding."

BODY STRUCTURE (1,200-2,500 chars):
1. Context (1-2 sentences): the project, where it lived (course / company / hackathon), why it mattered.
2. What was built (2-3 sentences): the specific work. Name the tools, methods, scope. Avoid generic verbs ("collaborated", "leveraged"); prefer concrete actions ("designed the schema", "ran 12 user interviews", "deployed via X").
3. What was learned or what changed (2-3 sentences): the concrete takeaways. Numbers and named outcomes when present. Skip "I learned a lot" — name the specific thing.
4. Optional close: what's next, who you'd love feedback from, where to find the work.

HASHTAGS (3-5 at end):
Function/domain specific based on the work — e.g. #userresearch #productdesign #b2bsaas. Skip generic lifestyle tags (#career #motivation).

FORMAT RECOMMENDATION:
For under-5K-follower accounts (all pilot users), recommend 'image_text'. The image should be the project artifact itself — screenshot, demo photo, presentation slide. Carousels are not the right format for this audience yet.

SAVEABLE_SCORE GUIDANCE:
Score higher (7-10) when the post contains a concrete framework, methodology, or numbered takeaway readers might come back to. Score lower (3-6) when the post is primarily narrative without explicit takeaways.`

export const LESSONS_FRAMEWORK = `POST TYPE — LESSONS LEARNED:

The user finished something (course, role, project, book, event) and is sharing 3-5 specific lessons. This is the most natively saveable post type — numbered lists are the format readers come back to.

HOOK (first 140 chars):
Name the source AND give a teaser of what's at stake. The reader should know what experience the lessons came from in the first sentence.
- Good: "5 lessons from running my first user research study at Guardio — including the one that changed how I write interview scripts."
- Good: "I just finished Reichman's Customer Discovery course. Here are the 4 things I'm taking back to my internship."
- Bad: "Some lessons I learned recently."
- Bad: "Reflections on customer discovery."

BODY STRUCTURE (1,200-2,500 chars):
- 1 sentence setting context after the hook: when, where, what you were doing.
- Numbered list of 3-5 lessons. Each lesson:
  - Headline (one short sentence stating the lesson).
  - 1-2 sentences elaborating with a SPECIFIC EXAMPLE from the user's actual experience (not abstract). The example is what makes the lesson saveable — readers save concrete evidence, not abstract claims.
- Optional close: what you're taking forward, or an open question that ties to the specifics of the post (NOT "Thoughts?" — that's engagement-bait).

HASHTAGS (3-5 at end):
Topic + audience specific — e.g. #userresearch #earlycareer #productmanagement. Skip generic.

FORMAT RECOMMENDATION:
For under-5K-follower accounts, 'text_only' or 'image_text' both work. If using an image, it should be a visual list / infographic / screenshot of the work — not a stock photo or motivational quote graphic.

SAVEABLE_SCORE GUIDANCE:
This format inherently scores high (8-10) when the lessons are concrete and example-backed. Score lower if the lessons are abstract ("be a good listener", "communication matters") without specifics — those don't get saved.`

export const MILESTONE_FRAMEWORK = `POST TYPE — CAREER MILESTONE:

The user is sharing news: internship offer, role start, certification, graduation, or other career-significant event. This is the highest-temptation post type for the algorithmically-suppressed openers ("Excited to share that...", "Thrilled to announce...", "Humbled to share..."). Avoid them strictly.

HOOK (first 140 chars):
Name the specific milestone with concrete detail, NOT generic excitement.
- Good: "Just signed my offer — joining Guardio as a Customer Success Specialist starting October."
- Good: "Walked the stage today. Bachelor's in Business Administration from Reichman, specialization in Digital Innovation."
- Good: "Today's my first day at Atera. Spent the morning reading the renewal playbook our CS lead wrote — already learning."
- Bad: "Excited to share that I've accepted a new role!"
- Bad: "Thrilled to announce that I'm graduating today."
- Bad: "Humbled to be joining the [Company] team."

BODY STRUCTURE (1,200-2,500 chars — milestone posts can run shorter, 600-1,500, since they're news-shaped):
1. The hook (first sentence): the specific milestone.
2. Context (1-2 sentences): how you got here. The journey, the work, the choice. Concrete, not generic.
3. NAMED GRATITUDE (this is the load-bearing part of milestone posts):
   - Real names of real people (not "everyone who supported me along the way")
   - Real reasons specific to each person (not "for believing in me")
   - Examples: "Thanks to Sarah Chen for the mock-interview prep", "Thanks to Prof. Lee for the customer-discovery framework I used in the final-round case"
   - Tag people if they're on LinkedIn — research shows tagging materially lifts reach.
4. Forward-look (optional, 1 sentence): what you're starting on / what you're excited to learn — but skip "excited to learn" if it reads as generic. Specific is better: "First week I'm shadowing the renewal cohort", not "Excited to dive in!"

HASHTAGS (3-5 at end):
Industry + role specific — e.g. #customersuccess #b2bsaas #firstrole #studentlife (only if accurate). Avoid #blessed, #grateful, #journey — these signal LinkedIn-influencer voice.

FORMAT RECOMMENDATION:
'image_text' for milestone posts works well — graduation photo, offer letter (with sensitive info redacted), team photo, certification badge. Personal photos lift engagement materially. 'text_only' works for milestones without a natural visual.

SAVEABLE_SCORE GUIDANCE:
Milestone posts are typically liked, not saved (they're news, not reference material). Score 4-6 unless the post contains a specific framework or takeaway that other early-career readers might save (e.g. "the mock-interview prep approach that worked for me").

WARNINGS TO EMIT:
- If milestone_type is 'internship_offer' or 'role_start' AND the user's profile has no public Open To Work badge, do NOT emit a warning. If the user has Open To Work currently public, emit: "Public Open To Work badge is contested for competitive markets per our research — consider switching to the private 'Open to Recruiters' toggle once you've started the role." (Phase 2 doesn't have OTW state in profile yet — defer this warning. Just leave warnings empty for milestone v1.)`
