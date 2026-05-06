// voice-rules.ts — positive writing-quality rules for CV + LinkedIn
// generation. Replaces the banned-vocabulary lists that previously lived
// inline in each prompt (deleted from generate-tailored-cv and
// generate-linkedin-content as part of this change).
//
// Why we shifted away from banned-word lists:
// - Empirical: in PR #16 testing, repeating the LinkedIn banned-word list
//   THREE times across the same system prompt did NOT eliminate "leverage"
//   / "seamless" leaks (still ~1-2 per generation). The failure mode isn't
//   "model didn't see the ban" — it's "model defaults to filler when
//   grounding is thin." Positive specificity rules attack the root cause:
//   when the model has concrete facts to write about, it stops reaching
//   for vocabulary filler.
// - Architectural: the role/skill libraries
//   (00_role_library.ts, 01_skill_library.ts, etc.) contain words like
//   "leverage" as canonical skill descriptors. Banning words the libraries
//   use creates mixed signal. Positive rules don't enumerate vocab so the
//   conflict disappears.
// - Maintenance: word lists drift. LinkedIn and CV prompts had different
//   ban lists for the same concept. Heuristics travel cleanly between
//   prompts; word lists don't.
//
// LINKEDIN_VOICE_RULES is research-grounded — see PR description / commit
// for sources (LinkedIn Talent Blog, Harvard FAS, Sacred Heart career
// center, Tim Queen, JobEase eye-tracking study, Konnector). Concrete
// claims (220-char headline, 1800-2200 char About, recruiter scan order)
// trace to those sources.
//
// CV_VOICE_RULES is built on the empirically-validated patterns from
// generate-tailored-cv's prior BANNED_VOCAB_RULES — promoting the
// "remove-the-word test" exception clause from edge case to core
// principle. The "interchangeable-candidate test" is new (no prior
// equivalent in the codebase).
//
// The two are intentionally NOT identical. CV is bullet-driven and
// compressed (recruiter 6-second scan); LinkedIn is conversational and
// supports longer prose (sweet-spot About is 1800-2200 chars per current
// guidance). They share the specificity-beats-filler core.

export const CV_VOICE_RULES = `WRITING QUALITY — RESUME VOICE:

Resume bullets are read in 6 seconds by humans and parsed by ATS. Every word should add a fact about what the user did or what changed because of it.

THE SPECIFICITY TEST (apply to every bullet):
Remove the most generic-feeling word in the bullet. Does the bullet still convey the same specific information? If yes, that word was filler — replace it with a concrete verb or specific noun, or delete it entirely. Run this once per bullet before emitting.

ACTION VERBS — name a real action, not a category:
A verb that lets a reader picture exactly what the user did is doing its job. A verb that names a category of action ("drove growth", "leveraged data", "facilitated alignment") is filler — the reader can't tell what actually happened. Prefer the verb that pictures the action: "Built", "Migrated", "Negotiated", "Reduced", "Coordinated", "Wrote", "Shipped".

CLICHÉS WASTE A LINE:
"Team player", "results-driven", "passionate about X", "strong communicator", "perfect fit" — recruiters skim past these because they're true of every candidate. If you'd write a bullet that describes a trait, replace it with a bullet that DEMONSTRATES the trait through a specific action. Instead of "Team player who collaborates across functions" → "Coordinated 4-person handoff between design and engineering on the checkout redesign". The action proves the trait.

NUMBERS WHEN REAL, NOT DECORATIVE:
Numbers belong in bullets when they exist in the user's source data (Story Bank metrics, responsibilities text). Round numbers that look invented ("Improved efficiency by 40%") are worse than no numbers — recruiters spot them. If the source has "shipped 2 weeks early", write that. If it doesn't, write the action without padding it with imaginary numbers. Anti-fabrication rules apply here without exception.

THE INTERCHANGEABLE-CANDIDATE TEST:
If you swap the user's name for any other student in the program and the bullet still makes sense unchanged, the bullet is filler. Real bullets reference the user's specific company, their specific tools, their specific outcomes. Generic bullets get cut.

LENGTH:
Aim for 8-15 words per bullet. A bullet that runs to two lines should earn it with a real metric or specific tool, not with adverbs and qualifiers.`

export const LINKEDIN_VOICE_RULES = `WRITING QUALITY — LINKEDIN VOICE:

LinkedIn copy should sound like the user wrote it, not like a brand wrote it. The reader's question on every line is "would a real person say this out loud?" If the answer is no, rewrite.

THE READ-ALOUD TEST:
Before emitting any sentence, mentally read it aloud in the user's voice. If it sounds like a press release, a corporate bio page, or LinkedIn-influencer copy — rewrite in plainer words. Conviction and personality are welcome; performance and polish-for-its-own-sake are not.

SPECIFICITY OVER POSTURING:
"Drove growth" is everywhere; "Doubled signups in Q1 by rewriting the onboarding flow" tells the reader something. The same specificity test from resume writing applies: remove the most generic-feeling word in a sentence — if the sentence still conveys the same specific information, that word was filler. Concrete verbs that name a real action beat verbs that name a category of action.

LINKEDIN-INFLUENCER MANNERISMS TO SKIP:
Opening with "Excited to share that..." or "Thrilled to announce", ending with "Thoughts?" or "Let's connect", scattering "humbled to" and "honored to" through prose without specific honoring context — these read as performative and recruiters skim past them. They also signal LLM-written copy. If a real person you know wouldn't text you a sentence in this register, don't write it for them.

CLICHÉ STATEMENTS ABOUT THE CANDIDATE:
"Passionate about", "results-driven", "thrives in fast-paced environments" — these tell the reader nothing because they're true of every candidate's self-description. If you'd write a sentence that describes a trait, replace it with a sentence that demonstrates the trait through specifics. Instead of "I'm passionate about user experience" → "I think onboarding is the highest-leverage place to spend a PM's first 6 weeks — that's where I've focused at Guardio." The opinion grounded in a specific claim is fine; the trait-statement is not.

HEADLINE — three pillars, each a fact, ordered by recruiter relevance:
The leading ~60 characters get the most recruiter attention (eye-tracking data shows fixation on the start of the headline). Lead with the most search-relevant pillar, not chronology or modesty. Cap at 220 characters.

For working professionals: <Current or aspirational role> | <Domain expertise> | <Concrete proof>. Example: "Customer Success Specialist at Guardio | Enterprise adoption | Drove 88% adoption in Q1 via 12 user research interviews".

For students without a current professional role: <Study area> Student at <University> | Aspiring <Target Role> | <Specific skill or proof>. "Aspiring [Role]" is acceptable in the headline for students in a way it isn't for mid-career — students should signal direction. Example: "Business Administration Student at Reichman University | Aspiring Product Manager | Customer success metrics from internship at Guardio".

Every pillar should be a verifiable fact, not a slogan. Mobile preview shows even less than desktop — front-load.

ABOUT — sound like the user, not like a brand:
First person. Aim for 1,800-2,200 characters (300-350 words) when the user's material supports it. Never pad to fill space — short and specific beats long and generic. The first sentence shows above the fold on mobile, so it must be specific from word one. Reference the user's actual roles by name, real metrics from their stories, and where they're heading (target job titles). Personality and a point of view are welcome; trait-statements like "I'm passionate about building great products" are not.

EXPERIENCE / VOLUNTEERING / MILITARY DESCRIPTIONS:
Hybrid format works best on LinkedIn: 1-2 lines of prose context (role scope, team size, mandate) followed by 3-4 outcome bullets. Pure resume-bullet copy-paste reads as lazy — context first, results second. Same specificity test applies. Real metrics from the Story Bank go verbatim per the binding rules. For military: civilian-readable framing ("Led a 12-person team through high-pressure operational deployments"), preserve unit + rank verbatim, never invent military details.

KEYWORDS RECRUITERS ACTUALLY SEARCH:
LinkedIn Headlines and About are indexed by LinkedIn Recruiter search. When the user's target_job_titles or stories include industry/function terms recruiters search for ("Product Marketing", "B2B SaaS", "Growth Analyst", "Customer Success"), surface them in the Headline and the first paragraph of About — not just the Experience section. Generic descriptions ("technology professional") aren't searchable; specific function terms are.

RECRUITER SCAN ORDER:
Recruiters typically scan: most recent Experience title/company → Headline → first 1-2 Experience entries → About (only if the first three hooked them, ~23 seconds of attention if they reach it). Load-bearing facts go in Headline + the most recent Experience entry. Don't bury a key proof point in paragraph 2 of About — it won't be read.`

// POST_VOICE_RULES — for the LinkedIn Post Creator (PRs #31-33+).
//
// Grounded in docs/research/linkedin-post-performance.md (research dated
// 2026-05-06, sources cross-validated where possible). When pilot data
// contradicts a claim here, update the research doc first then revise this
// constant. The doc tags each finding as cross-validated / single-sourced /
// contested — this constant asserts cross-validated rules and surfaces
// trade-offs on contested ones rather than picking sides.
//
// Critical pilot context: every pilot user is under 5K followers. Format
// + structure prescriptions in this rule set are calibrated for that
// audience, not for executive thought-leadership accounts.
export const POST_VOICE_RULES = `WRITING QUALITY — LINKEDIN POSTS:

DESIGN FOR SAVES, NOT JUST LIKES:
LinkedIn's 2025-2026 ranking weights saves at roughly 5x a like and 2x a meaningful comment. Posts that get SAVED contain frameworks, takeaways, lessons, or specific how-tos the reader returns to. Pure narrative without explicit takeaways gets liked once and forgotten. Numbered lists, before/after pairs, mistake-and-fix sequences — these are saveable. Make takeaways explicit ("What I learned: X, Y, Z" beats hoping the reader infers).

THE HOOK (first 140 characters — mobile truncation point):
Mobile is 91% of LinkedIn engagement. The first 140 characters either earn the click-to-expand or lose the reader.
- Specific number > generic claim: "I cut onboarding from 14 days to 3" beats "I improved onboarding."
- A specific moment > a topic header: "Last Tuesday at 11pm I realized..." beats "Reflections on engineering culture."
- Skip "Excited to share that..." / "Thrilled to announce..." / "Humbled to..." — these are now algorithmically suppressed in 2025-2026 (research-backed, not opinion).
- The hook should be readable standalone — if the truncated 140 chars don't make sense without expansion, rewrite.

STRUCTURE FOR DWELL TIME:
Posts with 15+ second dwell time get 3.2x higher distribution; posts at 0-3 second dwell get ~1.2% engagement vs 15.6% at 61+ seconds. Dwell time correlates with scannable formatting on mobile.
- 1-2 sentences per line, blank line between thoughts.
- No dense paragraphs. Mobile readers bounce off walls of text.
- Visual rhythm matters — short line, longer line, short line creates flow.

LENGTH:
Sweet spot is 1,200-2,500 characters (research n=372,126 personal posts: 27% higher engagement than posts under 400 chars).
- Under 400 chars: tells the reader you didn't have anything substantive to say.
- 1,300-2,500 chars: peak engagement.
- Over 3,000 chars: truncated below the fold and loses dwell time.

ENGAGEMENT-BAIT BLACKLIST (algorithmically suppressed 30-40%, sometimes ~0% reach):
NEVER use these in any post:
- "Agree?" / "Thoughts?" / "Comment YES if..." / "Drop a 🔥 if you..."
- "Tag someone who..." / "Like if you agree" / "Type X for the link"
- "Comment to learn more" / "Share if this resonates"
End with substance, not solicitation. If asking a question, ask a genuine one tied to the specifics of the post (not a formulaic prompt). Asking "What did I miss?" after sharing a specific framework is fine; "Thoughts?" alone is not.

HASHTAGS:
- 3-5 specific hashtags placed at the end of the post.
- Specific function/industry tags ("#productmanagement #b2bsaas #customersuccess") outperform generic lifestyle tags ("#career #motivation #grindset").
- More than 5-6 hashtags triggers spam suppression.
- Hashtags-in-first-comment was old advice — provides no algorithmic benefit anymore.
- Skip if you can't think of 3 specific ones; better than padding with generic tags.

EMOJIS:
- 1-3 functional emojis maximum, used as visual punctuation (e.g. a single ✅ before a takeaway, or a ⚡ before a key insight).
- Not as filler. Not as decoration. Not at every line break.

VOICE CONSISTENCY WITH PROFILE:
The post should sound like the same person who wrote the user's About. If baseline_data.profile.about is provided in the prompt context, match its register. A reader who sees both the post in their feed and clicks through to the profile expects the same voice — inconsistency reads as ghost-written.

SPECIFICITY (carries over from LINKEDIN_VOICE_RULES):
- "I deployed our first integration last Thursday" beats "I have experience deploying integrations."
- A real opinion grounded in a specific claim beats a safe observation. Conviction is welcome; posturing isn't.
- Cliché trait-statements ("I'm passionate about user experience", "I thrive in fast-paced environments") tell the reader nothing — replace with sentences that demonstrate the trait through specifics.

NO FABRICATION:
- Numbers in posts must come from the user's source data (Story Bank metrics, profile experiences, attached story). Round numbers that look invented hurt credibility — recruiters spot them.
- Tools, companies, projects mentioned must be real. The post becomes part of the user's public record.

FORMAT PRESCRIPTION (under 5K followers — applies to all pilot users):
LinkedIn's algorithm rewards low-friction formats for accounts under 5K followers. The default visual format for our pilot is TEXT + SINGLE IMAGE, not carousels. Carousels become optimal only above 20K followers; for sub-5K accounts they reach less and convert worse than text + image. The post body itself should be optimized first — visual format is a secondary lever.`
