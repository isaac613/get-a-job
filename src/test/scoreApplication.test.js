import { describe, it, expect } from 'vitest';
import { tierFromScore, tierFromScores } from '@/lib/scoreApplication';

// Pure-fit thresholds (FIT_ONLY): 0.55 / 0.40 / 0.25.
// Used when the user has no 5-year goal so the LLM can't return alignment.
describe('tierFromScore (fit-only)', () => {
  it('lands tier_1 at and above 0.55', () => {
    expect(tierFromScore(0.55)).toBe('tier_1');
    expect(tierFromScore(0.80)).toBe('tier_1');
    expect(tierFromScore(1.00)).toBe('tier_1');
  });

  it('lands tier_2 in [0.40, 0.55)', () => {
    expect(tierFromScore(0.40)).toBe('tier_2');
    expect(tierFromScore(0.49)).toBe('tier_2');
    expect(tierFromScore(0.5499)).toBe('tier_2');
  });

  it('lands tier_3 in [0.25, 0.40) and below 0.25 (floor)', () => {
    expect(tierFromScore(0.25)).toBe('tier_3');
    expect(tierFromScore(0.30)).toBe('tier_3');
    expect(tierFromScore(0.10)).toBe('tier_3');
    expect(tierFromScore(0.00)).toBe('tier_3');
  });
});

// Goal-aware tier helper. Combines fit + alignment + role seniority + user
// stage. Thresholds are stricter than generate-career-analysis because LLM
// alignment is noisier than the deterministic skill_transfer matrix.
describe('tierFromScores (goal-aware)', () => {
  describe('alignment fallback', () => {
    it('falls back to tierFromScore when alignment is null', () => {
      expect(tierFromScores(0.75, null)).toBe('tier_1');
      expect(tierFromScores(0.30, null)).toBe('tier_3');
    });

    it('falls back to tierFromScore when alignment is undefined', () => {
      expect(tierFromScores(0.75, undefined)).toBe('tier_1');
    });

    it('falls back when alignment is NaN', () => {
      expect(tierFromScores(0.75, NaN)).toBe('tier_1');
    });
  });

  describe('goal-aware bands without seniority cap', () => {
    it('SDR for PM target — high fit + low alignment lands tier_2 (the original SDR-tier-scoring bug)', () => {
      // fit=0.65, alignment=0.10 — exactly the case from the SDR
      // calibration session. Pre-fix this was tier_1 because we used
      // FIT_ONLY thresholds; goal-aware logic correctly identifies it
      // as off-path.
      expect(tierFromScores(0.65, 0.10)).toBe('tier_2');
    });

    it('CSM for CS user → PM target — fit=0.65, alignment=0.65 lands tier_1', () => {
      expect(tierFromScores(0.65, 0.65)).toBe('tier_2');
      expect(tierFromScores(0.65, 0.70)).toBe('tier_1');
    });

    it('APM for PM target — stretch fit + very strong alignment still lands tier_1', () => {
      // The alt T1 path: fit ≥ 0.40 AND alignment ≥ 0.80
      expect(tierFromScores(0.42, 0.85)).toBe('tier_1');
      expect(tierFromScores(0.40, 0.80)).toBe('tier_1');
      // Just below the alt path → tier_2 (fit ≥ 0.50 fallback fails too)
      expect(tierFromScores(0.40, 0.79)).toBe('tier_3');
    });

    it('Aspirational on-path role — low fit + strong alignment lands tier_3', () => {
      expect(tierFromScores(0.30, 0.80)).toBe('tier_3');
      expect(tierFromScores(0.20, 0.60)).toBe('tier_3');
    });

    it('Off-path low-fit role — both signals weak lands tier_3 via fallback', () => {
      expect(tierFromScores(0.20, 0.10)).toBe('tier_3');
    });
  });

  describe('seniority ceiling cap (the Guardio Mid-PA bug)', () => {
    it('student + Mid Product Analyst (4+ years required) capped at tier_3', () => {
      // The Guardio case: fit=0.65, alignment=0.70, Mid role, early-career
      // user. Without the cap this would be tier_1; with cap it's tier_3.
      expect(tierFromScores(0.65, 0.70, { userStage: 'early', roleSeniority: 'Mid' })).toBe('tier_3');
    });

    it('student + Senior PM capped at tier_3 even with strong fit', () => {
      expect(tierFromScores(0.85, 0.85, { userStage: 'early', roleSeniority: 'Senior' })).toBe('tier_3');
    });

    it('student + Entry_Mid APM (legitimate tier_1) — at ceiling, allowed through', () => {
      expect(tierFromScores(0.55, 0.80, { userStage: 'early', roleSeniority: 'Entry_Mid' })).toBe('tier_1');
    });

    it('student + Entry SDR (in-stage, off-path) lands tier_2 not capped', () => {
      expect(tierFromScores(0.65, 0.30, { userStage: 'early', roleSeniority: 'Entry' })).toBe('tier_2');
    });

    it('mid-career + Senior PM — within their ceiling, allowed through', () => {
      expect(tierFromScores(0.65, 0.85, { userStage: 'mid', roleSeniority: 'Senior' })).toBe('tier_1');
    });

    it('mid-career + Lead PM — above their ceiling, capped at tier_3', () => {
      expect(tierFromScores(0.50, 0.85, { userStage: 'mid', roleSeniority: 'Lead' })).toBe('tier_3');
    });

    it('senior-career has no effective ceiling', () => {
      expect(tierFromScores(0.60, 0.80, { userStage: 'senior', roleSeniority: 'Director' })).toBe('tier_1');
      expect(tierFromScores(0.60, 0.80, { userStage: 'senior', roleSeniority: 'VP' })).toBe('tier_1');
    });
  });

  describe('safe defaults', () => {
    it('no roleSeniority → no cap applied (uses goal-aware logic only)', () => {
      expect(tierFromScores(0.65, 0.75, { userStage: 'early', roleSeniority: null })).toBe('tier_1');
    });

    it('no userStage → no cap applied', () => {
      expect(tierFromScores(0.65, 0.30, { userStage: null, roleSeniority: 'Senior' })).toBe('tier_2');
    });

    it('unknown roleSeniority value (LLM emits unexpected string) → no cap applied', () => {
      expect(tierFromScores(0.65, 0.75, { userStage: 'early', roleSeniority: 'Junior' })).toBe('tier_1');
    });

    it('options missing entirely → no cap applied', () => {
      expect(tierFromScores(0.65, 0.75)).toBe('tier_1');
    });
  });
});
