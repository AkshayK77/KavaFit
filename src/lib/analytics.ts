import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined

if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, { api_host: 'https://app.posthog.com' })
}

export function track(event: string, properties?: Record<string, unknown>): void {
  if (!POSTHOG_KEY) return
  posthog.capture(event, properties)
}

export function identifyUser(userId: string): void {
  if (!POSTHOG_KEY) return
  posthog.identify(userId)
}
