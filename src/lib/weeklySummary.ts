import { supabase } from './supabase'
import { callAgent } from './geminiAgent'

function thisMonday() {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d)
  mon.setDate(d.getDate() + diff)
  return mon.toISOString().split('T')[0]
}

function prevWeekStart() {
  const mon = new Date(thisMonday() + 'T00:00:00')
  mon.setDate(mon.getDate() - 7)
  return mon.toISOString().split('T')[0]
}

function prevWeekEnd() {
  const mon = new Date(prevWeekStart() + 'T00:00:00')
  mon.setDate(mon.getDate() + 6)
  return mon.toISOString().split('T')[0]
}

export async function maybeGenerateWeeklySummary(userId: string): Promise<string | null> {
  const today = new Date().toISOString().split('T')[0]
  const isMonday = new Date().getDay() === 1
  const cachedDate = localStorage.getItem('last_summary_date')
  const cachedSummary = localStorage.getItem('last_weekly_summary')

  // Return cached summary unless: (a) no cache exists, or (b) it's Monday and cache is from a previous week
  if (cachedDate && cachedSummary) {
    const cacheIsFromThisWeek = cachedDate >= thisMonday()
    if (!isMonday || cacheIsFromThisWeek) {
      return cachedSummary
    }
    // It's Monday and cache is stale — fall through to regenerate
  }
  // No cache at all — generate immediately regardless of day

  const from = prevWeekStart()
  const to = prevWeekEnd()

  type VolumeRowW = { muscle_group: string; total_sets: number | null }
  type WeightRow = { date: string; weight_kg: number | null }
  type ProfileRow = { daily_protein_target: number | null; fitness_goal: string | null }
  type MealRow = { protein_g: number | null }

  const [sessRes, volRes, weightsRes, profileRes, mealsRes] = await Promise.all([
    supabase.from('sessions').select('id').eq('user_id', userId).gte('date', from).lte('date', to).not('completed_at', 'is', null),
    supabase.from('muscle_volume_log').select('muscle_group,total_sets').eq('user_id', userId).eq('week_start', from),
    supabase.from('measurements').select('date,weight_kg').eq('user_id', userId).gte('date', from).lte('date', to).not('weight_kg', 'is', null).order('date'),
    supabase.from('profiles').select('daily_protein_target,fitness_goal').eq('id', userId).single(),
    supabase.from('meal_history').select('protein_g').eq('user_id', userId).gte('created_at', from + 'T00:00:00').lte('created_at', to + 'T23:59:59'),
  ])

  const sessions = sessRes.data as Array<{ id: string }> | null
  const volumeRows = volRes.data as VolumeRowW[] | null
  const weights = weightsRes.data as WeightRow[] | null
  const profile = profileRes.data as ProfileRow | null
  const meals = mealsRes.data as MealRow[] | null

  const totalSessions = (sessions || []).length
  const muscleVolume = Object.fromEntries(
    (volumeRows || []).map(r => [r.muscle_group.replace(/_/g, ' '), r.total_sets])
  )
  const avgDailyProtein = (meals || []).length
    ? Math.round((meals || []).reduce((s, m) => s + (m.protein_g || 0), 0) / 7)
    : 0
  const proteinTarget = profile?.daily_protein_target || 0
  const weightArr = weights || []
  const weightChange = weightArr.length >= 2
    ? +(parseFloat(String(weightArr[weightArr.length - 1].weight_kg)) - parseFloat(String(weightArr[0].weight_kg))).toFixed(1)
    : null

  const weekData = {
    weekOf: from,
    totalSessions,
    muscleVolume,
    avgDailyProtein,
    proteinTarget,
    weightChange: weightChange !== null ? (weightChange >= 0 ? `+${weightChange}kg` : `${weightChange}kg`) : 'not tracked',
  }

  const message = `Generate a weekly fitness summary for this user based on last week's data: ${JSON.stringify(weekData)}. Be encouraging but honest. Keep it to 4-5 sentences.`
  const summary = await callAgent(userId, message)

  if (summary) {
    localStorage.setItem('last_summary_date', today)
    localStorage.setItem('last_weekly_summary', summary)
    return summary
  }

  return null
}
