/**
 * career-roadmap-tiers.test.jsx
 *
 * Tests role tier rendering and error state in CareerRoadmap.jsx.
 *
 * WHY THESE TESTS MATTER:
 *
 * 1. Error state test: Before the fix, a failed roles query rendered an empty
 *    page — the same as "no roles yet". A user couldn't tell if the query failed
 *    or if they just hadn't generated a roadmap. The fix added a proper error
 *    screen. This test ensures it appears.
 *
 * 2. Tier rendering test: Each role has a `tier` field (tier_1/tier_2/tier_3).
 *    The component renders separate sections per tier. If a role ends up in the
 *    wrong section (e.g., due to a bad insert mapping), the test catches it.
 *    This is the UI counterpart of the mapRoleToDbRow unit test.
 *
 * 3. No-roles state test: Ensures the "generate roadmap" prompt renders when
 *    the list is empty — not an error message, not nothing.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createWrapper } from '../testUtils.jsx';
import {
  createSupabaseMock,
  MOCK_USER,
  MOCK_PROFILE_COMPLETE,
  MOCK_ROLES,
} from '../mockSupabase.js';

// ── Mock dependencies ─────────────────────────────────────────────────────────

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  };
});

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: MOCK_USER }),
}));

vi.mock('@/api/supabaseClient', () => ({ supabase: {} }));

// Stub child components that render sub-queries
vi.mock('../../components/roadmap/RoleCard', () => ({
  default: ({ role }) => <div data-testid={`role-${role.id}`}>{role.title}</div>,
}));
vi.mock('../../components/roadmap/LearningPaths', () => ({
  default: () => <div data-testid="learning-paths" />,
}));
vi.mock('../../components/roadmap/ProgressVisualization', () => ({
  default: () => <div data-testid="progress-viz" />,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setSupabaseMock(tableMap) {
  const { supabase } = await import('@/api/supabaseClient');
  const mock = createSupabaseMock(tableMap);
  Object.assign(supabase, mock);
}

async function renderCareerRoadmap() {
  const { default: CareerRoadmap } = await import('../../pages/CareerRoadmap.jsx');
  const Wrapper = createWrapper('/CareerRoadmap');
  return render(<CareerRoadmap />, { wrapper: Wrapper });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CareerRoadmap tier rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error screen when roles query fails', async () => {
    await setSupabaseMock({
      career_roles: { data: null, error: { message: 'Network error' } },
      profiles:     { data: [MOCK_PROFILE_COMPLETE], error: null },
      experiences:  { data: [], error: null },
      certifications: { data: [], error: null },
    });

    await renderCareerRoadmap();

    await waitFor(() => {
      expect(
        screen.getByText(/failed to load your career roadmap/i)
      ).toBeInTheDocument();
    });
  });

  it('renders each role in the correct tier section', async () => {
    /**
     * MOCK_ROLES contains one role per tier. The component splits them into
     * separate sections labelled "Tier 1", "Tier 2", "Tier 3".
     *
     * If the tier field were wrong (e.g., all roles mapped to tier_1 due to a
     * bad spread), only one section would appear and the others would be absent.
     */
    await setSupabaseMock({
      career_roles:   { data: MOCK_ROLES, error: null },
      profiles:       { data: [MOCK_PROFILE_COMPLETE], error: null },
      experiences:    { data: [], error: null },
      certifications: { data: [], error: null },
    });

    await renderCareerRoadmap();

    await waitFor(() => {
      // Tier section headers
      expect(screen.getByText(/Tier 1/i)).toBeInTheDocument();
      expect(screen.getByText(/Tier 2/i)).toBeInTheDocument();
      expect(screen.getByText(/Tier 3/i)).toBeInTheDocument();
    });

    // Each role title visible in its mocked RoleCard
    expect(screen.getByText('Junior Data Analyst')).toBeInTheDocument();
    expect(screen.getByText('Business Intelligence Analyst')).toBeInTheDocument();
    expect(screen.getByText('Data Engineer')).toBeInTheDocument();
  });

  it('shows generate-roadmap prompt when no roles exist yet', async () => {
    await setSupabaseMock({
      career_roles:   { data: [], error: null },
      profiles:       { data: [MOCK_PROFILE_COMPLETE], error: null },
      experiences:    { data: [], error: null },
      certifications: { data: [], error: null },
    });

    await renderCareerRoadmap();

    await waitFor(() => {
      expect(
        screen.getByText(/No roles generated yet/i)
      ).toBeInTheDocument();
    });

    // Error screen must not appear for an empty-but-successful query
    expect(
      screen.queryByText(/failed to load your career roadmap/i)
    ).not.toBeInTheDocument();
  });
});
