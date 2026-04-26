import { describe, it, expect } from 'vitest';
import { isAnalysisStale } from '@/lib/staleAnalysis';

// last_reality_check_date is timestamptz (migration 20260426) — every fixture
// here uses a full ISO timestamp so tests reflect the production data shape.
const tsBefore = '2026-04-25T12:00:00.000Z';
const tsAt = '2026-04-26T12:00:00.000Z';
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
        profile: { last_reality_check_date: tsAt },
        experiences: [{ created_at: tsBefore }],
        certifications: [{ created_at: tsBefore }],
        projects: [{ created_at: tsBefore }],
      })
    ).toBe(false);
  });

  it('returns true when an experience was added after the last analysis', () => {
    expect(
      isAnalysisStale({
        profile: { last_reality_check_date: tsAt },
        experiences: [{ created_at: tsAfter }],
        certifications: [],
        projects: [],
      })
    ).toBe(true);
  });

  it('returns true when a certification was added after the last analysis', () => {
    expect(
      isAnalysisStale({
        profile: { last_reality_check_date: tsAt },
        experiences: [],
        certifications: [{ created_at: tsAfter }],
        projects: [],
      })
    ).toBe(true);
  });

  it('returns true when a project was added after the last analysis', () => {
    expect(
      isAnalysisStale({
        profile: { last_reality_check_date: tsAt },
        experiences: [],
        certifications: [],
        projects: [{ created_at: tsAfter }],
      })
    ).toBe(true);
  });

  it('returns true when at least one row is newer even if others are older', () => {
    expect(
      isAnalysisStale({
        profile: { last_reality_check_date: tsAt },
        experiences: [{ created_at: tsBefore }, { created_at: tsAfter }],
        certifications: [{ created_at: tsBefore }],
        projects: [],
      })
    ).toBe(true);
  });

  it('returns false when all arrays are empty/missing', () => {
    expect(
      isAnalysisStale({
        profile: { last_reality_check_date: tsAt },
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
        profile: { last_reality_check_date: tsAt },
        experiences: [{ id: 'x' }],
        certifications: [],
        projects: [],
      })
    ).toBe(false);
  });

  it('exact timestamp comparison: a row created BEFORE the analysis run does not trigger the banner', () => {
    // Regression guard: pre-migration this case fired falsely because
    // last_reality_check_date was a date string parsed as midnight UTC, so
    // any same-day created_at after midnight looked "newer" than the
    // analysis. With timestamptz + ISO writes, the comparison is exact —
    // a row created at 15:15 same-day is older than an analysis at 19:33.
    expect(
      isAnalysisStale({
        profile: { last_reality_check_date: '2026-04-26T19:33:00.000Z' },
        experiences: [{ created_at: '2026-04-26T15:15:05.000Z' }],
        certifications: [],
        projects: [],
      })
    ).toBe(false);
  });

  it('exact timestamp comparison: a row created AFTER the analysis run triggers the banner', () => {
    expect(
      isAnalysisStale({
        profile: { last_reality_check_date: '2026-04-26T19:33:00.000Z' },
        experiences: [{ created_at: '2026-04-26T19:34:00.000Z' }],
        certifications: [],
        projects: [],
      })
    ).toBe(true);
  });
});
