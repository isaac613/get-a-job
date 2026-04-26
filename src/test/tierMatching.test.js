import { describe, it, expect } from 'vitest';
import { matchTier, sortCareerRolesForMatching } from '@/lib/tierMatching';

const roles = [
  { title: 'Product Manager', tier: 'tier_3', readiness_score: 0.34 },
  { title: 'Associate Product Manager', tier: 'tier_1', readiness_score: 0.72 },
  { title: 'Product Operations Manager', tier: 'tier_1', readiness_score: 0.66 },
  { title: 'Customer Success Manager', tier: 'tier_1', readiness_score: 0.44 },
  { title: 'Customer Support Specialist', tier: 'tier_2', readiness_score: 0.80 },
];

const sorted = sortCareerRolesForMatching(roles);

describe('matchTier', () => {
  it('returns null when title is missing', () => {
    expect(matchTier('', sorted)).toBeNull();
    expect(matchTier(null, sorted)).toBeNull();
    expect(matchTier(undefined, sorted)).toBeNull();
  });

  it('returns null when careerRoles is empty/missing', () => {
    expect(matchTier('Product Manager', [])).toBeNull();
    expect(matchTier('Product Manager', null)).toBeNull();
    expect(matchTier('Product Manager', undefined)).toBeNull();
  });

  it('returns the tier on exact (case-insensitive, whitespace-collapsed) match', () => {
    expect(matchTier('Product Manager', sorted)).toBe('tier_3');
    expect(matchTier('product manager', sorted)).toBe('tier_3');
    expect(matchTier('  Product   Manager  ', sorted)).toBe('tier_3');
  });

  it('matches with a seniority modifier in the input — tier from the highest-ranked match wins', () => {
    // "Senior Product Manager" → after stopword removal → [product, manager]
    // That's a subset of "Associate Product Manager"'s [product, manager] tokens (after stopwords)
    // and also a subset of "Product Manager" itself. Sorted-by-tier means
    // Associate Product Manager (tier_1) wins over Product Manager (tier_3).
    expect(matchTier('Senior Product Manager', sorted)).toBe('tier_1');
  });

  it('matches when the input is a superset of a career role', () => {
    expect(matchTier('Customer Support Specialist Tier 2', sorted)).toBe('tier_2');
  });

  it('returns null when only a generic single token matches', () => {
    // "Manager" alone has length-1 token set → bails out before fuzzy pass.
    expect(matchTier('Manager', sorted)).toBeNull();
  });

  it('returns null for a role with no overlapping non-stopword tokens', () => {
    expect(matchTier('Software Engineer', sorted)).toBeNull();
    expect(matchTier('Data Scientist', sorted)).toBeNull();
  });

  it('matches when the input is a subset of a role (tokens fully contained)', () => {
    // [customer, specialist] IS a subset of [customer, support, specialist]
    // — that's the desired permissive behaviour. User types a shorter title,
    // we widen up to the matching career_role.
    expect(matchTier('Customer Specialist', sorted)).toBe('tier_2');
  });

  it('returns null when neither set is a subset of the other', () => {
    // [marketing, strategist] vs every career_role's tokens — no role has
    // both "marketing" and "strategist", and no role's full token set is
    // contained within [marketing, strategist] (every role has tokens like
    // "product", "customer", or "manager" not present in the input).
    expect(matchTier('Marketing Strategist', sorted)).toBeNull();
    expect(matchTier('Designer Researcher', sorted)).toBeNull();
  });

  it('skips entries with null/missing title or tier rather than crashing', () => {
    const messy = [
      { title: null, tier: 'tier_1' },
      { title: 'Product Manager', tier: null },
      { title: 'Customer Support Specialist', tier: 'tier_2', readiness_score: 0.8 },
    ];
    expect(matchTier('Customer Support Specialist', messy)).toBe('tier_2');
  });

  it('exact match wins over fuzzy match even when they would yield different tiers', () => {
    // "Product Manager" exact-matches the tier_3 row in roles (Pass 1) and never
    // falls through to Pass 2 where it would otherwise match tier_1 candidates.
    expect(matchTier('Product Manager', sorted)).toBe('tier_3');
  });
});

describe('sortCareerRolesForMatching', () => {
  it('puts tier_1 before tier_2 before tier_3', () => {
    const out = sortCareerRolesForMatching(roles);
    const tiers = out.map((r) => r.tier);
    // First three are tier_1 (Associate, Product Ops, Customer Success Manager),
    // then tier_2 (Customer Support Specialist), then tier_3 (Product Manager).
    expect(tiers[0]).toBe('tier_1');
    expect(tiers[3]).toBe('tier_2');
    expect(tiers[4]).toBe('tier_3');
  });

  it('within a tier, higher readiness_score wins', () => {
    const out = sortCareerRolesForMatching(roles);
    const t1 = out.filter((r) => r.tier === 'tier_1');
    expect(t1.map((r) => r.readiness_score)).toEqual([0.72, 0.66, 0.44]);
  });

  it('does not mutate the input array', () => {
    const input = [...roles];
    const original = JSON.stringify(input);
    sortCareerRolesForMatching(input);
    expect(JSON.stringify(input)).toBe(original);
  });

  it('handles null/undefined input', () => {
    expect(sortCareerRolesForMatching(null)).toEqual([]);
    expect(sortCareerRolesForMatching(undefined)).toEqual([]);
  });
});
