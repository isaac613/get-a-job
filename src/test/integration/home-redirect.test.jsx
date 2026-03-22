/**
 * home-redirect.test.jsx
 *
 * Tests the redirect guard in Home.jsx.
 *
 * WHY THESE TESTS MATTER:
 * The redirect logic has three conditions that must ALL be correct:
 *   1. Only fire after a real fetch (profileFetched=true), not while loading
 *   2. Fire when profiles is empty (new user)
 *   3. Fire when profile.onboarding_complete is false
 *   4. NOT fire when the query errored (profileError=true) — even if data is empty.
 *      Before the fix, a network error would look like "no profile" and redirect
 *      the user to Onboarding, creating a confusing broken state.
 *
 * These tests would FAIL against the pre-fix Home.jsx (which used `isLoading`
 * instead of `isFetched` and had no `profileError` guard).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { createWrapper } from '../testUtils.jsx';
import {
  createSupabaseMock,
  MOCK_USER,
  MOCK_PROFILE_COMPLETE,
  MOCK_PROFILE_INCOMPLETE,
  MOCK_ROLES,
  MOCK_TASKS,
} from '../mockSupabase.js';

// ── Mock dependencies ────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    // Keep Link as a simple anchor so we don't need Routes setup
    Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  };
});

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: MOCK_USER }),
}));

// Supabase is mocked per-test via vi.mocked
vi.mock('@/api/supabaseClient', () => ({ supabase: {} }));

// Stub child components that make their own network calls
vi.mock('../../components/dashboard/SkillGapCourses', () => ({
  default: () => <div data-testid="skill-gap-courses" />,
}));
vi.mock('../../components/dashboard/JobMatchChecker', () => ({
  default: () => <div data-testid="job-match-checker" />,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Replaces the mocked supabase module's implementation for each test.
 * Using dynamic import so the module mock is already hoisted.
 */
async function setSupabaseMock(tableMap) {
  const { supabase } = await import('@/api/supabaseClient');
  const mock = createSupabaseMock(tableMap);
  Object.assign(supabase, mock);
}

async function renderHome() {
  // Dynamic import so module mocks are applied first
  const { default: Home } = await import('../../pages/Home.jsx');
  const Wrapper = createWrapper('/Home');
  return render(<Home />, { wrapper: Wrapper });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Home redirect guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to Onboarding when profiles array is empty (new user)', async () => {
    await setSupabaseMock({
      profiles:     { data: [], error: null },
      career_roles: { data: [], error: null },
      applications: { data: [], error: null },
      experiences:  { data: [], error: null },
      tasks:        { data: [], error: null },
    });

    await renderHome();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/Onboarding');
    });
  });

  it('redirects to Onboarding when profile.onboarding_complete is false', async () => {
    await setSupabaseMock({
      profiles:     { data: [MOCK_PROFILE_INCOMPLETE], error: null },
      career_roles: { data: [], error: null },
      applications: { data: [], error: null },
      experiences:  { data: [], error: null },
      tasks:        { data: [], error: null },
    });

    await renderHome();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/Onboarding');
    });
  });

  it('does NOT redirect when the profile query errors (network failure)', async () => {
    /**
     * CRITICAL TEST — This tests the profileError guard we added.
     *
     * Before the fix: profileError=true → profiles=[] → redirect to /Onboarding
     * After the fix:  profileError=true → guard fires `return` early, no redirect
     *
     * A network error should never send the user to Onboarding.
     * It should render whatever it can and let the user know something went wrong.
     */
    await setSupabaseMock({
      profiles:     { data: null, error: { message: 'Failed to fetch', code: 'PGRST301' } },
      career_roles: { data: [], error: null },
      applications: { data: [], error: null },
      experiences:  { data: [], error: null },
      tasks:        { data: [], error: null },
    });

    await renderHome();

    // Give React Query time to resolve
    await new Promise((r) => setTimeout(r, 100));

    expect(mockNavigate).not.toHaveBeenCalledWith('/Onboarding');
  });

  it('does NOT redirect when profile is complete', async () => {
    await setSupabaseMock({
      profiles:     { data: [MOCK_PROFILE_COMPLETE], error: null },
      career_roles: { data: MOCK_ROLES, error: null },
      applications: { data: [], error: null },
      experiences:  { data: [], error: null },
      tasks:        { data: [], error: null },
    });

    await renderHome();

    await new Promise((r) => setTimeout(r, 100));

    expect(mockNavigate).not.toHaveBeenCalledWith('/Onboarding');
  });
});
