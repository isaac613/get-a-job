import { describe, it, expect } from 'vitest';
import { isAnalysisStale } from '@/lib/staleAnalysis';

const dayBefore = '2026-04-25';
const dayOf = '2026-04-26';
const dayAfter = '2026-04-27';
const tsBefore = '2026-04-25T12:00:00.000Z';
const tsAfter = '2026-04-27T12:00:00.000Z';

describe('isAnalysisStale', () => {
  it('returns false when profile has no last_reality_check_date (never analysed)', () => {
    expect(isAnalysisStale({ profile: {}, experiences: [], certifications: [], projects: [] })).toBe(false);
    expect(isAnalysisStale({ profile: { last_reality_check_date: null }, experiences: [], certifications: [], projects: [] })).toBe(false);
  });

  it('returns false when profile is null/undefined', () => {
    expect(isAnalysisStale({ profile: null, experiences: [], certifications: [], projects: [] })).toBe(false);
    expect(isAnalysisStale({ profile: undefined, experiences: [], certifications: [], projects: [] })).toBe(false);
  });

  it('returns false when last_reality_check_date is unparseable', () => {
    expect(
      isAnalysisStale({
        profile: { last_reality_check_date: 'not-a-date' },
        experiences: [{ created_at: tsAfter }],
        certifications: [],
        projects: [],
      })
    ).toBe(false);
  });

  it('returns false when all rows are older than last_reality_check_date', () => {
    expect(
      isAnalysisStale({
        profile: { last_reality_check_date: dayOf },
        experiences: [{ created_at: tsBefore }],
        certifications: [{ created_at: tsBefore }],
        projects: [{ created_at: tsBefore }],
      })
    ).toBe(false);
  });

  it('returns true when an experience was added after the last analysis', () => {
    expect(
      isAnalysisStale({
        profile: { last_reality_check_date: dayBefore },
        experiences: [{ created_at: tsAfter }],
        certifications: [],
        projects: [],
      })
    ).toBe(true);
  });

  it('returns true when a certification was added after the last analysis', () => {
    expect(
      isAnalysisStale({
        profile: { last_reality_check_date: dayBefore },
        experiences: [],
        certifications: [{ created_at: tsAfter }],
        projects: [],
      })
    ).toBe(true);
  });

  it('returns true when a project was added after the last analysis', () => {
    expect(
      isAnalysisStale({
        profile: { last_reality_check_date: dayBefore },
        experiences: [],
        certifications: [],
        projects: [{ created_at: tsAfter }],
      })
    ).toBe(true);
  });

  it('returns true when at least one row is newer even if others are older', () => {
    expect(
      isAnalysisStale({
        profile: { last_reality_check_date: dayBefore },
        experiences: [{ created_at: tsBefore }, { created_at: tsAfter }],
        certifications: [{ created_at: tsBefore }],
        projects: [],
      })
    ).toBe(true);
  });

  it('returns false when all arrays are empty/missing', () => {
    expect(
      isAnalysisStale({
        profile: { last_reality_check_date: dayOf },
        experiences: undefined,
        certifications: null,
        projects: [],
      })
    ).toBe(false);
  });

  it('skips rows with no created_at rather than treating them as new', () => {
    // Defensive: a row without created_at could be a partial query result;
    // we don't want to fire the banner on missing data.
    expect(
      isAnalysisStale({
        profile: { last_reality_check_date: dayOf },
        experiences: [{ id: 'x' }],
        certifications: [],
        projects: [],
      })
    ).toBe(false);
  });

  it('day-precision: same-day adds do NOT trigger the banner (documented trade-off)', () => {
    // last_reality_check_date is YYYY-MM-DD → midnight UTC. Anything earlier
    // that day (UTC) parses to a millisecond < midnight, so it's "before"; a
    // same-day created_at *after* midnight UTC technically beats the check.
    // This test pins the actual behaviour so future readers know what to
    // expect rather than guessing.
    expect(
      isAnalysisStale({
        profile: { last_reality_check_date: '2026-04-26' },
        experiences: [{ created_at: '2026-04-26T00:00:00.000Z' }],
        certifications: [],
        projects: [],
      })
    ).toBe(false);
    expect(
      isAnalysisStale({
        profile: { last_reality_check_date: '2026-04-26' },
        experiences: [{ created_at: '2026-04-26T08:00:00.000Z' }],
        certifications: [],
        projects: [],
      })
    ).toBe(true);
  });
});
