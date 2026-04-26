-- CAL2 fix — stale calendar events. Deleting an application from the tracker
-- left its calendar events behind with application_id=NULL via the previous
-- ON DELETE SET NULL rule, indistinguishable in the UI from a standalone
-- event the user created directly. Switch to CASCADE so events tracking an
-- application disappear when that application is deleted.
--
-- Standalone events (e.g. networking meetups, coffee chats) created with
-- application_id IS NULL from the start are unaffected — they were never
-- linked to an application row, so nothing cascades through to them.
ALTER TABLE calendar_events
  DROP CONSTRAINT calendar_events_application_id_fkey,
  ADD CONSTRAINT calendar_events_application_id_fkey
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;
