#!/usr/bin/env node
// Comprehensive library validation suite — 6 tests + consolidated report

const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "functions", "data");
const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf-8"));

const roleLibrary = load("00_role_library.json");
const skillLibrary = load("01_skill_library.json");
const proofSignalLibrary = load("02_proof_signal_library.json");
const roleSkillMapping = load("04_role_skill_mapping.json");
const fitScoringLogic = load("05_fit_scoring_logic.json");
const tierLogic = load("06_tier_logic.json");
const transferMap = load("15_skill_transfer_map.json");

const roles = roleLibrary.roles;
const skills = skillLibrary.skill_library;
const signals = proofSignalLibrary.proof_signal_library;
const mappings = roleSkillMapping.role_skill_mapping;
const transfers = transferMap.transfers;

const skillById = new Map();
for (const s of skills) skillById.set(s.id || s.skill_id, s);
const roleById = new Map();
for (const r of roles) roleById.set(r.id || r.role_id, r);
const mappingByRoleId = new Map();
for (const m of mappings) mappingByRoleId.set(m.role_id, m);

// ─── Shared helpers ──────────────────────────────────────────────────────
function bucketSkillIds(mapping, bucket) {
  if (!mapping) return [];
  const flat = mapping[`${bucket}_skills`];
  if (Array.isArray(flat) && flat.length > 0) {
    return flat.map((e) => (typeof e === "string" ? e : e?.skill_id)).filter(Boolean);
  }
  const nested = mapping.skills;
  if (nested && typeof nested === "object" && Array.isArray(nested[bucket])) {
    return nested[bucket].map((e) => (typeof e === "string" ? e : e?.skill_id)).filter(Boolean);
  }
  return [];
}

const stopwords = new Set([
  "the","a","an","of","to","and","or","in","on","for","with","at","by","from",
  "as","is","are","was","were","be","been","has","have","had","do","does","did",
  "that","this","these","those","it","its","their","them","they","you","your",
  "our","his","her","she","he","who","whom","which","what","when","where","why",
  "how","not","no","yes","also","but","if","then","so","than","such","can","could",
  "may","might","will","would","shall","should","must","role","person","often",
  "level","typically","usually","someone","user","users","work","working"
]);

function tokenize(s) {
  return (s || "").toLowerCase().match(/[a-z][a-z-]{2,}/g) || [];
}
function containsPhrase(text, phrase) {
  if (!phrase || phrase.length < 3) return false;
  const esc = phrase.toLowerCase().trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("\\b" + esc + "\\b").test(text);
}
function signalFires(signal, text) {
  for (const t of signal.tags || []) {
    if (typeof t === "string" && containsPhrase(text, t.replace(/_/g, " "))) return true;
  }
  const desc = (signal.description || "").toLowerCase();
  const descTokens = [...new Set(tokenize(desc).filter((t) => !stopwords.has(t)))];
  if (descTokens.length === 0) return false;
  let hits = 0;
  for (const tok of descTokens) if (containsPhrase(text, tok)) hits++;
  return hits >= Math.max(3, Math.ceil(descTokens.length * 0.4));
}
function extractUserSkills(profileText) {
  const text = profileText.toLowerCase();
  const userSkillIds = new Set();
  const fired = [];
  for (const sig of signals) {
    if (signalFires(sig, text)) {
      fired.push(sig);
      for (const sid of sig.maps_to_skills || []) {
        if (typeof sid === "string") userSkillIds.add(sid);
      }
    }
  }
  return { userSkillIds, firedCount: fired.length };
}

const WEIGHTS = { core: 0.6, secondary: 0.3, differentiator: 0.1 };
function assignTier(score) {
  if (score >= 0.70) return "Tier 1";
  if (score >= 0.50) return "Tier 2";
  if (score >= 0.35) return "Tier 3";
  return "No Fit";
}
function scoreRole(roleId, userSkillIds) {
  const mapping = mappingByRoleId.get(roleId);
  const roleDef = roleById.get(roleId);
  const buckets = {
    core: bucketSkillIds(mapping, "core"),
    secondary: bucketSkillIds(mapping, "secondary"),
    differentiator: bucketSkillIds(mapping, "differentiator"),
  };
  const out = {
    role_id: roleId,
    title: roleDef?.standardized_title || roleDef?.title || "(unknown)",
    library_match: Boolean(roleDef),
    mapping_found: Boolean(mapping),
    seniority: roleDef?.seniority || "",
    role_family: roleDef?.role_family || "",
  };
  const r = {};
  for (const b of ["core", "secondary", "differentiator"]) {
    const ids = buckets[b];
    const matched = ids.filter((id) => userSkillIds.has(id));
    r[b] = { total: ids.length, matched: matched.length, ratio: ids.length > 0 ? matched.length / ids.length : 0, missing: ids.filter((id) => !userSkillIds.has(id)) };
  }
  const raw =
    (r.core.total > 0 ? r.core.ratio : 0) * WEIGHTS.core +
    (r.secondary.total > 0 ? r.secondary.ratio : 0) * WEIGHTS.secondary +
    (r.differentiator.total > 0 ? r.differentiator.ratio : 0) * WEIGHTS.differentiator;
  out.score = Number(raw.toFixed(3));
  out.tier = assignTier(out.score);
  out.buckets = r;
  return out;
}

const LINE = "─".repeat(80);
const DLINE = "═".repeat(80);

// ─── TEST 1: Missing Role Coverage ───────────────────────────────────────
console.log(DLINE);
console.log("TEST 1: MISSING ROLE COVERAGE");
console.log(DLINE);

const rolesToCheck = [
  "customer_success_specialist","junior_business_analyst","marketing_assistant",
  "marketing_intern","hr_coordinator","hr_assistant","sales_associate",
  "sales_representative","account_executive","operations_associate",
  "operations_analyst","financial_analyst","data_analyst","product_analyst",
  "ux_researcher","content_marketing_manager","social_media_manager",
  "social_media_coordinator","recruitment_coordinator","talent_acquisition_specialist",
  "business_operations_associate","strategy_analyst","management_consultant",
  "junior_consultant","executive_assistant","office_manager","event_coordinator",
  "event_manager","partnerships_associate","customer_support_representative",
  "technical_support_specialist","implementation_specialist","solutions_consultant",
  "pre_sales_engineer","growth_analyst","revenue_analyst","demand_generation_manager",
  "product_marketing_manager","brand_manager",
];

const found1 = [], missing1 = [];
for (const rid of rolesToCheck) {
  if (roleById.has(rid)) found1.push(rid);
  else missing1.push(rid);
}

const SENIOR_LEVELS = ["Director_Head", "VP_Executive"];
const seniorRoles = roles
  .filter((r) => SENIOR_LEVELS.includes(r.seniority))
  .map((r) => ({ id: r.id || r.role_id, title: r.standardized_title || r.title, seniority: r.seniority }));

console.log(`\nFound (${found1.length}/${rolesToCheck.length}):`);
found1.forEach((r) => console.log(`  ✓ ${r}`));
console.log(`\nMissing (${missing1.length}/${rolesToCheck.length}):`);
missing1.forEach((r) => console.log(`  ✗ ${r}`));
console.log(`\nSenior roles (Director+): ${seniorRoles.length}`);
seniorRoles.forEach((r) => console.log(`  ${r.seniority.padEnd(14, " ")} ${r.id}  (${r.title})`));

// ─── TEST 2: Orphaned Mapping Skill Refs ─────────────────────────────────
console.log("\n" + DLINE);
console.log("TEST 2: ORPHANED SKILL REFERENCES (role mappings → skill library)");
console.log(DLINE);

const refsByMappingSkill = new Map(); // skill_id → [role_id]
for (const m of mappings) {
  const ids = [
    ...bucketSkillIds(m, "core"),
    ...bucketSkillIds(m, "secondary"),
    ...bucketSkillIds(m, "differentiator"),
  ];
  for (const sid of new Set(ids)) {
    if (!refsByMappingSkill.has(sid)) refsByMappingSkill.set(sid, []);
    refsByMappingSkill.get(sid).push(m.role_id);
  }
}
const totalRefdInMappings = refsByMappingSkill.size;
const inLibrary2 = [...refsByMappingSkill.keys()].filter((id) => skillById.has(id)).length;
const missing2 = [...refsByMappingSkill.entries()].filter(([id]) => !skillById.has(id));

console.log(`\nTotal unique skill IDs referenced in mappings: ${totalRefdInMappings}`);
console.log(`Found in skill library: ${inLibrary2}`);
console.log(`MISSING from skill library: ${missing2.length}`);
for (const [sid, roles] of missing2) {
  const sample = roles.slice(0, 4).join(", ") + (roles.length > 4 ? ` +${roles.length - 4} more` : "");
  console.log(`  ✗ ${sid}  ← used by ${roles.length} role(s): ${sample}`);
}

// ─── TEST 3: Orphaned Proof Signal Refs + Undetectable Skills ───────────
console.log("\n" + DLINE);
console.log("TEST 3: ORPHANED PROOF SIGNAL REFERENCES + UNDETECTABLE SKILLS");
console.log(DLINE);

const refsBySignalSkill = new Map();
for (const sig of signals) {
  for (const sid of sig.maps_to_skills || []) {
    if (!refsBySignalSkill.has(sid)) refsBySignalSkill.set(sid, []);
    refsBySignalSkill.get(sid).push(sig.id);
  }
}
const signalRefTotal = refsBySignalSkill.size;
const signalRefFound = [...refsBySignalSkill.keys()].filter((id) => skillById.has(id)).length;
const signalRefMissing = [...refsBySignalSkill.entries()].filter(([id]) => !skillById.has(id));

console.log(`\nTotal unique skill IDs in proof signals: ${signalRefTotal}`);
console.log(`Found in skill library: ${signalRefFound}`);
console.log(`MISSING from skill library: ${signalRefMissing.length}`);
for (const [sid, sigs] of signalRefMissing) {
  const sample = sigs.slice(0, 3).join(", ") + (sigs.length > 3 ? ` +${sigs.length - 3} more` : "");
  console.log(`  ✗ ${sid}  ← referenced by ${sigs.length} signal(s): ${sample}`);
}

const allSkillIds = new Set([...skillById.keys()]);
const signalCoveredSkillIds = new Set([...refsBySignalSkill.keys()]);
const undetectable = [...allSkillIds].filter((id) => !signalCoveredSkillIds.has(id));
console.log(`\nUNDETECTABLE SKILLS (in skill library but no proof signal maps to them): ${undetectable.length}`);
// Sort by name
undetectable
  .map((id) => ({ id, name: skillById.get(id)?.name || id }))
  .sort((a, b) => a.name.localeCompare(b.name))
  .forEach((e) => console.log(`  • ${e.id.padEnd(40, " ")} ${e.name}`));

// ─── TEST 4: Multi-Profile Fit Scoring ───────────────────────────────────
console.log("\n" + DLINE);
console.log("TEST 4: MULTI-PROFILE FIT SCORING");
console.log(DLINE);

const MOCK_PROFILES = {
  "A (Marketing)": `
    Marketing student at Reichman. Skills and experience: social media management,
    content creation, campaign management, Google Analytics, SEO, copywriting,
    brand strategy, Instagram, TikTok, email marketing, A/B testing, Canva,
    Adobe Creative Suite, marketing internship at a startup, blog writing,
    event promotion, marketing campaigns, digital marketing, marketing strategy,
    university marketing club president, content strategy, brand management,
    social media strategy, marketing analytics, campaign optimization.
  `,
  "B (Finance)": `
    Finance and analytics student at Reichman. Skills: financial modeling,
    Excel advanced, SQL, Python basics, data analysis, financial reporting,
    budgeting, forecasting, PowerBI, Tableau, accounting internship at Big 4 firm,
    investment club treasurer, Bloomberg terminal, valuation, DCF analysis,
    pivot tables, VBA macros, financial analysis, accounting, audit, reporting,
    financial statements, quantitative analysis, statistical analysis, analytics,
    dashboarding, data visualization, business intelligence.
  `,
  "C (Sales/Hustle)": `
    Sales student at Reichman. Skills and experience: cold calling,
    outbound prospecting, lead generation, CRM Salesforce HubSpot,
    pipeline management, quota attainment, B2B sales, door-to-door sales,
    negotiation, closing deals, customer acquisition, phone sales,
    fundraising for student org, competitive sports background, persuasion,
    objection handling, sales development, prospecting, outbound sales,
    sales pitch, business development, revenue generation, discovery calls,
    sales outreach, sales cadence.
  `,
  "D (Tech/Product)": `
    Tech and product student at Reichman. Experience: product management internship,
    user research, wireframing, Figma, Jira, agile methodology, sprint planning,
    PRD writing, A/B testing, data-driven decisions, SQL, Python, API basics,
    hackathon winner, built a mobile app, user interviews, competitive analysis,
    roadmap planning, stakeholder communication, product discovery, product roadmap,
    product strategy, user stories, cross-functional collaboration, product requirements,
    prototyping, user experience, product analytics.
  `,
};

const TEST4_ROLES = [
  "customer_success_manager","project_manager","product_manager","business_analyst",
  "account_manager","sales_development_representative","marketing_coordinator","data_analyst",
];

const EXPECTED_TOP = {
  "A (Marketing)": "marketing_coordinator",
  "B (Finance)": ["business_analyst", "data_analyst"],
  "C (Sales/Hustle)": ["sales_development_representative", "account_manager"],
  "D (Tech/Product)": "product_manager",
};

const profileTopRoles = {};
let expectedMatches = 0;
for (const [label, text] of Object.entries(MOCK_PROFILES)) {
  const { userSkillIds, firedCount } = extractUserSkills(text);
  console.log(`\nProfile ${label}: ${firedCount} signals fired, ${userSkillIds.size} skills inferred`);
  const rows = TEST4_ROLES.map((rid) => scoreRole(rid, userSkillIds)).sort((a, b) => b.score - a.score);
  for (const r of rows) {
    const c = r.buckets.core, s = r.buckets.secondary, d = r.buckets.differentiator;
    console.log(`  ${r.score.toFixed(3)}  ${r.tier.padEnd(8, " ")}  ${r.role_id.padEnd(38, " ")}  core ${c.matched}/${c.total}  sec ${s.matched}/${s.total}  diff ${d.matched}/${d.total}`);
  }
  const top = rows[0];
  profileTopRoles[label] = top.role_id;
  console.log(`  → Best fit: ${top.role_id} (${top.score.toFixed(3)})`);

  const expected = EXPECTED_TOP[label];
  const matches = Array.isArray(expected) ? expected.includes(top.role_id) : expected === top.role_id;
  if (matches) expectedMatches++;
}

console.log(`\nCROSS-PROFILE SANITY CHECK:`);
for (const [label, top] of Object.entries(profileTopRoles)) {
  const expected = EXPECTED_TOP[label];
  const expectedStr = Array.isArray(expected) ? expected.join(" or ") : expected;
  const matches = Array.isArray(expected) ? expected.includes(top) : expected === top;
  const flag = matches ? "✓" : "✗ UNEXPECTED";
  console.log(`  ${label.padEnd(18, " ")} top=${top.padEnd(38, " ")} expected=${expectedStr.padEnd(30, " ")} ${flag}`);
}

// ─── TEST 5: Tier Distribution for Eli's Profile ─────────────────────────
console.log("\n" + DLINE);
console.log("TEST 5: TIER DISTRIBUTION (Eli's profile vs all 142 roles)");
console.log(DLINE);

const ELI_PROFILE = `
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
`;

const { userSkillIds: eliSkills, firedCount: eliSignals } = extractUserSkills(ELI_PROFILE);
const eliRows = roles.map((r) => scoreRole(r.id || r.role_id, eliSkills));
const t1 = eliRows.filter((r) => r.tier === "Tier 1").sort((a, b) => b.score - a.score);
const t2 = eliRows.filter((r) => r.tier === "Tier 2").sort((a, b) => b.score - a.score);
const t3 = eliRows.filter((r) => r.tier === "Tier 3").sort((a, b) => b.score - a.score);
const tn = eliRows.filter((r) => r.tier === "No Fit").sort((a, b) => b.score - a.score);

console.log(`\nProof signals fired: ${eliSignals} | Inferred skills: ${eliSkills.size}`);
console.log(`\nTier 1 (≥0.70): ${t1.length} roles`);
t1.forEach((r) => console.log(`  ${r.score.toFixed(3)}  ${r.role_id.padEnd(44, " ")} ${r.seniority.padEnd(14, " ")} ${r.role_family}`));

console.log(`\nTier 2 (0.50-0.69): ${t2.length} roles`);
t2.forEach((r) => console.log(`  ${r.score.toFixed(3)}  ${r.role_id.padEnd(44, " ")} ${r.seniority.padEnd(14, " ")} ${r.role_family}`));

console.log(`\nTier 3 (0.35-0.49): ${t3.length} roles`);
t3.forEach((r) => console.log(`  ${r.score.toFixed(3)}  ${r.role_id.padEnd(44, " ")} ${r.seniority.padEnd(14, " ")} ${r.role_family}`));

console.log(`\nNo Fit (<0.35): ${tn.length} roles`);

const total = eliRows.length;
const pct = (n) => ((n / total) * 100).toFixed(1);
console.log(`\nDistribution: Tier1: ${pct(t1.length)}% | Tier2: ${pct(t2.length)}% | Tier3: ${pct(t3.length)}% | No Fit: ${pct(tn.length)}%`);

console.log("\nSANITY FLAGS:");
const sanityFlags5 = [];
if (t1.length > 15) sanityFlags5.push(`Tier 1 has ${t1.length} roles — scoring may be too loose`);
if (t1.length + t2.length < 5) sanityFlags5.push(`Tier 1+2 only ${t1.length + t2.length} roles — scoring may be too strict`);
const seniorInT1 = t1.filter((r) => SENIOR_LEVELS.includes(r.seniority));
if (seniorInT1.length > 0) {
  sanityFlags5.push(`${seniorInT1.length} senior role(s) in Tier 1 — seniority filter may be needed: ${seniorInT1.map((r) => r.role_id).join(", ")}`);
}
// Suspicious: technical engineering roles in Tier 1 for a business student
const engineeringFamilies = ["Engineering", "AI_ML", "Design_UX"];
const unexpectedInT1 = t1.filter((r) => engineeringFamilies.includes(r.role_family));
if (unexpectedInT1.length > 0) {
  sanityFlags5.push(`Non-business roles in Tier 1: ${unexpectedInT1.map((r) => `${r.role_id} (${r.role_family})`).join(", ")}`);
}
if (sanityFlags5.length === 0) console.log("  (none)");
else sanityFlags5.forEach((f) => console.log(`  ⚠ ${f}`));

// ─── TEST 6: Transfer Map Validation ─────────────────────────────────────
console.log("\n" + DLINE);
console.log("TEST 6: TRANSFER MAP VALIDATION");
console.log(DLINE);

const TRANSFER_TESTS = [
  ["customer_success_manager", "product_manager", "stretch or natural"],
  ["sales_development_representative", "account_manager", "natural"],
  ["business_analyst", "business_ops_manager", "natural or stretch"],
  ["marketing_coordinator", "growth_marketing_manager", "natural"],
  ["management_consultant", "strategy_ops_manager", "natural"],
  ["project_manager", "program_manager", "natural"],
  ["data_analyst", "product_analyst", "natural or stretch"],
  ["customer_success_manager", "account_manager", "natural"],
  ["sales_development_representative", "customer_success_manager", "common pivot"],
  ["hr_coordinator", "talent_acquisition_specialist", "natural"],
];

const transferIndex = new Map();
for (const t of transfers) {
  const key = `${t.s}→${t.t}`;
  transferIndex.set(key, t);
}

const validatedPaths = [];
let missingTransfers = 0;
let misclassified = 0;
console.log();

for (let i = 0; i < TRANSFER_TESTS.length; i++) {
  const [s, t, expected] = TRANSFER_TESTS[i];
  const rec = transferIndex.get(`${s}→${t}`);
  if (!rec) {
    missingTransfers++;
    console.log(`${i + 1}. ${s} → ${t}: MISSING TRANSFER  (expected ${expected})`);
    continue;
  }
  const ok = expected.includes(rec.type) || rec.type === "natural" || rec.type === "stretch";
  const warn = !ok ? `POSSIBLE MIS-CLASSIFICATION (expected ${expected}, got ${rec.type})` : "OK";
  if (!ok) misclassified++;
  validatedPaths.push({ s, t, score: rec.score, type: rec.type });
  console.log(`${i + 1}. ${s} → ${t}: score=${rec.score}, type=${rec.type}  [${warn}]`);
}

// Dead-end analysis
const outboundCount = new Map();
for (const r of roles) outboundCount.set(r.id || r.role_id, 0);
for (const t of transfers) {
  if (outboundCount.has(t.s)) outboundCount.set(t.s, outboundCount.get(t.s) + 1);
}
const deadEnds = [...outboundCount.entries()].filter(([_, n]) => n === 0).map(([id]) => id);
const lowOutbound = [...outboundCount.entries()].filter(([_, n]) => n > 0 && n < 3).map(([id, n]) => `${id} (${n})`);

console.log(`\nDead-end roles (zero outbound transfers): ${deadEnds.length}`);
deadEnds.forEach((id) => console.log(`  ✗ ${id}`));
console.log(`\nRoles with <3 outbound transfers: ${lowOutbound.length}`);
lowOutbound.slice(0, 30).forEach((s) => console.log(`  • ${s}`));
if (lowOutbound.length > 30) console.log(`  ... and ${lowOutbound.length - 30} more`);

// ─── CONSOLIDATED SUMMARY ────────────────────────────────────────────────
console.log("\n" + DLINE);
console.log("LIBRARY VALIDATION SUMMARY");
console.log(DLINE);

console.log(`\nTEST 1 — Missing Roles: ${missing1.length} missing out of ${rolesToCheck.length} checked`);
console.log(`TEST 2 — Orphaned Mapping Skills: ${missing2.length} broken references`);
console.log(`TEST 3 — Orphaned Signal Skills: ${signalRefMissing.length} broken references, ${undetectable.length} undetectable skills`);
console.log(`TEST 4 — Profile Scoring: ${expectedMatches}/4 profiles matched expected top role`);
console.log(`TEST 5 — Tier Distribution: ${t1.length} Tier1 / ${t2.length} Tier2 / ${t3.length} Tier3 / ${tn.length} NoFit`);
console.log(`TEST 6 — Transfer Map: ${validatedPaths.length}/${TRANSFER_TESTS.length} paths validated, ${missingTransfers} missing, ${misclassified} mis-classified`);

const critical = [];
const important = [];
const minor = [];

if (missing2.length > 0) critical.push(`${missing2.length} orphaned skill IDs in role mappings — scoring broken for these roles`);
if (signalRefMissing.length > 0) critical.push(`${signalRefMissing.length} orphaned skill IDs in proof signals — these mappings won't work`);

if (missing1.length > 10) important.push(`${missing1.length} common role titles missing from library`);
if (expectedMatches < 4) important.push(`${4 - expectedMatches}/4 profiles did not match expected top role — scoring calibration needed`);
if (sanityFlags5.length > 0) sanityFlags5.forEach((f) => important.push(f));
if (missingTransfers > 0) important.push(`${missingTransfers}/10 expected career transfers missing from transfer map`);
if (misclassified > 0) important.push(`${misclassified}/10 expected transfers possibly mis-classified`);

if (undetectable.length > 0) minor.push(`${undetectable.length} skills have no proof signal — undetectable from CVs`);
if (deadEnds.length > 0) minor.push(`${deadEnds.length} roles have zero outbound transfers (dead ends)`);

const total_issues = critical.length + important.length + minor.length;
console.log(`\nTOTAL ISSUES FOUND: ${total_issues}`);
console.log(`\nCRITICAL (breaks scoring):`);
critical.forEach((m) => console.log(`  ✗ ${m}`));
if (critical.length === 0) console.log("  (none)");
console.log(`\nIMPORTANT (affects quality):`);
important.forEach((m) => console.log(`  ⚠ ${m}`));
if (important.length === 0) console.log("  (none)");
console.log(`\nMINOR (nice to fix):`);
minor.forEach((m) => console.log(`  • ${m}`));
if (minor.length === 0) console.log("  (none)");
console.log();
