import { Page } from 'playwright/test'

const SUPABASE_URL_PATTERN = '**/auth/v1/**'

/**
 * Intercepts all Supabase auth requests and returns a mocked successful session.
 * Call before navigating to pages that require auth.
 */
export async function mockLogin(page: Page) {
  const fakeUser = {
    id: 'test-user-id-12345',
    email: 'testuser+kavafit@example.com',
    user_metadata: { full_name: 'Test User' },
    app_metadata: {},
    aud: 'authenticated',
    created_at: '2024-01-01T00:00:00Z',
  }

  const fakeSession = {
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: fakeUser,
  }

  // Mock Supabase auth sign-in
  await page.route('**/auth/v1/token**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fakeSession),
    })
  })

  // Mock Supabase session retrieval
  await page.route('**/auth/v1/user**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fakeUser),
    })
  })

  // Mock profile fetch
  await page.route('**/rest/v1/profiles**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: fakeUser.id, avatar_url: null, onboarding_complete: true }]),
    })
  })

  // Inject fake session into localStorage so Supabase client picks it up
  await page.addInitScript((session) => {
    const key = 'sb-' + window.location.hostname + '-auth-token'
    localStorage.setItem(key, JSON.stringify(session))
    // Also try the common default key
    localStorage.setItem('supabase.auth.token', JSON.stringify({ currentSession: session, expiresAt: Date.now() / 1000 + 3600 }))
  }, fakeSession)
}

/**
 * Collects console errors during a test. Use with page.on('console') before navigation.
 * Returns a checker function that throws if any errors were recorded.
 */
export function collectConsoleErrors(page: Page): () => void {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  return () => {
    if (errors.length > 0) {
      throw new Error(`Console errors detected:\n${errors.join('\n')}`)
    }
  }
}
