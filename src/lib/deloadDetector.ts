import { supabase } from './supabase'
import { getWeekStart } from './workoutPlan'
import * as Sentry from '@sentry/react'

// Returns the Monday date string for an arbitrary date
function weekStartFor(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().split('T')[0]
}

export async function checkDeload(userId: string): Promise<{ deloadDue: boolean; weeksCount: number }> {
  const [profileRes, sessionsRes] = await Promise.all([
    supabase.from('profiles').select('sessions_per_week').eq('id', userId).single(),
    supabase.from('sessions').select('date').eq('user_id', userId).not('completed_at', 'is', null).order('date', { ascending: false }).limit(100),
  ])

  const profile = profileRes.data as { sessions_per_week: number | null } | null
  const sessions = sessionsRes.data as Array<{ date: string }> | null

  if (!profile || !sessions || sessions.length === 0) {
    return { deloadDue: false, weeksCount: 0 }
  }

  const sessionsPerWeek = profile.sessions_per_week || 3

  // Group sessions by week
  const byWeek: Record<string, number> = {}
  sessions.forEach(s => {
    const wk = weekStartFor(s.date)
    byWeek[wk] = (byWeek[wk] || 0) + 1
  })

  // Sort weeks descending, skip current week (may be in progress)
  const currentWeek = getWeekStart()
  const completedWeeks = Object.entries(byWeek)
    .filter(([wk]) => wk < currentWeek)
    .sort((a, b) => b[0].localeCompare(a[0]))

  // Count consecutive qualifying weeks
  let consecutive = 0
  let prevWeek: string | null = null

  for (const [wk, count] of completedWeeks) {
    if ((count as number) < sessionsPerWeek) break

    if (prevWeek !== null) {
      // Check weeks are truly consecutive (7 days apart)
      const gap = (new Date(prevWeek).getTime() - new Date(wk).getTime()) / 86400000
      if (gap !== 7) break
    }

    consecutive++
    prevWeek = wk
  }

  return { deloadDue: consecutive >= 5, weeksCount: consecutive }
}

export async function markDeloadSuggested(userId: string): Promise<void> {
  // Requires: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deload_suggested_at timestamptz;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('profiles') as any)
    .update({ deload_suggested_at: new Date().toISOString() })
    .eq('id', userId)

  if (!error) return

  const msg = (error.message || '').toLowerCase()
  const isMissingColumn = error.code === '42703' || (msg.includes('column') && msg.includes('deload_suggested_at'))

  if (isMissingColumn) {
    console.error('[Forge] Missing DB column: deload_suggested_at on profiles table. Run supabase/migrations/add_deload_column.sql to add it. Deload detection is disabled until then.')
    Sentry.captureException(new Error(`Missing column: deload_suggested_at — ${error.message}`))
    return
  }

  throw new Error(error.message || 'markDeloadSuggested failed')
}
