import { supabase } from './supabase'
import { getWeekStart } from './workoutPlan'

export const VOLUME_THRESHOLDS = {
  chest: { min: 10, max: 20 },
  shoulders: { min: 8, max: 16 },
  triceps: { min: 10, max: 14 },
  lats: { min: 12, max: 20 },
  mid_back: { min: 10, max: 16 },
  biceps: { min: 10, max: 14 },
  abs: { min: 8, max: 16 },
  quads: { min: 12, max: 20 },
  hamstrings: { min: 10, max: 16 },
  glutes: { min: 10, max: 16 },
  calves: { min: 10, max: 16 },
  forearms: { min: 6, max: 12 },
}

type VolumeThresholdKey = keyof typeof VOLUME_THRESHOLDS

function mapToVolumeGroup(mgRaw: unknown): string | null {
  if (!mgRaw) return null
  const mg = String(mgRaw).toLowerCase()
  if (mg in VOLUME_THRESHOLDS) return mg

  if (mg.startsWith('chest_')) return 'chest'
  if (mg.includes('delt') || mg.includes('rotator')) return 'shoulders'
  if (mg.startsWith('triceps_')) return 'triceps'
  if (mg === 'lats') return 'lats'
  if (mg.startsWith('mid_trap') || mg.startsWith('upper_trap') || mg.startsWith('lower_trap') || mg.startsWith('rhomboid') || mg.startsWith('erector') || mg.startsWith('teres')) return 'mid_back'
  if (mg.startsWith('biceps_') || mg.startsWith('brachialis')) return 'biceps'
  if (mg === 'core' || mg === 'abdominals' || mg === 'obliques' || mg === 'rectus_abdominis' || mg === 'transverse_abdominis' || mg === 'serratus' || mg.startsWith('abs_') || mg.startsWith('core_') || mg.startsWith('abdom')) return 'abs'
  if (mg.startsWith('quads_')) return 'quads'
  if (mg.startsWith('hamstrings_')) return 'hamstrings'
  if (mg.startsWith('glute_')) return 'glutes'
  if (mg.startsWith('gastrocnemius') || mg.startsWith('soleus')) return 'calves'
  if (mg.startsWith('forearm') || mg.startsWith('brachioradialis') || mg.startsWith('pronator') || mg.startsWith('supinator') || mg.startsWith('flexor') || mg.startsWith('extensor')) return 'forearms'

  return null
}

export function getVolumeStatus(muscleGroup: string, totalSets: number): string {
  const t = VOLUME_THRESHOLDS[muscleGroup as VolumeThresholdKey]
  if (!t) return 'none'
  if (totalSets === 0) return 'none'
  if (totalSets < t.min) return 'low'
  if (totalSets <= t.max) return 'optimal'
  return 'high'
}

// sets: array of objects with { muscle_groups: string[] }
function getWeekStartForDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

interface SetWithMuscles {
  muscle_groups?: string[]
}

interface VolumeRow {
  muscle_group: string
  total_sets: number
  updated_at: string | null
}

export async function updateVolumeLog(userId: string, sets: SetWithMuscles[], dateStr: string | null = null): Promise<void> {
  if (!sets || sets.length === 0) return

  const weekStart = dateStr ? getWeekStartForDate(dateStr) : getWeekStart()
  const counts: Record<string, number> = {}
  sets.forEach(set => {
    (set.muscle_groups || []).forEach(mg => {
      const mapped = mapToVolumeGroup(mg)
      if (!mapped) return
      counts[mapped] = (counts[mapped] || 0) + 1
    })
  })

  type ExistingRow = { total_sets: number | null } | null

  await Promise.all(
    Object.entries(counts).map(async ([mg, count]) => {
      const res = await supabase.from('muscle_volume_log').select('total_sets').eq('user_id', userId).eq('week_start', weekStart).eq('muscle_group', mg).maybeSingle()
      const existing = res.data as ExistingRow

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('muscle_volume_log') as any).upsert({
        user_id: userId,
        week_start: weekStart,
        muscle_group: mg,
        total_sets: (existing?.total_sets || 0) + count,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,week_start,muscle_group' })
    })
  )
}

export async function subtractVolumeLog(userId: string, sets: SetWithMuscles[], dateStr: string | null = null): Promise<void> {
  if (!sets || sets.length === 0) return
  const weekStart = dateStr ? getWeekStartForDate(dateStr) : getWeekStart()
  const counts: Record<string, number> = {}
  sets.forEach(set => {
    (set.muscle_groups || []).forEach(mg => {
      const mapped = mapToVolumeGroup(mg)
      if (!mapped) return
      counts[mapped] = (counts[mapped] || 0) + 1
    })
  })

  type ExistingRow = { total_sets: number | null } | null

  await Promise.all(
    Object.entries(counts).map(async ([mg, count]) => {
      const res = await supabase.from('muscle_volume_log').select('total_sets').eq('user_id', userId).eq('week_start', weekStart).eq('muscle_group', mg).maybeSingle()
      const existing = res.data as ExistingRow
      if (!existing) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('muscle_volume_log') as any).upsert({
        user_id: userId,
        week_start: weekStart,
        muscle_group: mg,
        total_sets: Math.max(0, (existing.total_sets || 0) - count),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,week_start,muscle_group' })
    })
  )
}

export async function setVolumeManual(userId: string, muscleGroup: string, totalSets: number): Promise<void> {
  const weekStart = getWeekStart()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from('muscle_volume_log') as any).upsert({
    user_id: userId,
    week_start: weekStart,
    muscle_group: muscleGroup,
    total_sets: Math.max(0, totalSets),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,week_start,muscle_group' })
}

export async function getWeeklyVolume(userId: string): Promise<VolumeRow[]> {
  const weekStart = getWeekStart()
  const res = await supabase.from('muscle_volume_log').select('muscle_group, total_sets, updated_at').eq('user_id', userId).eq('week_start', weekStart)
  const rows = (res.data as VolumeRow[] | null) || []
  const merged: Record<string, VolumeRow> = {}
  rows.forEach(r => {
    const mapped = mapToVolumeGroup(r.muscle_group)
    if (!mapped) return
    if (!merged[mapped]) {
      merged[mapped] = { muscle_group: mapped, total_sets: 0, updated_at: r.updated_at }
    }
    merged[mapped].total_sets += r.total_sets || 0
    if (r.updated_at && (!merged[mapped].updated_at || r.updated_at > merged[mapped].updated_at!)) {
      merged[mapped].updated_at = r.updated_at
    }
  })
  return Object.values(merged)
}
