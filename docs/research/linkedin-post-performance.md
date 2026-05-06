# LinkedIn Post Performance Research

**Last researched:** 2026-05-06
**Audience:** Get A Job Post Creator + Networking features. Reichman pilot Aug 2026.
**Methodology:** 24 WebSearch queries + 9 successful WebFetches (2 returned 403, noted). All citations dated.

This document is the knowledge base grounding our LinkedIn-related LLM prompts (`POST_VOICE_RULES`, `LINKEDIN_VOICE_RULES`, networking-tool prompts). When something in our prompts is contested or single-sourced, that's tracked here so we can revisit if pilot evidence diverges.

---

## 1. Algorithm 2024-2026

### 360Brew foundation model

LinkedIn published a research paper (arXiv 2501.16450, January 2025) describing 360Brew, a 150B-parameter decoder-only foundation model designed for personalized ranking and recommendation across feed, jobs, People-You-May-Know, and other surfaces. It can solve 30+ predictive tasks without task-specific fine-tuning.

LinkedIn has **not published a deployment timeline**; creators reported distribution shifts mid-2025 consistent with quiet rollout, but no public confirmation that 360Brew powers the consumer feed.

**Practical implication:** the model performs semantic reasoning on profile + post + interaction text — so profile/niche/content alignment and topic consistency matter more than keyword-match tactics.

Sources: [thelinkedblog.com 360brew](https://thelinkedblog.com/2025/360brew-linkedin-algorithm-new-update-3619/) (2026-05-06); [arXiv 2501.16450](https://arxiv.org/abs/2501.16450) (2026-05-06)

### Social graph → interest graph shift

Multiple 2025 sources report that LinkedIn now distributes content based on demonstrated interests rather than connection proximity. Reported result:
- Impressions per post **down 50–66%** since 2023
- Engagement *rate per impression* **up 12–39%** across formats

Sources: [Socialinsider 2026 benchmarks](https://www.socialinsider.io/social-media-benchmarks/linkedin) (2026-05-06); Algorithm Insights Report 2025 by Richard van der Blom (240 pages, 1.8M posts across 58K profiles + 31K pages, 60+ countries)

### Dwell time is now a top ranking signal

- Posts with 61+ second dwell time measured at **15.6% engagement rate** vs **1.2%** for posts at 0–3 seconds
- Posts with 15+ second dwell get **3.2× higher distribution**

Sources: [meet-lea.com algorithm explainer](https://meet-lea.com/en/blog/linkedin-algorithm-explained) (2026-05-06); [Hootsuite 2025 algorithm guide](https://blog.hootsuite.com/linkedin-algorithm/) (2026-05-06) independently confirms LinkedIn is "placing more weight on dwell time"

### Engagement-signal weights

AuthoredUp's 2025 algorithm research:
- Comments ≈ **2× a like**
- **Saves ≈ 5× a like and ~2× a meaningful comment**
- Indirect comment threads (replies-to-replies) produce up to **2.4× reach**

Multiple secondary sources cite "comments 15× weight of likes" — this number traces back to Richard van der Blom's report and is the most-repeated figure in 2025 trade press, but is **not LinkedIn-published**.

Sources: [AuthoredUp algorithm post](https://authoredup.com/blog/linkedin-algorithm) (2026-05-06)

### Knowledge content emphasis & engagement-bait penalties

Sources agree LinkedIn aggressively suppresses engagement-bait. Posts ending with "Agree?" / "Thoughts?" / "Comment YES if…" are reportedly downranked **30–40%**, with some 2025 reports of ~0% reach for the most blatant patterns.

"Spam-filter" rejection of posts before any audience reportedly rose from 40% (2024) to 50%+ (2025) — single-source claim, not corroborated by LinkedIn officially.

Sources: [DEV community](https://dev.to/synergistdigitalmedia/linkedins-algorithm-in-2025-why-engagement-pods-are-dead-and-what-works-now-1f6h) (2026-05-06); [Botdog](https://www.botdog.co/blog-posts/linkedin-algorithm-2025) (2026-05-06)

### Link penalty — contested

- Trade sources cite **25–50% reach reduction** for posts with external links in the body
- **However**, LinkedIn's Sr. Director of Product Management publicly stated there is no intentional algorithmic penalty for posts containing links *"if your content leads with value"*
- Link-in-first-comment is widely reported to mitigate the penalty (5–15% reduction vs body link)
- LinkedIn Articles/Newsletters carry no link penalty

Sources: [Matt Navarra summary of LinkedIn product post](https://www.threads.com/@mattnavarra/post/DOWa_61Cown/) (2026-05-06); [Gromming](https://gromming.com/blog/linkedin-external-links-penalty) (2026-05-06)

### Newsletters & Articles

Native newsletters bypass the feed algorithm — every issue triggers in-app push + email to all subscribers, with reported open rates of **40–60%**. Newsletter posts reportedly see 20–30% higher reach than regular posts.

*Source quality note:* these are vendor sources, not LinkedIn-published.

---

## 2. Format performance

### Socialinsider 2026 benchmarks

1.3M posts, 16,645 business pages, Jan 2024–Dec 2025:

| Format | 2025 ER | 2026 ER | YoY |
|---|---|---|---|
| Native document (carousel) | 6.10% | 7.00% | +14% |
| Multi-image | 6.60% | 6.45% | -2% |
| Video | 5.60% | 6.00% | +7% |
| Image (single) | 4.85% | 5.30% | +9% |
| Text | 4.00% | 4.50% | +12% |
| Poll | 4.40% | 4.20% | -5% |
| Link | 3.30% | 3.25% | -2% |

Overall LinkedIn engagement rate 5.20% (2026).

**Caveat:** this is *business pages only* — personal profiles vary.

Source: [Socialinsider](https://www.socialinsider.io/social-media-benchmarks/linkedin) (2026-05-06)

### AuthoredUp 2026 — personal profiles

3M+ posts, March 2025–Feb 2026, *personal profiles*:

- Documents: **1.39× reach / 1.30× engagement**
- Images: **1.20× reach / 1.33× engagement**
- Video: **0.86× reach** (down 36% YoY)
- Polls: **1.78× reach but only 0.37× engagement** (the "reach trap" — votes ≠ conversations)
- Reshares: **0.29×**

Source: [AuthoredUp best-performing-content](https://authoredup.com/blog/best-performing-content-on-linkedin) (2026-05-06)

### Critical: under-5K-follower prescription

**For accounts under 5K followers** (this is virtually all our pilot users), AuthoredUp 2026 prescribes **images over all other formats**:

> "The algorithm relies more heavily on low-friction formats that drive quick reactions."

Documents become dominant only **above 20K followers**. This contradicts generic LinkedIn-best-practices advice that says "post carousels."

**Pilot implication:** default post format should be image + text, not carousel. Carousels should be flagged as "better at 20K+ followers" in the UI.

### Format specifications

**Carousels:**
- Sweet spot 8–15 slides (some sources say 6–12)
- 1080×1080 (1:1) or 1080×1350 (4:5)
- PDF upload, min 24pt body font, 6–8 lines text per slide max
- LinkedIn's hard cap: 300 pages / 100MB
- "5 slides fully viewed beats 100 slides half-viewed" — completion rate, not length, drives ranking

**Native video:**
- 5× engagement of text-only per Hootsuite
- Sweet spot 30 seconds–3 minutes; <60 seconds drives highest engagement
- 4:5 vertical preferred (80%+ mobile views), MP4, captions strongly recommended
- AuthoredUp counter-finding: videos 3+ min get 1.21× reach vs 0.96× for <30 seconds — **contradicts** the "shorter is better" trade consensus

**Polls:** 7-day duration with 3 answer options performs best (van der Blom)

### Polls — contested

- Socialinsider data shows polls steady
- Van der Blom finds polls 1.64× reach for personal profiles (up from 1.32×) but 1.19× for company pages (down from 1.64×)
- Some 2026 trade sources call polls "algorithmically dead" — single-sourced and contested

---

## 3. Frequency + timing

### Frequency

**2–5 posts/week** is the cross-validated optimal range. AuthoredUp 2026 finds 4–5/week peaks at 2.60% engagement.

- Posting >1× per day reduces reach on the newest post
- Only 7.1% of LinkedIn's billion users post consistently
- 3–4×/week puts you in **top 10% of creators**

Sources: [Hootsuite](https://blog.hootsuite.com/linkedin-algorithm/) (2026-05-06); [AuthoredUp](https://authoredup.com/blog/linkedin-algorithm) (2026-05-06); Buffer; Socialinsider; [Closely](https://blog.closelyhq.com/linkedin-algorithm-2025-post-at-these-exact-times-10x-reach/) (2026-05-06)

### Timing — directly contradictory between major sources

| Source | Methodology | Peak time |
|---|---|---|
| [Buffer 2026](https://buffer.com/resources/best-time-to-post-on-linkedin/) | 4.8M posts, timezone-adjusted | Wed/Thu/Fri 3 PM–8 PM weekdays in audience local time. Top: Wed 4 PM, Fri 3 PM, Fri 4 PM |
| [Sprout Social](https://sproutsocial.com/insights/best-times-to-post-on-linkedin/) | ~2B engagements, 307K profiles, Nov 2025–Feb 2026 | Tue 11 AM–5 PM; engagement during traditional business hours, **not** late afternoon |

These directly contradict each other on whether the optimal window is mid-morning or late afternoon. **Surface this contradiction to users** rather than picking one.

### Israel-specific timing

Israeli workweek is **Sunday–Thursday**. Best days for Middle East audiences are Tuesday–Wednesday during work hours (corresponds to Israeli mid-week). IST is UTC+2/3 (DST).

**Gap:** no Israel-specific dataset on hour-by-hour engagement surfaced.

Sources: [match-b2b.com](https://www.match-b2b.com/the-advanced-linkedin-b2b-guide-a-catalyst-for-growth-in-israel-and-globally) (2026-05-06)

### Comment-response timing

- Replying within 30 minutes correlates with **64% more total comments** and **2.3× more views** (Closely)
- Within 15 minutes → reported "90% algorithmic boost" (single-source meet-lea.com, weakly evidenced)
- The first 60 minutes ("golden hour") determines second/third-degree expansion: <500 impressions in hour 1 typically caps further reach

---

## 4. Post structure that drives engagement

### Hook length & "see more" cutoff

- **Mobile truncates around 140 characters; desktop ~210**
- Hooks under 10–12 words consistently outperform
- Analysis claims 65% of users decide whether to expand based on opening line alone

*Source quality note:* the "65% decide on opening line" figure comes from single-vendor sources; treat as directional.

### Optimal body length (AuthoredUp, n=372,126 personal posts, Sept 2025–Feb 2026)

| Range | Median ER | Comments |
|---|---|---|
| 1–400 chars | 2.10% | 1 |
| 1,301–2,000 | **2.61%** | 5 |
| 2,001–2,500 | **2.67%** | 6 |
| 2,501–3,000 | 2.62% | 7 |

**"1,301–2,500 generates 27% higher engagement than posts under 400 chars."** Cross-validated by digitalblacksmiths.io (1,200–1,800 chars).

Source: [AuthoredUp character-limit study](https://authoredup.com/blog/linkedin-character-limit) (2026-05-06)

### Line breaks / 1-sentence-per-line

Still works, primarily because it raises dwell time on mobile (**91% of engagement is mobile** per van der Blom). Posts formatted for readability claim ~3× engagement vs dense blocks (vendor figure, not LinkedIn-published).

### Hashtags

**Cross-validated optimal: 3–5 hashtags, placed at end of post.**

- >5–6 triggers spam suppression per multiple sources
- Hashtags-in-first-comment is now considered **outdated** and provides no algorithmic benefit
- AuthoredUp's stronger position: hashtags "no impact" — useful only as topic signals to the model

### CTAs

- Closing questions drive comments
- Engagement-bait questions ("Agree?") do the opposite
- Open-ended questions tied to genuine curiosity outperform formulaic prompts

### Emojis

- Single-source claim: emojis lift engagement 48%, "15–16 is optimum for hitting 100 likes"
- Only 1.5% of posts use >10 emojis; 90% use 0–2
- **Most cited safe range: 1–3 functional emojis per post**

Treat the 48% number cautiously — single-source.

---

## 5. Early-career / student posting (priority section for our pilot)

### Profile fundamentals first

- Profiles with photos receive **21× more views**
- Complete profiles rank 60% higher in search
- Profiles report 71% higher interview-callback rates

Before any posting strategy, students need: photo, banner, keyword headline, completed sections.

### Open To Work badge — contested

- LinkedIn data: **220M users globally** have it (35% YoY growth)
- Public-badge users reportedly receive 40% more recruiter messages
- "Open To Recruiters" (private toggle) users see ~3× outreach
- LinkedIn poll of ~3,000 recruiters: **70% view #OpenToWork positively**

**Counter-evidence:** Fortune (Sept 2024) and multiple recruiters quoted in trade press say the green frame can read as desperate or trigger lowball offers in competitive markets.

**Net guidance:** the private "Open to Recruiters" toggle is uncontroversial; the public green badge is contested. Surface the trade-off to students rather than recommending universally.

Sources: [Huntr](https://huntr.co/blog/linkedin-open-to-work) (2026-05-06); CNBC (WebFetch returned 403, relying on search snippet); [Fortune](https://fortune.com/2024/09/05/linkedin-opentowork-badge-recruiters-job-search/) (2026-05-06)

### Building/learning in public for students

Trade sources support it but with **no rigorous engagement data specific to students**. Concrete formats that work for low-experience accounts:

- Sharing class projects (with team members tagged)
- Hackathon recaps with lessons + concrete outcomes/prizes
- Milestone posts on coursework or certifications

**Tagging relevant orgs/people materially lifts reach.** Real example cited: hackathon-takeaway post with 300+ likes, 60 comments.

**Gap:** No dataset isolating early-career engagement rates.

Sources: [Medium TechTogether](https://medium.com/techtogether/how-to-highlight-your-hackathon-experience-on-your-linkedin-4fae224863e5) (2026-05-06); [LinkedIn Pulse Grads Guide](https://www.linkedin.com/pulse/linkedin-grads-guide-2025-jobs-industries-cities-rise-new-ggnje) (2026-05-06)

### "I'm graduating and looking for…" posts

No data study isolates these. Trade-press consensus:
- Works *if* it includes specifics (target roles, geographies, skills) and a portfolio link
- Generic "I'm available!" posts underperform
- The post itself is less important than proactive outreach (DMs to hiring managers, informational interviews) — that's what shortens time-to-interview

### Asking questions vs answering

**Both work but for different ends:**

- **Asking questions in your own posts** drives comment volume
- **Answering questions on others' posts** (substantive comments, 15+ words) builds visibility into target communities

Reportedly **55% lift in profile views** when answering 5–10× daily (single-vendor figure).

**Comments-on-others' posts is widely recommended as the higher-leverage tactic for students with no audience.** This is the central insight of this section.

### Common student mistakes (qualitative, multi-source)

- Inappropriate profile photos (selfies, group photos, party pics)
- Hijacking others' posts to drop self-promo links
- Generic "10 things I learned" posts copied from templates with no personal substance
- Sarcastic / political / oversharing personal-trauma posts (the "triumph over tragedy" cliché)
- Posting without a content plan / inconsistent topics
- Engagement-bait phrasing (now actively suppressed)

---

## 6. Networking for job seekers

### Connection-request weekly limit

- **~100 invitations/week** is the standard cap
- High-quality, mature, high-acceptance accounts can reach 150–200/week
- New accounts should ramp gradually
- **Free LinkedIn accounts are now limited to 5 personalized note invites per month** — Premium/Sales-Nav lifts this
- Sending 100 in one morning is flagged; spread across 5–6 days, 20–25/day

### Acceptance rate floor

Stay above **30% acceptance** to avoid algorithmic restriction; 40–60% is healthy.

Sources: [Skylead](https://skylead.io/blog/linkedin-connection-limit/) (2026-05-06); [LeadLoft](https://www.leadloft.com/blog/linkedin-limits) (2026-05-06)

### With note vs without — contested

- **Botdog** (16,492-invite study): overall 37% acceptance; **no-note invites outperformed** personalized notes ("less salesy")
- **Writecream** (Aug 2025): +45% with personalized notes — opposite finding

**Cross-validated:** personalized notes lift the **post-acceptance reply rate** (9.36% vs 5.44% per salesforge.ai) even where they don't lift acceptance.

**For students, practical guidance:** a short, specific note referencing mutual context (alumni, course, shared event) is the safe default.

Sources: [Botdog 16K invites study](https://www.botdog.co/blog-posts/linkedin-acceptance-rates) (2026-05-06)

### Cold outreach reply rates

- LinkedIn DMs average **10.3% reply rate** (vs 5.1% cold email)
- First-degree messenger campaigns: 16.86%
- **HR/talent-acquisition recipients have the highest reply rate (12.08%)** — relevant because students DMing recruiters is a higher-yield motion than DMing hiring managers

Source: [Expandi H1 2026 report](https://expandi.io/blog/state-of-li-outreach-h1-2025/) — 70K+ campaigns analyzed (2026-05-06)

### "Invite to connect from likers" feature

**Gap:** no authoritative source explicitly discouraging this or reporting algorithmic consequences. Available materials describe LinkedIn's anti-spam systems generally (mass-invite tagging, "I don't know this person" → spam flag) but nothing specific to the "invite likers" feature.

---

## Cross-validated findings (multiple independent sources agree)

1. Optimal posting frequency 2–5×/week
2. Optimal text length 1,200–2,500 characters; hook in first 140–210 chars
3. Comments worth materially more than likes; saves worth materially more than comments
4. Native documents/carousels and multi-image posts top the format leaderboard for organic engagement (business pages); **images top under-5K-follower personal profiles**
5. Hashtags: 3–5, placed at end; >5–6 hurts reach
6. Engagement-bait phrasing ("Agree?", "Comment YES…") is actively suppressed
7. Reply to comments within the first hour to maximize distribution
8. Mobile-first: 91% of engagement is mobile; vertical/4:5 video, scannable line breaks
9. Native LinkedIn newsletters get push + email distribution outside the feed algorithm
10. Connection-request weekly limit ~100; acceptance must stay above ~30% to avoid throttling

## Single-sourced or contested claims

- "Comments worth 15× a like" — traces to Richard van der Blom's report; widely repeated, not LinkedIn-published
- "360Brew is currently powering the consumer feed" — no LinkedIn confirmation
- External-link reach penalty severity (LinkedIn officially denies; trade press cites 25–50%)
- Carousel slide-count optimum (range: 5–15 across sources)
- Polls — Socialinsider says steady, AuthoredUp says reach-trap, some sources call them dead
- Best posting time of day (Buffer = late afternoon; Sprout Social = mid-morning; directly contradictory)
- Personalized connection notes (Botdog: hurts acceptance; Writecream: +45%)
- Open To Work public badge effect (CNBC: positive; Fortune: hurts in competitive markets)
- "Engagement-bait posts now get 0% reach" — single-source, treat as directional
- Emoji counts (claim of "15–16 emojis optimal" comes from a single study; conventional 1–3 is broader consensus)

## Gaps in available research

- **Israel-specific engagement data:** no hour-by-hour or Hebrew-vs-English comparative dataset surfaced. Sunday–Thursday workweek is acknowledged but no benchmark study isolates Israeli professionals
- **Early-career / student-specific engagement rates:** trade content covers what students *should* post, but no study isolates engagement rates for accounts under 1K followers or for student accounts
- **"Invite people who liked your post to connect"** — no authoritative source on whether LinkedIn discourages or penalizes this
- **Reichman / Israeli-tech sector posting norms** — no surfaced data
- **Hebrew-language post engagement** vs English in Israeli market — directional cultural advice only, no quantitative source
- **360Brew deployment status** — confirmed only via creator-reported anomalies
- **Replication of headline figures** (e.g. "saves are 5× a like") in independent academic or LinkedIn-published research — almost all numbers come from creator-tools vendors with commercial incentives

---

## Sources fetched (all 2026-05-06)

### WebFetch successful

- [AuthoredUp — How the LinkedIn Algorithm Works in 2025](https://authoredup.com/blog/linkedin-algorithm)
- [AuthoredUp — Best Performing Content on LinkedIn 2026](https://authoredup.com/blog/best-performing-content-on-linkedin)
- [AuthoredUp — LinkedIn Character Limits 2026](https://authoredup.com/blog/linkedin-character-limit)
- [Socialinsider — LinkedIn Organic Benchmarks](https://www.socialinsider.io/social-media-benchmarks/linkedin)
- [thelinkedblog — 360Brew and the LinkedIn Algorithm](https://thelinkedblog.com/2025/360brew-linkedin-algorithm-new-update-3619/)
- [Hootsuite — How the LinkedIn algorithm works in 2025](https://blog.hootsuite.com/linkedin-algorithm/)
- [Buffer — Best Time to Post on LinkedIn 2026](https://buffer.com/resources/best-time-to-post-on-linkedin/)
- [Sprout Social — Best Times to Post on LinkedIn 2026](https://sproutsocial.com/insights/best-times-to-post-on-linkedin/)
- [Expandi — State of LinkedIn Outreach H1 2026](https://expandi.io/blog/state-of-li-outreach-h1-2025/)
- [Botdog — LinkedIn Algorithm 2025](https://www.botdog.co/blog-posts/linkedin-algorithm-2025)
- [Closely — LinkedIn Algorithm 2025](https://blog.closelyhq.com/linkedin-algorithm-2025-post-at-these-exact-times-10x-reach/)
- [Botdog — LinkedIn Connection Acceptance Rates 16K+ Invites](https://www.botdog.co/blog-posts/linkedin-acceptance-rates)
- [Huntr — LinkedIn Open to Work](https://huntr.co/blog/linkedin-open-to-work)

### WebFetch failed (403)

- CNBC — On LinkedIn, 220 million people are 'open to work' (relied on search snippet)
- Salesforge — LinkedIn Connection Acceptance Rate (relied on search snippet)

### Additional sources surfaced via WebSearch (24 queries)

- [arXiv 2501.16450 — 360Brew paper](https://arxiv.org/abs/2501.16450)
- [LinkedIn Algorithm Insights Report 2025 — Richard van der Blom](https://www.linkedin.com/posts/richardvanderblom_chapter-1-algorithm-insights-report-2025-activity-7322514599126130688-Q895)
- [Fortune — LinkedIn Open to Work helps or hurts](https://fortune.com/2024/09/05/linkedin-opentowork-badge-recruiters-job-search/)
- [Oktopost — LinkedIn Carousel Best Practices](https://www.oktopost.com/blog/linkedin-carousel-pdf-best-practices/)
- [Postnitro — LinkedIn Carousel Posts Guide](https://postnitro.ai/blog/post/linkedin-carousel-posts-ultimate-professional-guide-for-2025)
- [meet-lea — LinkedIn Algorithm Explained 2026](https://meet-lea.com/en/blog/linkedin-algorithm-explained)
- [Gromming — LinkedIn External Links Penalty](https://gromming.com/blog/linkedin-external-links-penalty)
- [InfluenceFlow — LinkedIn Newsletter Strategy 2026](https://influenceflow.io/resources/linkedin-newsletter-strategy-complete-guide-to-building-an-engaged-subscriber-base-in-2026/)
- [DEV — LinkedIn's Algorithm in 2025: Why Engagement Pods Are Dead](https://dev.to/synergistdigitalmedia/linkedins-algorithm-in-2025-why-engagement-pods-are-dead-and-what-works-now-1f6h)
- [Closely — LinkedIn Hashtag Strategy 2025](https://blog.closelyhq.com/linkedin-hashtag-strategy-data-from-10000-posts-analysis/)
- [Alsona — LinkedIn Cold Message Reply Benchmarks](https://www.alsona.com/blog/linkedin-messaging-benchmarks-whats-a-good-reply-rate-in-2025)
- [Carol Hauser via LinkedIn Pulse — Networking in Israel Practical Guide](https://www.linkedin.com/pulse/networking-israel-practical-guide-carol-hauser)
- [match-b2b — Advanced LinkedIn B2B Guide for Israel](https://www.match-b2b.com/the-advanced-linkedin-b2b-guide-a-catalyst-for-growth-in-israel-and-globally)
- [Skylead — LinkedIn Connection Limit Guide](https://skylead.io/blog/linkedin-connection-limit/)
- [LeadLoft — LinkedIn Limits 2026](https://www.leadloft.com/blog/linkedin-limits)
- [Medium TechTogether — How to Highlight Hackathon on LinkedIn](https://medium.com/techtogether/how-to-highlight-your-hackathon-experience-on-your-linkedin-4fae224863e5)
- [LinkedIn Pulse — LinkedIn Grads Guide 2025](https://www.linkedin.com/pulse/linkedin-grads-guide-2025-jobs-industries-cities-rise-new-ggnje)
- [Into the Minds — Emojis on LinkedIn study](https://www.intotheminds.com/blog/en/linkedin-effect-emojis-emoticons/)
- [Maverrik — Should You Use Emojis on LinkedIn 2026](https://maverrik.io/blog/should-i-use-emojis-on-linkedin/)
- [Omnicreator — LinkedIn Saves Algorithm 2026](https://www.omnicreator.club/blog/linkedin-saves-are-your-secret-weapon-how-2026-algorithm-rewards-content-people-actually-save/)
- [Threads / Matt Navarra — LinkedIn says posts with links are not penalized](https://www.threads.com/@mattnavarra/post/DOWa_61Cown/)

---

## How to use this document

When writing or updating an LLM prompt that touches LinkedIn (Profile, Posts, Networking), check this document first. Specifically:

- Match the **cross-validated findings** without hedging — these are durable and well-evidenced
- For **contested / single-sourced claims**, structure the prompt to surface the trade-off rather than asserting a side (e.g. Open To Work, personalized notes, posting time of day)
- When a feature touches a **gap area** (Israeli timezone, Hebrew posting, student-specific engagement rates), prefer caution + pilot-data collection over inferring a recommendation
- When updating prompts based on this research, add a comment in the prompt code referencing this file as the source

If pilot data contradicts a claim in this doc, update the doc with the pilot finding + the contradiction noted, rather than silently revising the prompt.
