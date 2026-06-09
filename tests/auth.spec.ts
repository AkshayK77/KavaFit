import { test, expect } from 'playwright/test'
import { collectConsoleErrors } from './helpers/auth'

test.describe('auth', () => {
  test('landing page loads without a JS error', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)
    await page.goto('/')
    await expect(page).toHaveTitle(/forge/i)
    checkErrors()
  })

  test('login page shows a login form', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)
    await page.goto('/login')
    // Expect email and password inputs
    await expect(page.locator('input[type="email"], input[placeholder*="mail" i]').first()).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
    checkErrors()
  })

  test('invalid credentials show an error message', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)

    // Intercept the Supabase sign-in endpoint and return a 400
    await page.route('**/auth/v1/token**', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
      })
    })

    await page.goto('/login')

    await page.locator('input[type="email"], input[placeholder*="mail" i]').first().fill('bad@example.com')
    await page.locator('input[type="password"]').first().fill('wrongpassword')

    // Click the primary submit button
    await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Continue")').first().click()

    // An error message should appear
    await expect(page.locator('text=/invalid|incorrect|error|wrong/i').first()).toBeVisible({ timeout: 5000 })
    checkErrors()
  })
})
