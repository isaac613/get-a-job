-- B4: Backfill NULL due_date on tasks so the Calendar surfaces them.
--
-- Why: prior generate-tasks output never included a due_date field, so
-- every task in the system landed with due_date=NULL. The Tasks page
-- renders fine (it doesn't sort by due_date), but Calendar.jsx silently
-- skips any task where !task.due_date. Result: tasks were invisible to
-- the calendar.
--
-- Backfill spreads orphans across upcoming days by priority so the
-- Calendar shows realistic clustering instead of dumping everything on
-- the same date:
--   high   -> today + 3 days
--   medium -> today + 7 days
--   low    -> today + 14 days
--   other / null priority -> today + 7 days
--
-- Going forward, the generate-tasks edge function emits due_date in its
-- JSON output, the three frontend insert sites resolve+validate it via
-- src/lib/taskDueDate.js, and fall back to the same priority-based
-- defaults when the LLM value is missing/invalid/in-the-past.

UPDATE tasks
SET due_date = NOW() +
  CASE priority
    WHEN 'high' THEN INTERVAL '3 days'
    WHEN 'medium' THEN INTERVAL '7 days'
    WHEN 'low' THEN INTERVAL '14 days'
    ELSE INTERVAL '7 days'
  END
WHERE due_date IS NULL;
