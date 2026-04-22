// merge-libraries.js — merges source-additions into main library files
// Updates both functions/data/*.json and functions/shared/libraries/*.ts

const fs = require('fs');
const path = require('path');

const DATA_DIR = './functions/data';
const SOURCE_DIR = './functions/source-additions';
const LIBRARIES_DIR = './functions/shared/libraries';

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function normalizeSeniority(level) {
  const map = {
    'entry': 'Entry', 'junior': 'Entry', 'entry_level': 'Entry',
    'mid': 'Mid', 'mid_level': 'Mid', 'intermediate': 'Mid',
    'senior': 'Senior', 'senior_level': 'Senior',
    'lead': 'Lead_Manager', 'manager': 'Lead_Manager', 'lead_manager': 'Lead_Manager',
    'director': 'Director_Head', 'head': 'Director_Head', 'director_head': 'Director_Head',
    'vp': 'VP_Executive', 'executive': 'VP_Executive', 'c_level': 'VP_Executive', 'vp_executive': 'VP_Executive'
  };
  const key = level?.toLowerCase()?.replace(/[- ]/g, '_');
  return map[key] || (level ? capitalize(level) : 'Mid');
}

function readTs(filePath, exportName) {
  const ts = fs.readFileSync(filePath, 'utf8');
  const json = ts.replace(new RegExp(`^export const ${exportName} = `), '').replace(/;\s*$/, '');
  return JSON.parse(json);
}

function writeTs(filePath, exportName, data) {
  const content = `export const ${exportName} = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(filePath, content);
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ─── 1. ROLE LIBRARY ────────────────────────────────────────────────────────

function flattenCareerPaths(careerPaths) {
  if (!careerPaths) return [];
  if (Array.isArray(careerPaths)) return careerPaths;
  // object with sub-keys like { next_roles, lateral_moves, long_term }
  return Object.values(careerPaths).flat().filter(v => typeof v === 'string');
}

function normalizeSourceRole(role) {
  const sectorToFamily = {
    engineering: 'Engineering', finance: 'Finance', hr: 'HR',
    sales: 'Sales', marketing: 'Marketing', product: 'Product',
    data: 'Data', design_ux: 'Design_UX', ai_ml: 'AI_ML',
    bd_partnerships: 'BD_Partnerships', consulting: 'Consulting',
    it_security: 'IT_Security', revops_bizops: 'RevOps_BizOps',
    solutions_engineering: 'Solutions_Engineering',
    growth_performance_marketing: 'Growth_Marketing',
    admin_ga: 'Admin_GA', pm: 'Product'
  };
  const family = sectorToFamily[role.sector?.toLowerCase()] || role.sector || 'Other';
  return {
    id: role.role_id,
    standardized_title: role.title,
    alternate_titles: [],
    role_family: family,
    seniority: normalizeSeniority(role.seniority_level),
    core_purpose: role.description || '',
    core_responsibilities: role.key_responsibilities || [],
    required_skills: role.required_skills || [],
    preferred_skills: [],
    tools: role.tools_technologies || [],
    technical_depth: 'medium',
    customer_facing_level: 'medium',
    revenue_ownership: false,
    strategic_level: 'medium',
    lifecycle_stage: 'full',
    typical_backgrounds: [],
    next_roles: flattenCareerPaths(role.career_paths),
    similar_roles: [],
    not_to_confuse_with: [],
    keywords: role.required_skills || []
  };
}

const roleLib = JSON.parse(fs.readFileSync(path.join(DATA_DIR, '00_role_library.json'), 'utf8'));
const existingRoleIds = new Set(roleLib.roles.map(r => r.id));
let addedRoles = 0;

const roleSourceFiles = fs.readdirSync(SOURCE_DIR).filter(f => f.startsWith('00_role_library_'));
for (const file of roleSourceFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, file), 'utf8'));
  for (const role of (data.roles || [])) {
    if (!existingRoleIds.has(role.role_id)) {
      roleLib.roles.push(normalizeSourceRole(role));
      existingRoleIds.add(role.role_id);
      addedRoles++;
    }
  }
}
console.log(`00_role_library: +${addedRoles} new roles → total ${roleLib.roles.length}`);
writeJson(path.join(DATA_DIR, '00_role_library.json'), roleLib);
writeTs(path.join(LIBRARIES_DIR, '00_role_library.ts'), 'roleLibrary', roleLib);

// ─── 2. SKILL LIBRARY ───────────────────────────────────────────────────────

function normalizeSourceSkill(skill) {
  return {
    id: skill.skill_id,
    name: skill.name,
    category: skill.category || 'general',
    tags: [],
    common_roles: [],
    related_skills: []
  };
}

// TS is authoritative (JSON is empty), so read from TS
const skillLibTs = readTs(path.join(LIBRARIES_DIR, '01_skill_library.ts'), 'skillLibrary');
const existingSkillIds = new Set(skillLibTs.skill_library.map(s => s.id));
let addedSkills = 0;

const skillSourceFiles = fs.readdirSync(SOURCE_DIR).filter(f => f.startsWith('01_skill_library_'));
for (const file of skillSourceFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, file), 'utf8'));
  for (const skill of (data.skills || [])) {
    if (!existingSkillIds.has(skill.skill_id)) {
      skillLibTs.skill_library.push(normalizeSourceSkill(skill));
      existingSkillIds.add(skill.skill_id);
      addedSkills++;
    }
  }
}
console.log(`01_skill_library: +${addedSkills} new skills → total ${skillLibTs.skill_library.length}`);
writeJson(path.join(DATA_DIR, '01_skill_library.json'), skillLibTs);
writeTs(path.join(LIBRARIES_DIR, '01_skill_library.ts'), 'skillLibrary', skillLibTs);

// ─── 3. PROOF SIGNAL LIBRARY ────────────────────────────────────────────────

function normalizeSourceSignal(signal) {
  return {
    id: signal.signal_id,
    description: signal.signal_text,
    tags: signal.signal_type ? [signal.signal_type] : [],
    maps_to_skills: signal.maps_to_skills || [],
    strength_level: signal.strength || 'medium'
  };
}

// TS is authoritative (same data as JSON but TS is what's imported)
const signalLibTs = readTs(path.join(LIBRARIES_DIR, '02_proof_signal_library.ts'), 'proofSignalLibrary');
const existingSignalIds = new Set(signalLibTs.proof_signal_library.map(s => s.id));
let addedSignals = 0;

const signalSourceFiles = fs.readdirSync(SOURCE_DIR).filter(f => f.startsWith('02_proof_signal_library_'));
for (const file of signalSourceFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, file), 'utf8'));
  for (const signal of (data.proof_signals || [])) {
    if (!existingSignalIds.has(signal.signal_id)) {
      signalLibTs.proof_signal_library.push(normalizeSourceSignal(signal));
      existingSignalIds.add(signal.signal_id);
      addedSignals++;
    }
  }
}
console.log(`02_proof_signal_library: +${addedSignals} new signals → total ${signalLibTs.proof_signal_library.length}`);
writeJson(path.join(DATA_DIR, '02_proof_signal_library.json'), signalLibTs);
writeTs(path.join(LIBRARIES_DIR, '02_proof_signal_library.ts'), 'proofSignalLibrary', signalLibTs);

// ─── 4. ROLE-SKILL MAPPING ──────────────────────────────────────────────────

function normalizeSourceMapping(mapping) {
  return {
    role_id: mapping.role_id,
    research_status: 'mapped_v1_confident',
    core_skills: mapping.skills?.core || [],
    secondary_skills: mapping.skills?.secondary || [],
    differentiator_skills: mapping.skills?.differentiator || []
  };
}

const mappingLib = JSON.parse(fs.readFileSync(path.join(DATA_DIR, '04_role_skill_mapping.json'), 'utf8'));
const existingMappingIds = new Set(mappingLib.role_skill_mapping.map(m => m.role_id));
let addedMappings = 0;

const mappingSourceFiles = fs.readdirSync(SOURCE_DIR).filter(f => f.startsWith('04_role_skill_mapping_'));
for (const file of mappingSourceFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, file), 'utf8'));
  for (const mapping of (data.role_skill_mappings || [])) {
    if (!existingMappingIds.has(mapping.role_id)) {
      mappingLib.role_skill_mapping.push(normalizeSourceMapping(mapping));
      existingMappingIds.add(mapping.role_id);
      addedMappings++;
    }
  }
}
console.log(`04_role_skill_mapping: +${addedMappings} new mappings → total ${mappingLib.role_skill_mapping.length}`);
writeJson(path.join(DATA_DIR, '04_role_skill_mapping.json'), mappingLib);
writeTs(path.join(LIBRARIES_DIR, '04_role_skill_mapping.ts'), 'roleSkillMapping', mappingLib);

console.log('\nDone! All libraries merged.');
