const fs = require('fs');

// Map of import patterns to convert from branch style to our TS module style
const importMap = {
  'import roleLibrary from "../data/00_role_library.json" assert { type: "json" };': 
    'import { roleLibrary } from "./shared/libraries/00_role_library.ts";',
  'import skillLibrary from "../data/01_skill_library.json" assert { type: "json" };':
    'import { skillLibrary } from "./shared/libraries/01_skill_library.ts";',
  'import proofSignalLibrary from "../data/02_proof_signal_library.json" assert { type: "json" };':
    'import { proofSignalLibrary } from "./shared/libraries/02_proof_signal_library.ts";',
  'import roleSkillMapping from "../data/04_role_skill_mapping.json" assert { type: "json" };':
    'import { roleSkillMapping } from "./shared/libraries/04_role_skill_mapping.ts";',
  'import fitScoringLogic from "../data/05_fit_scoring_logic.json" assert { type: "json" };':
    'import { fitScoringLogic } from "./shared/libraries/05_fit_scoring_logic.ts";',
  'import tierLogic from "../data/06_tier_logic.json" assert { type: "json" };':
    'import { tierLogic } from "./shared/libraries/06_tier_logic.ts";',
  'import goalAlignmentLogic from "../data/09_goal_alignment_logic.json" assert { type: "json" };':
    'import { goalAlignmentLogic } from "./shared/libraries/09_goal_alignment_logic.ts";',
  'import agentDecisionLogic from "../data/010_agent_decision_logic.json" assert { type: "json" };':
    'import { agentDecisionLogic } from "./shared/libraries/010_agent_decision_logic.ts";',
  'import taskGenerationLogic from "../data/011_task_generation_logic.json" assert { type: "json" };':
    'import { taskGenerationLogic } from "./shared/libraries/011_task_generation_logic.ts";',
  'import courseRecommendationLogic from "../data/012_course_recommendation_logic.json" assert { type: "json" };':
    'import { courseRecommendationLogic } from "./shared/libraries/012_course_recommendation_logic.ts";',
  'import jobSearchStageLogic from "../data/013_job_search_stage_logic.json" assert { type: "json" };':
    'import { jobSearchStageLogic } from "./shared/libraries/013_job_search_stage_logic.ts";',
};

const files = [
  'functions/generate-career-analysis.branch.ts',
  'functions/generate-tasks.branch.ts',
  'functions/generateTailoredCV.branch.ts',
  'functions/generateApplicationTasks.branch.ts',
];

const targets = [
  'functions/generate-career-analysis.ts',
  'functions/generate-tasks.ts',
  'functions/generateTailoredCV.ts',
  'functions/generateApplicationTasks.ts',
];

files.forEach((file, i) => {
  let content = fs.readFileSync(file, 'utf16le');  // git show outputs UTF-16 on Windows
  // Try UTF-8 if it looks garbled
  if (content.charCodeAt(0) === 0xFEFF || content.includes('\x00')) {
    // UTF-16, already read correctly
  } else {
    content = fs.readFileSync(file, 'utf8');
  }
  
  for (const [from, to] of Object.entries(importMap)) {
    content = content.replace(from, to);
  }
  
  fs.writeFileSync(targets[i], content, 'utf8');
  console.log(`${file} -> ${targets[i]} OK`);
});
