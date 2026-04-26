-- All five sub-tabs of ApplicationRow (Skills, Projects, Networking,
-- Interview, Follow-Up) read/write JSONB blobs on the applications row via
-- the standard supabase.from("applications").update({...}) pattern. The
-- columns were never created, so every save returned 400 from PostgREST and
-- the frontend reverted to the "empty" initial state — silently making each
-- of those tabs appear non-functional (TR4 Skills tab empty, TR5 Projects
-- add fails, TR6 Networking add fails). The Interview-prep and Follow-Up
-- tabs (newly unlocked by TR9/TR7) had the same latent breakage and are
-- fixed in the same migration so they don't surface as "new" bugs.
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS skills_required jsonb,
  ADD COLUMN IF NOT EXISTS projects_proof jsonb,
  ADD COLUMN IF NOT EXISTS networking_contacts jsonb,
  ADD COLUMN IF NOT EXISTS follow_up jsonb,
  ADD COLUMN IF NOT EXISTS interview_prep jsonb;
