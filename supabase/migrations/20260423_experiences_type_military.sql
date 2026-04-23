-- Widen chk_experiences_type to include 'military'.
-- The previous constraint (internship|full_time|part_time|freelance|volunteer|leadership)
-- forced Israeli candidates to miscategorise IDF service, which is nearly universal
-- for their cohort. Military service is first-class for this product.

ALTER TABLE experiences DROP CONSTRAINT IF EXISTS chk_experiences_type;

ALTER TABLE experiences ADD CONSTRAINT chk_experiences_type
  CHECK (type = ANY (ARRAY[
    'internship',
    'full_time',
    'part_time',
    'freelance',
    'volunteer',
    'leadership',
    'military'
  ]));
