/**
 * tasks.spec.js — Playwright E2E tests for the Tasks page.
 *
 * WHY THESE E2E TESTS:
 * The integration tests verify the component renders the right state for each
 * query outcome. These E2E tests verify the same in a real browser — specifically
 * that the error screen text actually appears in the visible DOM (not hidden,
 * not clipped, not overridden by a loading state that never clears).
 */

import { test, expect } from '@playwright/test';
import {
  injectFakeSession,
  mockSupabaseRoutes,
  MOCK_PROFILE_COMPLETE,
  MOCK_ROLES,
  MOCK_TASKS,
} from './helpers/mockSupabase.js';

const SUPABASE_URL = 'https://ilmqmodklutztuybsvwd.supabase.co';

test.describe('Tasks page', () => {
  test('renders task list when tasks load successfully', async ({ page }) => {
    await injectFakeSession(page);
    await mockSupabaseRoutes(page, {
      profiles:     [MOCK_PROFILE_COMPLETE],
      career_roles: MOCK_ROLES,
      tasks:        MOCK_TASKS,
    });

    await page.goto('/Tasks');

    await expect(
      page.getByText('Update CV for Data Analyst roles')
    ).toBeVisible({ timeout: 8000 });

    // Error state must not appear alongside real data
    await expect(page.getByText(/failed to load tasks/i)).not.toBeVisible();
  });

  test('shows error screen (not empty state) when tasks query returns a server error', async ({ page }) => {
    /**
     * The critical test for the tasksError bug fix.
     *
     * Before the fix: tasks query error → isError=false (due to initialData:[])
     *                 → renders "No tasks assigned yet." — misleading
     * After the fix:  tasks query error → isError=true → renders "Failed to load tasks."
     *
     * In a real browser this is important because the CSS, the DOM order, and
     * conditional rendering all run together. This test confirms the error
     * message is actually VISIBLE (not just in the DOM but hidden).
     */
    await injectFakeSession(page);
    await mockSupabaseRoutes(page, {
      profiles:     [MOCK_PROFILE_COMPLETE],
      career_roles: MOCK_ROLES,
      tasks:        [],
    });

    // Override tasks endpoint to 500
    await page.route(`${SUPABASE_URL}/rest/v1/tasks**`, (route) => {
      route.fulfill({ status: 500, body: JSON.stringify({ message: 'Internal server error' }) });
    });

    await page.goto('/Tasks');

    await expect(
      page.getByText(/failed to load tasks/i)
    ).toBeVisible({ timeout: 8000 });

    // The misleading empty state must not be shown
    await expect(page.getByText(/no tasks assigned yet/i)).not.toBeVisible();
  });

  test('shows empty state when tasks list is genuinely empty', async ({ page }) => {
    /**
     * Confirms the empty state still works after the error state was added.
     * These must be two distinct, non-overlapping code paths.
     */
    await injectFakeSession(page);
    await mockSupabaseRoutes(page, {
      profiles:     [MOCK_PROFILE_COMPLETE],
      career_roles: MOCK_ROLES,
      tasks:        [],
    });

    await page.goto('/Tasks');

    await expect(
      page.getByText(/no tasks assigned yet/i)
    ).toBeVisible({ timeout: 8000 });

    await expect(page.getByText(/failed to load tasks/i)).not.toBeVisible();
  });
});
