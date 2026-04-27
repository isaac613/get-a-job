// Shared due_date resolution for the three task-insert sites
// (Tasks.jsx, Onboarding.jsx, ChatInterface.jsx). The generate-tasks
// edge function emits due_date as part of each task, but the LLM is
// not perfectly reliable about format, recency, or even presence —
// so callers route the LLM value through resolveDueDate() which
// validates and falls back to a deterministic priority-based default.

const PRIORITY_DAYS = { high: 3, medium: 7, low: 14 };

export function defaultDueDateFor(priority) {
  const days = PRIORITY_DAYS[priority] || 7;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function validateDueDate(s) {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const now = Date.now();
  if (d.getTime() < now - 86400000) return null;          // not >1 day in the past
  if (d.getTime() > now + 180 * 86400000) return null;    // not >180 days in the future
  return d.toISOString();
}

export function resolveDueDate(llmValue, priority) {
  return validateDueDate(llmValue) || defaultDueDateFor(priority);
}
