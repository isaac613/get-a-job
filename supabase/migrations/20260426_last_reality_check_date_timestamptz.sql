-- Promote profiles.last_reality_check_date from date to timestamptz so the
-- staleness banner ("Profile updated since last analysis — refresh roadmap")
-- can compare against experiences/certifications/projects.created_at exactly,
-- without the day-precision false-positive that fired the banner immediately
-- after a successful refresh whenever a same-day pre-existing row had a
-- created_at later than midnight UTC of the same day.
--
-- Cast is deterministic on a UTC-tz server: '2026-04-26'::timestamptz becomes
-- '2026-04-26 00:00:00+00'. Historical rows lose intra-day precision (the
-- analysis "happened at midnight" instead of when it really did) — acceptable
-- because nothing compares against those historical timestamps.
ALTER TABLE profiles
  ALTER COLUMN last_reality_check_date TYPE timestamptz
  USING last_reality_check_date::timestamptz;
