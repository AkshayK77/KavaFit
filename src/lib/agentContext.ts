import { supabase } from './supabase'
import { getWeekStart } from './workoutPlan'
import type { Profile } from '../types/supabase'

interface SetEntry {
  set: number
  weight_kg: number | null
  reps: number | null
}

interface SessionSummary {
  date: string
  duration_minutes: number | null
  exercises: { name: string; sets: SetEntry[] }[]
}

interface TodayDay {
  dayName: string
  exercises: string[]
}

interface TodayNutrition {
  calories: number
  protein: number
  calorieTarget: number | null
  proteinTarget: number | null
}

export interface AgentContext {
  profile: Profile | null
  recentSessions: SessionSummary[]
  weeklyVolume: { muscle_group: string; total_sets: number | null; updated_at: string | null }[]
  todayNutrition: TodayNutrition
  todayDay: TodayDay | null
}

export function estimateTokenCount(context: object): number {
  return Math.round(JSON.stringify(context).length / 4)
}

export async function buildAgentContext(userId: string): Promise<AgentContext> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  const weekStart = getWeekStart()

  type SessionRow = { id: string; date: string; duration_minutes: number | null; completed_at: string | null }
  type VolumeRow = { muscle_group: string; total_sets: number | null; updated_at: string | null }
  type MealRow = { protein_g: number | null; calories: number | null }

  const [profileRes, sessionRes, volumeRes, mealRes, planResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('sessions').select('id, date, duration_minutes, completed_at').eq('user_id', userId).order('date', { ascending: false }).limit(10),
    supabase.from('muscle_volume_log').select('muscle_group, total_sets, updated_at').eq('user_id', userId).eq('week_start', weekStart),
    supabase.from('meal_history').select('protein_g, calories').eq('user_id', userId).gte('created_at', start.toISOString()).lt('created_at', end.toISOString()),
    supabase.from('workout_plans').select('id, name, plan_days(id, day_name, day_order, exercise_ids)').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const profileRaw = profileRes.data as Profile | null
  // Strip null/undefined fields from profile to keep context lean
  const profile: Profile | null = profileRaw
    ? Object.fromEntries(Object.entries(profileRaw).filter(([, v]) => v !== null && v !== undefined)) as unknown as Profile
    : null

  // Cap to 7 most recent sessions (DB fetches 10)
  const recentSessionRows = ((sessionRes.data as SessionRow[] | null) || []).slice(0, 7)
  const volumeRows = volumeRes.data as VolumeRow[] | null
  const meals = mealRes.data as MealRow[] | null

  // Only include muscle groups with actual volume
  const filteredVolume = (volumeRows || []).filter(r => (r.total_sets ?? 0) > 0)

  // Enrich sessions with sets and exercise names
  let recentSessions: SessionSummary[] = []
  if (recentSessionRows.length > 0) {
    const sessionIds = recentSessionRows.map(s => s.id)
    type SetRow = { session_id: string; exercise_id: string | null; set_number: number; weight_kg: number | null; reps: number | null; completed: boolean | null }
    const setsRes = await supabase.from('session_sets').select('session_id, exercise_id, set_number, weight_kg, reps, completed').in('session_id', sessionIds).eq('completed', true).order('set_number')
    const sets = setsRes.data as SetRow[] | null

    const exerciseIds = [...new Set((sets || []).map(s => s.exercise_id).filter((id): id is string => id !== null))]
    const exerciseMap: Record<string, { id: string; name: string; muscle_groups: string[] }> = {}
    if (exerciseIds.length > 0) {
      const exercisesRes = await supabase.from('exercises').select('id, name, muscle_groups').in('id', exerciseIds)
      const exercises = exercisesRes.data as Array<{ id: string; name: string; muscle_groups: string[] }> | null
      exercises?.forEach(e => { exerciseMap[e.id] = e })
    }

    recentSessions = recentSessionRows.map(sess => {
      const sessSets = (sets || []).filter(s => s.session_id === sess.id)
      const byEx: Record<string, { name: string; sets: SetEntry[] }> = {}
      sessSets.forEach(s => {
        const exId = s.exercise_id ?? ''
        if (!byEx[exId]) {
          byEx[exId] = { name: exerciseMap[exId]?.name ?? exId, sets: [] }
        }
        byEx[exId].sets.push({ set: s.set_number, weight_kg: s.weight_kg, reps: s.reps })
      })
      return {
        date: sess.date,
        duration_minutes: sess.duration_minutes,
        // Cap to last 10 sets per exercise
        exercises: Object.values(byEx).map(ex => ({ ...ex, sets: ex.sets.slice(-10) })),
      }
    })
  }

  // Today's scheduled plan day
  let todayDay: TodayDay | null = null
  if (planResult.data) {
    type PlanDayRow = { id: string; day_name: string; day_order: number; exercise_ids: unknown }
    const planData = planResult.data as { id: string; name: string; plan_days: PlanDayRow[] }
    const days = (planData.plan_days || []).sort((a, b) => a.day_order - b.day_order)
    const dow = new Date().getDay()
    const idx = dow === 0 ? days.length - 1 : Math.min(dow - 1, days.length - 1)
    const day = days[idx] ?? days[0]
    if (day) {
      const rawIds = Array.isArray(day.exercise_ids) ? day.exercise_ids : []
      const ids = (rawIds as Array<{ exerciseId?: string } | string>)
        .map(e => (typeof e === 'object' && e !== null ? (e as { exerciseId?: string }).exerciseId : e) as string)
        .filter(Boolean)
      let exerciseNames: string[] = []
      if (ids.length > 0) {
        const exRes = await supabase.from('exercises').select('name').in('id', ids)
        const exercises = exRes.data as Array<{ name: string }> | null
        exerciseNames = exercises?.map(e => e.name) ?? []
      }
      todayDay = { dayName: day.day_name, exercises: exerciseNames }
    }
  }

  const todayNutrition: TodayNutrition = {
    calories: Math.round((meals || []).reduce((s, m) => s + (m.calories || 0), 0)),
    protein: Math.round((meals || []).reduce((s, m) => s + (m.protein_g || 0), 0)),
    calorieTarget: profile?.daily_calorie_target ?? null,
    proteinTarget: profile?.daily_protein_target ?? null,
  }

  const context: AgentContext = { profile, recentSessions, weeklyVolume: filteredVolume, todayNutrition, todayDay }

  const tokens = estimateTokenCount(context)
  if (import.meta.env.DEV && tokens > 4000) {
    console.warn(`[KavaFit] Agent context is ~${tokens} tokens — approaching limit.`)
  }
  if (tokens > 6000) {
    context.recentSessions = recentSessions.slice(0, 3)
  }

  return context
}
