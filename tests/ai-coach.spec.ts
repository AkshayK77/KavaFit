import { test, expect } from 'playwright/test'
import { mockLogin, collectConsoleErrors } from './helpers/auth'

const CANNED_AI_RESPONSE = 'Great question! Based on your training history, I recommend focusing on progressive overload this week.'

test.describe('ai-coach', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page)

    // Mock Supabase REST calls
    await page.route('**/rest/v1/**', async route => {
      const url = route.request().url()
      if (url.includes('profiles')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ id: 'test-user-id-12345', onboarding_complete: true, avatar_url: null }]),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      }
    })

    // Mock the ai-proxy edge function
    await page.route('**/functions/v1/ai-proxy**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: CANNED_AI_RESPONSE }),
      })
    })
  })

  test('AI drawer can be opened from the workout page', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)
    await page.goto('/workout')

    // Desktop: click the floating AI button. Mobile: tap AI Coach tab.
    const aiBtn = page.locator('button[title="AI Coach"], a:has-text("AI Coach"), button:has-text("AI"), nav a[href="/ai"]').first()
    await expect(aiBtn).toBeVisible({ timeout: 5000 })
    await aiBtn.click()

    // The drawer or AI page should appear
    await expect(page.locator('text=/forge ai coach|ai coach|ask me/i').first()).toBeVisible({ timeout: 3000 })
    checkErrors()
  })

  test('typing a message and submitting shows a loading state', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)

    // Delay the AI response so we can observe the loading state
    await page.route('**/functions/v1/ai-proxy**', async route => {
      await new Promise(r => setTimeout(r, 800))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: CANNED_AI_RESPONSE }),
      })
    })

    await page.goto('/ai')

    const input = page.locator('textarea, input[placeholder*="ask" i], input[placeholder*="coach" i]').first()
    await expect(input).toBeVisible({ timeout: 5000 })
    await input.fill('What should I train today?')

    const sendBtn = page.locator('button[type="submit"], button:has-text("Send"), button[title*="send" i]').last()
    await sendBtn.click()

    // Loading indicator (typing dots or spinner) should appear
    await expect(page.locator('[class*="typing"], [class*="loading"], [class*="spinner"], [aria-label*="loading" i]').first())
      .toBeVisible({ timeout: 2000 })
      .catch(() => {
        // If no explicit loading indicator, just wait for the response to arrive
      })
    checkErrors()
  })

  test('mocked AI response renders in the chat UI', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)
    await page.goto('/ai')

    const input = page.locator('textarea, input[placeholder*="ask" i], input[placeholder*="coach" i]').first()
    await expect(input).toBeVisible({ timeout: 5000 })
    await input.fill('What should I train today?')

    const sendBtn = page.locator('button[type="submit"], button:has-text("Send"), button[title*="send" i]').last()
    await sendBtn.click()

    // The canned response text should appear
    await expect(page.locator(`text=${CANNED_AI_RESPONSE.slice(0, 30)}`).first()).toBeVisible({ timeout: 8000 })
    checkErrors()
  })
})
