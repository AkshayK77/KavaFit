import { test, expect } from 'playwright/test'
import { mockLogin, collectConsoleErrors } from './helpers/auth'

test.describe('onboarding', () => {
  test.beforeEach(async ({ page }) => {
    // Mock all Supabase REST calls for onboarding
    await page.route('**/rest/v1/**', async route => {
      const url = route.request().url()
      if (url.includes('profiles')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ id: 'test-user-id-12345', onboarding_complete: false, avatar_url: null }]),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      }
    })
    await mockLogin(page)
  })

  test('onboarding flow renders after mocked login', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)
    await page.goto('/onboarding')
    // Should show some onboarding content
    await expect(page.locator('h1, h2, [class*="title"], [class*="heading"]').first()).toBeVisible({ timeout: 5000 })
    checkErrors()
  })

  test('user can step through onboarding fields', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)
    await page.goto('/onboarding')

    // Fill in a name field if present on first step
    const nameInput = page.locator('input[placeholder*="name" i], input[name*="name" i]').first()
    if (await nameInput.isVisible()) {
      await nameInput.fill('Test User')
    }

    // Click a next/continue button to advance
    const nextBtn = page.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Get started")').first()
    if (await nextBtn.isVisible()) {
      await nextBtn.click()
      // Second step should be visible
      await page.waitForTimeout(300)
      await expect(page.locator('input, select, [role="radio"], button').first()).toBeVisible()
    }
    checkErrors()
  })

  test('completing onboarding navigates to dashboard', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)

    // Mock the profile upsert so "complete onboarding" succeeds
    await page.route('**/rest/v1/profiles**', async route => {
      if (route.request().method() === 'PATCH' || route.request().method() === 'POST') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ id: 'test-user-id-12345', onboarding_complete: true, avatar_url: null }]),
        })
      }
    })

    await page.goto('/onboarding')

    // Click through all steps until we reach the end / finish button
    for (let i = 0; i < 6; i++) {
      const finishBtn = page.locator('button:has-text("Finish"), button:has-text("Done"), button:has-text("Start"), button:has-text("Complete")').first()
      if (await finishBtn.isVisible()) {
        await finishBtn.click()
        break
      }
      const nextBtn = page.locator('button:has-text("Next"), button:has-text("Continue")').first()
      if (await nextBtn.isVisible()) {
        await nextBtn.click()
        await page.waitForTimeout(200)
      }
    }

    // Should navigate to /dashboard
    await expect(page).toHaveURL(/dashboard/, { timeout: 5000 })
    checkErrors()
  })
})
