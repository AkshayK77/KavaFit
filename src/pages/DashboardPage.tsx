import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { getWeeklyVolume, VOLUME_THRESHOLDS } from '../lib/volumeTracker'
import { checkDeload, markDeloadSuggested } from '../lib/deloadDetector'
import { getWeekStart } from '../lib/workoutPlan'
import { callAgent, parseAgentJSON } from '../lib/geminiAgent'
import { maybeGenerateWeeklySummary } from '../lib/weeklySummary'
import MuscleHeatmap from '../components/MuscleHeatmap'
import type { Profile } from '../types/supabase'

interface Flag {
  severity: 'warning' | 'success' | 'info'
  message: string
}

interface VolumeRow {
  muscle_group: string
  total_sets: number | null
  updated_at: string | null
}

interface StreakResult {
  count: number
  isAmber: boolean
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function todayLabel() {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

function weekRangeLabel() {
  const start = getWeekStart()
  const startDate = new Date(start + 'T00:00:00')
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const startLabel = startDate.toLocaleDateString('en-GB', opts)
  const endLabel = endDate.toLocaleDateString('en-GB', opts)
  return `(${startLabel} - ${endLabel})`
}

function weekStartFor(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().split('T')[0]
}

async function computeStreak(userId: string, sessionsPerWeek: number): Promise<StreakResult> {
  type SessDateRow = { date: string }
  const { data: sessions } = await supabase
    .from('sessions')
    .select('date')
    .eq('user_id', userId)
    .not('completed_at', 'is', null)
    .order('date', { ascending: false })
    .limit(200)
  const sessionsTyped = sessions as SessDateRow[] | null

  if (!sessionsTyped || !sessionsTyped.length) return { count: 0, isAmber: false }

  const currentWeek = getWeekStart()
  const byWeek: Record<string, number> = {}
  sessionsTyped.forEach(s => {
    const wk = weekStartFor(s.date)
    byWeek[wk] = (byWeek[wk] || 0) + 1
  })

  const completedWeeks = Object.entries(byWeek)
    .filter(([wk]) => wk < currentWeek)
    .sort((a, b) => b[0].localeCompare(a[0]))

  let count = 0
  let isAmber = false
  let prevWeek: string | null = null
  const threshold75 = sessionsPerWeek * 0.75

  for (const [wk, weekCount] of completedWeeks) {
    if ((weekCount as number) < threshold75) break
    if (prevWeek !== null) {
      const gap = (new Date(prevWeek).getTime() - new Date(wk).getTime()) / 86400000
      if (gap !== 7) break
    }
    if ((weekCount as number) < sessionsPerWeek) isAmber = true
    count++
    prevWeek = wk
  }
  return { count, isAmber }
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { padding: '28px', width: '100%' },
  greetingRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' },
  greetingText: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '32px', letterSpacing: '0.04em' },
  greetingDate: { fontSize: '13px', color: 'var(--muted)', marginTop: '2px' },
  streakBadge: { display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '20px', padding: '5px 12px', fontSize: '12px', fontWeight: '600', color: 'var(--accent)' },
  streakBadgeAmber: { display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.5)', borderRadius: '20px', padding: '5px 12px', fontSize: '12px', fontWeight: '600', color: '#FBBF24' },
  streakStart: { fontSize: '12px', color: 'var(--dim)', fontStyle: 'italic', alignSelf: 'center' },
  sectionLabel: { fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '12px' },
  workoutCard: {
    background: 'linear-gradient(135deg, #0d1a00 0%, #111111 100%)',
    border: '1px solid rgba(200,245,90,0.18)',
    borderRadius: '14px', padding: '22px', marginBottom: '20px',
  },
  workoutTitle: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '22px', letterSpacing: '0.04em', marginBottom: '4px' },
  workoutMeta: { fontSize: '12px', color: 'var(--muted)', marginBottom: '14px' },
  workoutMuscles: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' },
  muscleChip: { fontSize: '10px', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid rgba(200,245,90,0.15)', borderRadius: '4px', padding: '3px 7px' },
  btnRow: { display: 'flex', gap: '10px' },
  btnOutline: { padding: '9px 18px', background: 'transparent', border: '1px solid var(--border2)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px', fontWeight: '500', cursor: 'pointer', transition: 'border-color 0.15s' },
  btnAccent: { padding: '9px 18px', background: 'var(--accent)', border: 'none', borderRadius: '8px', color: '#0a0a0a', fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'opacity 0.15s' },
  metricRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' },
  metricCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' },
  metricLabel: { fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '6px' },
  metricValue: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '28px', letterSpacing: '0.04em', marginBottom: '2px' },
  metricSub: { fontSize: '11px', color: 'var(--muted)', marginBottom: '10px' },
  progressBarTrack: { height: '4px', background: 'var(--surface3)', borderRadius: '2px', overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: '2px', transition: 'width 0.4s ease' },
  heatmapCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '20px' },
  flagsCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '20px' },
  flagItem: { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '9px 0', borderBottom: '1px solid var(--border)' },
  flagDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, marginTop: '4px' },
  flagMsg: { fontSize: '13px', color: 'var(--text)' },
}

// ─── component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  throw new Error('sentry test')
  const { user, heatmapRefreshKey } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const weekRange = weekRangeLabel()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [streak, setStreak] = useState<StreakResult>({ count: 0, isAmber: false })
  const [todayDay, setTodayDay] = useState<{ day_name: string; exercise_ids?: unknown } | null>(null)
  const [todayExercises, setTodayExercises] = useState<{ id: string; name: string; muscle_groups?: string[] }[]>([])
  const [nutrition, setNutrition] = useState({ protein: 0, calories: 0 })
  const [flags, setFlags] = useState<Flag[]>([])
  const [refreshingFlags, setRefreshingFlags] = useState(false)
  const [weeklySummary, setWeeklySummary] = useState<string | null>(null)
  const [weeklySummaryLoading, setWeeklySummaryLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [generatingWorkout, setGeneratingWorkout] = useState(false)

  useEffect(() => {
    if (user) loadDashboard()
  }, [user])

  useEffect(() => {
    if (!user) return
    setWeeklySummaryLoading(true)
    maybeGenerateWeeklySummary(user.id)
      .then(s => { if (s) setWeeklySummary(s) })
      .finally(() => setWeeklySummaryLoading(false))
  }, [user])

  async function loadDashboard() {
    setLoading(true)

    type ProfRow = Profile
    type PlanDayRow = { id: string; day_name: string; day_order: number; exercise_ids: unknown }
    type PlanRow = { id: string; name: string; created_at: string; plan_days: PlanDayRow[] }

    const profRes = await supabase.from('profiles').select('*').eq('id', user!.id).single()
    const prof = profRes.data as ProfRow | null
    setProfile(prof)

    const planRes = await supabase
      .from('workout_plans')
      .select('id, name, created_at, plan_days(id, day_name, day_order, exercise_ids)')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const planData = planRes.data as PlanRow | null

    const [streakVal, nutritionData, volumeRows, deloadData] = await Promise.all([
      computeStreak(user!.id, prof?.sessions_per_week || 3),
      loadNutrition(),
      getWeeklyVolume(user!.id),
      checkDeload(user!.id),
    ])

    setStreak(streakVal)
    setNutrition(nutritionData)

    // Today's workout day — find by matching local calendar date to plan day_order
    if (planData) {
      const days = (planData.plan_days || []).sort((a, b) => a.day_order - b.day_order)
      // Use local date from created_at (not UTC split, which is wrong for non-UTC timezones)
      const planStart = planData.created_at ? new Date(planData.created_at) : new Date()
      const planStartStr = `${planStart.getFullYear()}-${String(planStart.getMonth() + 1).padStart(2, '0')}-${String(planStart.getDate()).padStart(2, '0')}`
      const now = new Date()
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const day = days.find(d => {
        const dayDate = new Date(planStartStr + 'T00:00:00')
        dayDate.setDate(dayDate.getDate() + d.day_order - 1)
        const dayStr = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`
        return dayStr === todayStr
      }) ?? days[0]
      setTodayDay(day ?? null)

      // Normalize exercise_ids — supports both array format and { exercises, explanation } object format
      const rawEx = day?.exercise_ids as unknown
      const exArray: Array<Record<string, unknown>> = Array.isArray(rawEx)
        ? rawEx
        : (rawEx && typeof rawEx === 'object' && Array.isArray((rawEx as Record<string, unknown>).exercises))
          ? (rawEx as { exercises: Array<Record<string, unknown>> }).exercises
          : []

      const ids = exArray
        .map(e => (e as { exerciseId?: string }).exerciseId)
        .filter((id): id is string => Boolean(id))

      if (ids.length > 0) {
        type ExRow = { id: string; name: string; muscle_groups?: string[] }
        const exRes = await supabase.from('exercises').select('id, name, muscle_groups').in('id', ids)
        setTodayExercises((exRes.data as ExRow[] | null) || [])
      }
    }

    if (deloadData.deloadDue) {
      markDeloadSuggested(user!.id)
    }

    setLoading(false)
    loadAiFlags(user!.id, prof, streakVal, volumeRows, deloadData)
  }

  async function loadNutrition() {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)

    type MealRow = { protein_g: number | null; calories: number | null }
    const { data: meals } = await supabase
      .from('meal_history')
      .select('protein_g, calories')
      .eq('user_id', user!.id)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
    const mealsTyped = meals as MealRow[] | null

    const protein = (mealsTyped || []).reduce((sum, m) => sum + (m.protein_g || 0), 0)
    const calories = (mealsTyped || []).reduce((sum, m) => sum + (m.calories || 0), 0)
    return { protein, calories }
  }

  function getPrFlagsFromStorage(): Flag[] {
    try {
      const stored = localStorage.getItem('forge_new_prs')
      if (!stored) return []
      const { prs, timestamp } = JSON.parse(stored) as { prs: { name: string; newMax: number; reps?: number }[]; timestamp: number }
      if (Date.now() - timestamp >= 24 * 60 * 60 * 1000) return []
      return prs.map(pr => ({
        severity: 'success' as const,
        message: `New PR: ${pr.name} — ${pr.newMax}kg${pr.reps ? ' × ' + pr.reps + ' reps' : ''}`,
      }))
    } catch { return [] }
  }

  function buildLocalFlags(prof: Profile | null, streakVal: StreakResult, volumeRows: VolumeRow[], deloadData: { deloadDue: boolean; weeksCount: number }): Flag[] {
    const result: Flag[] = []
    const volumeMap: Record<string, VolumeRow> = {}
    volumeRows.forEach(r => { volumeMap[r.muscle_group] = r })

    Object.keys(VOLUME_THRESHOLDS).forEach(mg => {
      const row = volumeMap[mg]
      const sets = row?.total_sets || 0
      if (sets === 0) {
        result.push({ severity: 'warning', message: `Your ${mg.replace(/_/g, ' ')} hasn't been trained this week` })
      } else if (row?.updated_at) {
        const daysSince = (Date.now() - new Date(row.updated_at).getTime()) / 86400000
        if (daysSince > 8) {
          result.push({ severity: 'warning', message: `${mg.replace(/_/g, ' ')} hasn't been trained in ${Math.floor(daysSince)} days` })
        }
      }
    })
    if (streakVal.count >= 5) result.push({ severity: 'success', message: `You're on a ${streakVal.count}-week streak. Keep it up.` })
    if (deloadData.deloadDue) {
      result.push({ severity: 'warning', message: `You are on week ${deloadData.weeksCount} of progressive loading — consider a deload next week. Reduce all weights to 60% and volume by 40%.` })
    }
    return result
  }

  async function loadAiFlags(userId: string, prof: Profile | null, streakVal: StreakResult, volumeRows: VolumeRow[], deloadData: { deloadDue: boolean; weeksCount: number }, forceRefresh = false) {
    const prFlags = getPrFlagsFromStorage()
    const today = new Date().toISOString().split('T')[0]
    const cacheKey = `forge_flags_${userId}_${today}`

    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          const { flags: cachedFlags } = JSON.parse(cached) as { flags: Flag[] }
          if (Array.isArray(cachedFlags) && cachedFlags.length > 0) {
            setFlags([...prFlags, ...cachedFlags])
            return
          }
        }
      } catch { /* ignore corrupt cache */ }
    }

    try {
      const text = await callAgent(userId, '', 'flags')
      const parsed = parseAgentJSON(text)
      if (Array.isArray(parsed) && parsed.length > 0) {
        setFlags([...prFlags, ...(parsed as Flag[])])
        localStorage.setItem(cacheKey, JSON.stringify({ flags: parsed }))
        return
      }
    } catch { /* fall through to local */ }

    setFlags([...prFlags, ...buildLocalFlags(prof, streakVal, volumeRows, deloadData)])
  }

  async function handleRefreshInsights() {
    if (!user || refreshingFlags) return
    setRefreshingFlags(true)
    const today = new Date().toISOString().split('T')[0]
    localStorage.removeItem(`forge_flags_${user.id}_${today}`)
    await loadAiFlags(user.id, profile, streak, [], { deloadDue: false, weeksCount: 0 }, true)
    setRefreshingFlags(false)
  }

  const estDuration = todayExercises.length ? Math.round(todayExercises.length * 8) : 0

  const allMuscles = [...new Set(todayExercises.flatMap(e => e.muscle_groups || []))]

  const proteinTarget = profile?.daily_protein_target || 0
  const calorieTarget = profile?.daily_calorie_target || 0

  const SEVERITY_COLORS: Record<string, string> = { warning: '#ff5c5c', success: '#4ade80', info: '#60a5fa' }

  if (loading) {
    return (
      <div style={{ ...s.page, padding: '60px 28px 28px', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Loading dashboard…</p>
      </div>
    )
  }

  const firstName = profile?.full_name?.split(' ')[0] || 'Athlete'

  return (
    <div style={{ ...s.page, padding: isMobile ? '16px 16px 24px' : '28px' }}>
      {/* ── Greeting row ── */}
      <div style={s.greetingRow}>
        <div>
          <div style={s.greetingText}>{greeting()}, {firstName}</div>
          <div style={s.greetingDate}>{todayLabel()}</div>
        </div>
        {!isMobile && (
          <button
            onClick={() => navigate('/gyms')}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 14px', color: 'var(--muted)', fontSize: '12px', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
          >
            Find Gyms Near You
          </button>
        )}
        {streak.count > 0 ? (
          <div style={streak.isAmber ? s.streakBadgeAmber : s.streakBadge}>
            <span>{streak.isAmber ? '🔥' : '⚡'}</span>
            <span>{streak.count} week streak</span>
          </div>
        ) : (
          <div style={s.streakStart}>Start your streak</div>
        )}
      </div>
      {isMobile && (
        <button
          onClick={() => navigate('/gyms')}
          style={{ width: '100%', marginBottom: '20px', padding: '10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', fontSize: '13px', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}
        >
          Find Gyms Near You
        </button>
      )}

      {/* ── Today's workout card ── */}
      <div style={s.sectionLabel}>Today's workout</div>
      <div style={s.workoutCard}>
        {todayDay ? (
          <>
            <div style={s.workoutTitle}>{todayDay.day_name}</div>
            <div style={s.workoutMeta}>
              {todayExercises.length} exercises · ~{estDuration} min
            </div>
            {allMuscles.length > 0 && (
              <div style={s.workoutMuscles}>
                {allMuscles.slice(0, 6).map(m => (
                  <span key={m} style={s.muscleChip}>{m.replace(/_/g, ' ')}</span>
                ))}
              </div>
            )}
            <div style={s.btnRow}>
              <button
                style={s.btnOutline}
                onClick={() => navigate('/workout')}
                onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border2)'}
              >
                Start →
              </button>
              <button
                style={{ ...s.btnAccent, ...(generatingWorkout ? { opacity: 0.5, pointerEvents: 'none' } : {}) }}
                onClick={() => navigate('/workout')}
                onMouseOver={e => !generatingWorkout && (e.currentTarget.style.opacity = '0.85')}
                onMouseOut={e => e.currentTarget.style.opacity = '1'}
              >
                ✦ Generate new
              </button>
            </div>
          </>
        ) : (
          <div>
            <div style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '14px' }}>No plan loaded. Head to the workout page to generate one.</div>
            <button style={s.btnAccent} onClick={() => navigate('/workout')}>Go to Workout →</button>
          </div>
        )}
      </div>

      {/* ── Nutrition metrics ── */}
      <div style={s.sectionLabel}>Today's nutrition</div>
      <div style={s.metricRow}>
        {/* Protein */}
        <div style={s.metricCard}>
          <div style={s.metricLabel}>Protein today</div>
          <div style={s.metricValue}>
            {Math.round(nutrition.protein)}{proteinTarget > 0 ? ` / ${proteinTarget}` : ''}
            <span style={{ fontSize: '14px', fontWeight: '400', color: 'var(--muted)' }}>g</span>
          </div>
          {proteinTarget > 0 && (
            <>
              <div style={s.metricSub}>{Math.round((nutrition.protein / proteinTarget) * 100)}% of daily target</div>
              <div style={s.progressBarTrack}>
                <div style={{ ...s.progressBarFill, width: `${Math.min(nutrition.protein / proteinTarget, 1) * 100}%`, background: 'var(--accent)' }} />
              </div>
            </>
          )}
          {proteinTarget === 0 && <div style={s.metricSub}>Complete onboarding to set targets</div>}
        </div>

        {/* Calories */}
        <div style={s.metricCard}>
          <div style={s.metricLabel}>Calories today</div>
          <div style={s.metricValue}>
            {Math.round(nutrition.calories)}{calorieTarget > 0 ? ` / ${calorieTarget}` : ''}
            <span style={{ fontSize: '14px', fontWeight: '400', color: 'var(--muted)' }}>kcal</span>
          </div>
          {calorieTarget > 0 && (
            <>
              <div style={s.metricSub}>{Math.round((nutrition.calories / calorieTarget) * 100)}% of daily target</div>
              <div style={s.progressBarTrack}>
                <div style={{ ...s.progressBarFill, width: `${Math.min(nutrition.calories / calorieTarget, 1) * 100}%`, background: 'var(--amber)' }} />
              </div>
            </>
          )}
          {calorieTarget === 0 && <div style={s.metricSub}>Complete onboarding to set targets</div>}
        </div>
      </div>

      {/* ── Muscle heatmap ── */}
      <div style={s.sectionLabel}>Muscle volume this week {weekRange}</div>
      <div style={s.heatmapCard}>
        <MuscleHeatmap userId={user!.id} refreshKey={heatmapRefreshKey} />
      </div>

      {/* ── Agent flags ── */}
      {flags.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ ...s.sectionLabel, marginBottom: 0 }}>Insights</div>
            <button
              onClick={handleRefreshInsights}
              disabled={refreshingFlags}
              style={{ background: 'none', border: 'none', color: refreshingFlags ? 'var(--dim)' : 'var(--muted)', fontSize: '11px', cursor: refreshingFlags ? 'default' : 'pointer', padding: 0, fontFamily: 'inherit' }}
            >
              {refreshingFlags ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <div style={s.flagsCard}>
            {flags.map((flag, i) => (
              <div key={i} style={{ ...s.flagItem, ...(i === flags.length - 1 ? { borderBottom: 'none', paddingBottom: 0 } : {}) }}>
                <div style={{ ...s.flagDot, background: SEVERITY_COLORS[flag.severity] || '#555' }} />
                <div style={s.flagMsg}>{flag.message}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Weekly summary ── */}
      {(weeklySummary || weeklySummaryLoading) && (
        <>
          <div style={s.sectionLabel}>Last week's summary</div>
          {weeklySummaryLoading && !weeklySummary ? (
            <div style={{ ...s.flagsCard, borderLeft: '3px solid var(--accent)', paddingLeft: '18px' }}>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: 'var(--muted)', margin: 0, lineHeight: '1.75' }}>Generating your first weekly summary…</p>
            </div>
          ) : weeklySummary ? (
            <div style={{ ...s.flagsCard, borderLeft: '3px solid var(--accent)', paddingLeft: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ fontSize: '15px' }}>📅</span>
                <span style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>Weekly review</span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: '1.75', margin: 0 }}>{weeklySummary}</p>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
