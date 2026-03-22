/**
 * tasks-state.test.jsx
 *
 * Tests the Tasks page for correct error vs empty state rendering.
 *
 * WHY THESE TESTS MATTER:
 * Before the fix, a failed tasks query silently rendered the empty state:
 * "No tasks assigned yet." — exactly the same as a legitimate empty list.
 * A user would have no idea their data failed to load.
 *
 * The tests here verify three distinct states that must NOT be confused:
 *
 *   1. Query error   → "Failed to load" error screen
 *   2. Empty results → "No tasks assigned yet" empty state
 *   3. Loaded data   → actual task titles rendered
 *
 * Test 1 directly targets the bug. Tests 2 and 3 ensure the fix didn't
 * accidentally break the success path or the legitimate empty state.
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
  MOCK_TASKS,
} from '../mockSupabase.js';

// ── Mock dependencies ─────────────────────────────────────────────────────────

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: MOCK_USER }),
}));

vi.mock('@/api/supabaseClient', () => ({ supabase: {} }));

// ── Helpers ───────────────────────────────────────────────────────────────────

async function setSupabaseMock(tableMap) {
  const { supabase } = await import('@/api/supabaseClient');
  const mock = createSupabaseMock(tableMap);
  Object.assign(supabase, mock);
}

async function renderTasks() {
  const { default: Tasks } = await import('../../pages/Tasks.jsx');
  const Wrapper = createWrapper('/Tasks');
  return render(<Tasks />, { wrapper: Wrapper });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Tasks page state rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error screen (not empty state) when tasks query fails', async () => {
    /**
     * This test targets the pre-fix bug directly.
     * Before fix: failed query → { data: [], error } → renders "No tasks assigned yet."
     * After fix:  failed query → isError=true → renders "Failed to load tasks."
     */
    await setSupabaseMock({
      tasks:        { data: null, error: { message: 'Connection timeout' } },
      profiles:     { data: [MOCK_PROFILE_COMPLETE], error: null },
      career_roles: { data: MOCK_ROLES, error: null },
    });

    await renderTasks();

    await waitFor(() => {
      expect(screen.getByText(/failed to load tasks/i)).toBeInTheDocument();
    });

    // The misleading empty state must NOT be shown
    expect(screen.queryByText(/no tasks assigned yet/i)).not.toBeInTheDocument();
  });

  it('shows empty state message when tasks query succeeds but returns no tasks', async () => {
    /**
     * This test ensures the fix didn't break the legitimate empty state.
     * An empty list and an error are different conditions — both must be
     * handled correctly and distinctly.
     */
    await setSupabaseMock({
      tasks:        { data: [], error: null },
      profiles:     { data: [MOCK_PROFILE_COMPLETE], error: null },
      career_roles: { data: MOCK_ROLES, error: null },
    });

    await renderTasks();

    await waitFor(() => {
      expect(screen.getByText(/no tasks assigned yet/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/failed to load tasks/i)).not.toBeInTheDocument();
  });

  it('renders task titles when tasks are loaded', async () => {
    await setSupabaseMock({
      tasks:        { data: MOCK_TASKS, error: null },
      profiles:     { data: [MOCK_PROFILE_COMPLETE], error: null },
      career_roles: { data: MOCK_ROLES, error: null },
    });

    await renderTasks();

    await waitFor(() => {
      expect(
        screen.getByText('Update CV for Data Analyst roles')
      ).toBeInTheDocument();
    });

    // Empty state must not co-exist with real tasks
    expect(screen.queryByText(/no tasks assigned yet/i)).not.toBeInTheDocument();
  });
});
