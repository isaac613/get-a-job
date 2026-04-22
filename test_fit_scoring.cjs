#!/usr/bin/env node
// Test script: simulate proof signal extraction + fit scoring against 8 target roles

const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "functions", "data");
const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf-8"));

// ─── Load libraries ──────────────────────────────────────────────────────
const roleLibrary = load("00_role_library.json");
const skillLibrary = load("01_skill_library.json");
const proofSignalLibrary = load("02_proof_signal_library.json");
const roleSkillMapping = load("04_role_skill_mapping.json");
const fitScoringLogic = load("05_fit_scoring_logic.json");
const tierLogic = load("06_tier_logic.json");

const roles = roleLibrary.roles;
const skills = skillLibrary.skill_library;
const signals = proofSignalLibrary.proof_signal_library;
const mappings = roleSkillMapping.role_skill_mapping;

// Build lookup maps
const skillById = new Map();
for (const s of skills) skillById.set(s.id || s.skill_id, s);

const roleById = new Map();
for (const r of roles) roleById.set(r.id || r.role_id, r);

const mappingByRoleId = new Map();
for (const m of mappings) mappingByRoleId.set(m.role_id, m);

// ─── Profile text (test case: Eli Englard) ───────────────────────────────
const profileText = `
Eli Englard. Reichman University, Business Administration, Digital Innovation.

Customer Success Specialist on the VIP Team at Guardio, a cybersecurity startup, since October 2025.
High-touch technical and product support for VIP customers. Customer onboarding guidance.
Issue resolution. Case prioritization. Retention-focused follow-ups. Customer communication.
Technical support. Product support. VIP customer relationship management.

Program Coordinator and Team Lead at Heseg Tzair, part-time, since August 2025.
Manages a team of 5 volunteers. Scheduling, training, operations coordination.
Designs life-skills curriculum. Tracks attendance and engagement. Program management.
Team leadership. Cross-functional coordination. Stakeholder management.

Volunteer Educator and Mentor at Heseg Tzair, part-time, August 2023 to July 2025.
Weekly educational sessions for immigrants and at-risk youth. One-on-one mentoring.
Curriculum delivery. Training delivery. Mentorship.

Military service: Nahal Brigade, 2020 to 2022. Supervised and trained teams of up to 30 soldiers.
Leadership. Team management. Training. Operations. Presidential Award for Excellence.
Multiple excellence commendations. High-pressure environment. Elite unit.

Skills: User-facing operations, customer experience, customer retention, stakeholder coordination,
program management, project execution, process improvement, leadership, team management.
Google Sheets, Excel, PowerPoint, Notion, Figma, CRM tools.

Education: BA Business Administration with Digital Innovation concentration, Reichman University, 2023 to present.

Languages: English native, Hebrew fluent.
`.toLowerCase();

// ─── Proof signal extraction ─────────────────────────────────────────────
// A signal fires if any of its tags OR any meaningful keyword phrase from its
// description appears in the profile text. Uses word-boundary matching.

const stopwords = new Set([
  "the", "a", "an", "of", "to", "and", "or", "in", "on", "for", "with",
  "at", "by", "from", "as", "is", "are", "was", "were", "be", "been",
  "has", "have", "had", "do", "does", "did", "that", "this", "these",
  "those", "it", "its", "their", "them", "they", "you", "your", "our",
  "his", "her", "she", "he", "who", "whom", "which", "what", "when",
  "where", "why", "how", "not", "no", "yes", "also", "but", "if", "then",
  "so", "than", "such", "can", "could", "may", "might", "will", "would",
  "shall", "should", "must", "role", "person", "often", "level",
  "typically", "usually", "someone", "user", "users", "work", "working"
]);

function tokenize(s) {
  return (s || "").toLowerCase().match(/[a-z][a-z-]{2,}/g) || [];
}

function containsPhrase(text, phrase) {
  if (!phrase || phrase.length < 3) return false;
  const p = phrase.toLowerCase().trim();
  // Escape regex metacharacters
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("\\b" + escaped + "\\b").test(text);
}

function signalFires(signal, text) {
  // 1. Any tag matched as whole phrase
  const tags = signal.tags || [];
  for (const t of tags) {
    if (typeof t === "string" && containsPhrase(text, t.replace(/_/g, " "))) {
      return true;
    }
  }
  // 2. Significant keyword density from description
  const desc = (signal.description || "").toLowerCase();
  const descTokens = tokenize(desc).filter((t) => !stopwords.has(t));
  if (descTokens.length === 0) return false;
  const uniqueDescTokens = [...new Set(descTokens)];
  let hits = 0;
  for (const tok of uniqueDescTokens) {
    if (containsPhrase(text, tok)) hits++;
  }
  // Signal fires if >=40% of unique description tokens appear, or >=3 absolute matches
  return hits >= Math.max(3, Math.ceil(uniqueDescTokens.length * 0.4));
}

const firedSignals = [];
const userSkillIds = new Set();
const signalsBySkillId = new Map(); // skill_id -> [signals]

for (const sig of signals) {
  if (signalFires(sig, profileText)) {
    firedSignals.push(sig);
    const mapped = sig.maps_to_skills || sig.mapped_skills || [];
    for (const sid of mapped) {
      if (typeof sid === "string") {
        userSkillIds.add(sid);
        if (!signalsBySkillId.has(sid)) signalsBySkillId.set(sid, []);
        signalsBySkillId.get(sid).push(sig);
      }
    }
  }
}

// ─── Extract skill IDs from a mapping (handles both schemas) ─────────────
function bucketSkillIds(mapping, bucket) {
  if (!mapping) return [];
  // Flat: core_skills: ["id1", {skill_id: "id2"}]
  const flatKey = `${bucket}_skills`;
  const flat = mapping[flatKey];
  if (Array.isArray(flat) && flat.length > 0) {
    return flat.map((e) => (typeof e === "string" ? e : e?.skill_id)).filter(Boolean);
  }
  // Nested: skills: {core: [...]}
  const nested = mapping.skills;
  if (nested && typeof nested === "object" && Array.isArray(nested[bucket])) {
    return nested[bucket].map((e) => (typeof e === "string" ? e : e?.skill_id)).filter(Boolean);
  }
  return [];
}

// ─── Fit scoring ─────────────────────────────────────────────────────────
const WEIGHTS = { core: 0.6, secondary: 0.3, differentiator: 0.1 };

function assignTier(score) {
  if (score >= 0.70) return "Tier 1";
  if (score >= 0.50) return "Tier 2";
  if (score >= 0.35) return "Tier 3";
  return "No Fit";
}

function scoreRole(roleId) {
  const roleDef = roleById.get(roleId);
  const mapping = mappingByRoleId.get(roleId);
  const buckets = {
    core: bucketSkillIds(mapping, "core"),
    secondary: bucketSkillIds(mapping, "secondary"),
    differentiator: bucketSkillIds(mapping, "differentiator"),
  };

  const result = {
    role_id: roleId,
    role_title: roleDef?.standardized_title || roleDef?.title || "(not in role library)",
    library_match: Boolean(roleDef),
    mapping_found: Boolean(mapping),
    score: 0,
    tier: "No Fit",
    buckets: {},
    total_signals_fired: 0,
  };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const bucket of ["core", "secondary", "differentiator"]) {
    const ids = buckets[bucket];
    const matched = ids.filter((sid) => userSkillIds.has(sid));
    const missing = ids.filter((sid) => !userSkillIds.has(sid));
    const ratio = ids.length > 0 ? matched.length / ids.length : 0;
    if (ids.length > 0) {
      weightedSum += ratio * WEIGHTS[bucket];
      totalWeight += WEIGHTS[bucket];
    }
    result.buckets[bucket] = {
      total: ids.length,
      matched: matched.length,
      matched_ids: matched,
      missing_ids: missing,
      missing_names: missing.map((sid) => skillById.get(sid)?.name || sid),
      ratio,
    };
  }
  result.score = totalWeight > 0 ? weightedSum / totalWeight * (WEIGHTS.core + WEIGHTS.secondary + WEIGHTS.differentiator) : 0;
  // Using the formula as specified: weighted sum without re-normalization when all 3 buckets present
  const r = result.buckets;
  const rawFormula =
    (r.core.total > 0 ? r.core.ratio : 0) * WEIGHTS.core +
    (r.secondary.total > 0 ? r.secondary.ratio : 0) * WEIGHTS.secondary +
    (r.differentiator.total > 0 ? r.differentiator.ratio : 0) * WEIGHTS.differentiator;
  result.score = Number(rawFormula.toFixed(3));
  result.tier = assignTier(result.score);

  // Find signals that contributed to this role's matched skills
  const roleSkillIds = new Set([...buckets.core, ...buckets.secondary, ...buckets.differentiator]);
  const contributingSignals = new Set();
  for (const sid of roleSkillIds) {
    const sigs = signalsBySkillId.get(sid) || [];
    for (const sig of sigs) contributingSignals.add(sig);
  }
  // Rank by strength_level weight
  const strengthWeight = { strong: 3, medium: 2, weak: 1, very_weak: 0.5 };
  result.top_signals = [...contributingSignals]
    .sort((a, b) => (strengthWeight[b.strength_level] || 1) - (strengthWeight[a.strength_level] || 1))
    .slice(0, 5)
    .map((s) => ({ id: s.id, description: s.description, strength: s.strength_level }));
  result.total_signals_fired = contributingSignals.size;
  return result;
}

const TARGETS = [
  "customer_success_manager",
  "customer_success_specialist",
  "account_manager",
  "sales_development_representative",
  "product_manager",
  "business_analyst",
  "project_manager",
  "marketing_coordinator",
];

const results = TARGETS.map(scoreRole);

// ─── Report ──────────────────────────────────────────────────────────────
const line = "─".repeat(80);
console.log(line);
console.log("LIBRARY STATE");
console.log(line);
console.log(`Roles: ${roles.length} | Skills: ${skills.length} | Proof Signals: ${signals.length} | Mappings: ${mappings.length}`);
console.log();

console.log(line);
console.log("PROOF SIGNAL EXTRACTION SUMMARY");
console.log(line);
console.log(`Total signals in library: ${signals.length}`);
console.log(`Signals that fired for this profile: ${firedSignals.length}`);
console.log(`Unique skills inferred from fired signals: ${userSkillIds.size}`);
console.log();
console.log("Top 10 inferred skills (by # of supporting signals):");
const skillCounts = [...signalsBySkillId.entries()]
  .map(([sid, sigs]) => ({ sid, name: skillById.get(sid)?.name || sid, count: sigs.length }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 10);
for (const { sid, name, count } of skillCounts) {
  console.log(`   ${count.toString().padStart(3, " ")}× ${name}  [${sid}]`);
}
console.log();

console.log(line);
console.log("PER-ROLE FIT REPORT");
console.log(line);

for (const r of results) {
  console.log();
  console.log(`▸ ${r.role_title}  (${r.role_id})`);
  if (!r.library_match) {
    console.log(`  ⚠ Not in role library`);
  }
  if (!r.mapping_found) {
    console.log(`  ⚠ No skill mapping found — cannot compute fit`);
    continue;
  }
  console.log(`  Fit score: ${r.score}   →   ${r.tier}`);
  const c = r.buckets.core, s = r.buckets.secondary, d = r.buckets.differentiator;
  console.log(`  Core:          ${c.matched}/${c.total} matched`);
  console.log(`  Secondary:     ${s.matched}/${s.total} matched`);
  console.log(`  Differentiator: ${d.matched}/${d.total} matched`);
  if (c.missing_names.length > 0) {
    console.log(`  Core gaps:`);
    for (const name of c.missing_names) console.log(`    • ${name}`);
  } else if (c.total > 0) {
    console.log(`  Core gaps: none`);
  }
  if (r.top_signals.length > 0) {
    console.log(`  Top proof signals (${r.total_signals_fired} total fired for this role):`);
    for (const sig of r.top_signals) {
      const desc = sig.description.length > 70 ? sig.description.slice(0, 70) + "…" : sig.description;
      console.log(`    [${sig.strength || "?"}] ${desc}`);
    }
  } else {
    console.log(`  No proof signals fired for this role's skills.`);
  }
}

console.log();
console.log(line);
console.log("RANKED RESULTS");
console.log(line);
const ranked = [...results].sort((a, b) => b.score - a.score);
for (let i = 0; i < ranked.length; i++) {
  const r = ranked[i];
  const bar = "█".repeat(Math.round(r.score * 30));
  console.log(
    `${(i + 1).toString().padStart(2, " ")}. ${r.score.toFixed(3)}  ${r.tier.padEnd(8, " ")} ${bar.padEnd(30, " ")}  ${r.role_title}`
  );
}
console.log();
