-- Add 'accepted' as a distinct status on the Application Tracker. Previously the
-- only positive terminal state was 'offer', which conflates "received an offer"
-- with "I'm taking it". Users need both.

ALTER TABLE applications DROP CONSTRAINT IF EXISTS chk_applications_status;

ALTER TABLE applications ADD CONSTRAINT chk_applications_status
  CHECK (status = ANY (ARRAY[
    'interested',
    'preparing',
    'applied',
    'interviewing',
    'offer',
    'accepted',
    'rejected'
  ]));
