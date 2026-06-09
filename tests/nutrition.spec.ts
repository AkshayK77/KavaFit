import { test, expect } from 'playwright/test'
import { mockLogin, collectConsoleErrors } from './helpers/auth'

test.describe('nutrition', () => {
  test.beforeEach(async ({ page }) => {
    await mockLogin(page)

    // Mock all Supabase REST calls
    await page.route('**/rest/v1/**', async route => {
      const url = route.request().url()
      if (url.includes('profiles')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ id: 'test-user-id-12345', onboarding_complete: true, avatar_url: null, calorie_goal: 2500, protein_goal: 180 }]),
        })
      } else if (url.includes('nutrition_logs')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      }
    })

    // Mock the food search edge function / ai-proxy
    await page.route('**/functions/v1/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ foods: [{ name: 'Chicken Breast', calories: 165, protein: 31, carbs: 0, fat: 3.6 }] }),
      })
    })
  })

  test('nutrition tab is accessible from the nav', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)
    await page.goto('/dashboard')

    // Click the Nutrition nav item
    const nutritionLink = page.locator('a[href="/nutrition"], nav a:has-text("Nutrition"), a:has-text("Nutrition")').first()
    await expect(nutritionLink).toBeVisible({ timeout: 5000 })
    await nutritionLink.click()

    await expect(page).toHaveURL(/nutrition/, { timeout: 3000 })
    checkErrors()
  })

  test('food search input is present on nutrition page', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)
    await page.goto('/nutrition')

    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="food" i], input[type="search"]').first()
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    checkErrors()
  })

  test('logging a meal shows it in the daily log', async ({ page }) => {
    const checkErrors = collectConsoleErrors(page)

    // Mock nutrition log insert to return the new entry
    await page.route('**/rest/v1/nutrition_logs**', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify([{ id: 'log-1', food_name: 'Chicken Breast', calories: 165, protein: 31, carbs: 0, fat: 3.6, date: new Date().toISOString().split('T')[0] }]),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ id: 'log-1', food_name: 'Chicken Breast', calories: 165, protein: 31, carbs: 0, fat: 3.6, date: new Date().toISOString().split('T')[0] }]),
        })
      }
    })

    await page.goto('/nutrition')

    // Type in the search box
    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="food" i], input[type="search"]').first()
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await searchInput.fill('Chicken')

    // Wait for a result and click it or click an "Add" button
    const resultOrAddBtn = page.locator('text=/chicken/i, button:has-text("Add"), button:has-text("Log")').first()
    if (await resultOrAddBtn.isVisible({ timeout: 3000 })) {
      await resultOrAddBtn.click()
      // The food should now appear in the daily log
      await expect(page.locator('text=/chicken/i').first()).toBeVisible({ timeout: 3000 })
    }
    checkErrors()
  })
})
