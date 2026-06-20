import { test, expect } from 'playwright/test'
import { mockLogin, collectConsoleErrors } from './helpers/auth'

test.describe('workout', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page)
    // Mock all Supabase REST calls
    await page.route('**/rest/v1/**', async route => {
      const url = route.request().url()
      if (url.includes('profiles')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ id: 'test-user-id-12345', onboarding_complete: true, avatar_url: null, goal: 'strength', fitness_level: 'intermediate' }]),
        })
      } else if (url.includes('workout_plans')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      } else if (url.includes('sessions')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      } else if (url.includes('exercises')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'ex-1', name: 'Bench Press', muscle_groups: ['chest', 'tricep'] },
            { id: 'ex-2', name: 'Squat', muscle_groups: ['quad', 'glute'] },
          ]),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      }
    })
    // Mock edge functions
    await page.route('**/functions/v1/**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })
  })

  test('dashboard loads and shows a workout card or CTA', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)
    await page.goto('/dashboard')
    // Should show some content — a card, a button, or heading
    await expect(page.locator('h1, h2, button, [class*="card"]').first()).toBeVisible({ timeout: 8000 })
    checkErrors()
  })

  test('user can navigate to the workout logger', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)
    await page.goto('/workout')
    await expect(page.locator('h1, h2, [class*="title"], button').first()).toBeVisible({ timeout: 8000 })
    checkErrors()
  })

  test('completing a workout shows a completion state', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)

    // Pre-populate localStorage with an active session so the workout page loads in mode B
    await page.addInitScript(() => {
      const session = {
        userId: 'test-user-id-12345',
        activeSession: { id: 'sess-test-1', name: 'Push Day' },
        sessionExercises: [{
          exercise: { id: 'ex-1', name: 'Bench Press', muscle_groups: ['chest'] },
          sets: 3,
          repRange: '8-12',
          prevSets: [],
          currentSets: [
            { reps: '10', completed: true, weight: '60' },
            { reps: '10', completed: true, weight: '60' },
            { reps: '8', completed: true, weight: '60' },
          ],
          progressionHint: null,
        }],
        warmup: null,
        warmupDismissed: false,
        exerciseDone: {},
        startTime: Date.now() - 1800000,
        pausedTime: 0,
        isPaused: false,
        pauseStart: null,
      }
      localStorage.setItem('kavafit_active_session_v1', JSON.stringify(session))
    })

    // Mock session completion upsert
    await page.route('**/rest/v1/sessions**', async route => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      }
    })
    await page.route('**/rest/v1/session_sets**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route('**/rest/v1/muscle_volume_log**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/workout')

    // Click Finish Session button
    const finishBtn = page.locator('button:has-text("Finish Session"), button:has-text("Finish")').first()
    await expect(finishBtn).toBeVisible({ timeout: 5000 })
    await finishBtn.click()

    // Completion state should appear
    await expect(page.locator('text=/complete|done|session complete/i').first()).toBeVisible({ timeout: 5000 })
    checkErrors()
  })
})
