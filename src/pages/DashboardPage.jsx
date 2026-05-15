import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { getWeeklyVolume, getVolumeStatus, VOLUME_THRESHOLDS } from '../lib/volumeTracker'
import { checkDeload, markDeloadSuggested } from '../lib/deloadDetector'
import { getWeekStart } from '../lib/workoutPlan'
import { callAgent, parseAgentJSON } from '../lib/geminiAgent'
import { maybeGenerateWeeklySummary } from '../lib/weeklySummary'
import MuscleHeatmap from '../components/MuscleHeatmap'

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
  const opts = { day: 'numeric', month: 'short' }
  const startLabel = startDate.toLocaleDateString('en-GB', opts)
  const endLabel = endDate.toLocaleDateString('en-GB', opts)
  return `(${startLabel} - ${endLabel})`
}

function weekStartFor(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z')
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().split('T')[0]
}

async function computeStreak(userId, sessionsPerWeek) {
  const { data: sessions } = await supabase
    .from('sessions')
    .select('date')
    .eq('user_id', userId)
    .not('completed_at', 'is', null)
    .order('date', { ascending: false })
    .limit(200)

  if (!sessions || !sessions.length) return { count: 0, isAmber: false }

  const currentWeek = getWeekStart()
  const byWeek = {}
  sessions.forEach(s => {
    const wk = weekStartFor(s.date)
    byWeek[wk] = (byWeek[wk] || 0) + 1
  })

  const completedWeeks = Object.entries(byWeek)
    .filter(([wk]) => wk < currentWeek)
    .sort((a, b) => b[0].localeCompare(a[0]))

  let count = 0
  let isAmber = false
  let prevWeek = null
  const threshold75 = sessionsPerWeek * 0.75

  for (const [wk, weekCount] of completedWeeks) {
    if (weekCount < threshold75) break
    if (prevWeek !== null) {
      const gap = (new Date(prevWeek) - new Date(wk)) / 86400000
      if (gap !== 7) break
    }
    if (weekCount < sessionsPerWeek) isAmber = true
    count++
    prevWeek = wk
  }
  return { count, isAmber }
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s = {
  page: { padding: '28px', width: '100%' },

  // Greeting row
  greetingRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' },
  greetingText: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '32px', letterSpacing: '0.04em' },
  greetingDate: { fontSize: '13px', color: 'var(--muted)', marginTop: '2px' },
  streakBadge: { display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '20px', padding: '5px 12px', fontSize: '12px', fontWeight: '600', color: 'var(--accent)' },
  streakBadgeAmber: { display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.5)', borderRadius: '20px', padding: '5px 12px', fontSize: '12px', fontWeight: '600', color: '#FBBF24' },
  streakStart: { fontSize: '12px', color: 'var(--dim)', fontStyle: 'italic', alignSelf: 'center' },

  sectionLabel: { fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '12px' },

  // Workout card
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

  // Metric cards
  metricRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' },
  metricCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' },
  metricLabel: { fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '6px' },
  metricValue: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '28px', letterSpacing: '0.04em', marginBottom: '2px' },
  metricSub: { fontSize: '11px', color: 'var(--muted)', marginBottom: '10px' },
  progressBarTrack: { height: '4px', background: 'var(--surface3)', borderRadius: '2px', overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: '2px', transition: 'width 0.4s ease' },

  // Heatmap card
  heatmapCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '20px' },

  // Flags
  flagsCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '20px' },
  flagItem: { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '9px 0', borderBottom: '1px solid var(--border)' },
  flagDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, marginTop: '4px' },
  flagMsg: { fontSize: '13px', color: 'var(--text)' },
}

// ─── component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const weekRange = weekRangeLabel()

  const [profile, setProfile] = useState(null)
  const [streak, setStreak] = useState({ count: 0, isAmber: false })
  const [todayDay, setTodayDay] = useState(null)
  const [todayExercises, setTodayExercises] = useState([])
  const [nutrition, setNutrition] = useState({ protein: 0, calories: 0 })
  const [flags, setFlags] = useState([])
  const [refreshingFlags, setRefreshingFlags] = useState(false)
  const [weeklySummary, setWeeklySummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generatingWorkout, setGeneratingWorkout] = useState(false)

  useEffect(() => {
    if (user) loadDashboard()
  }, [user])

  useEffect(() => {
    if (!user) return
    maybeGenerateWeeklySummary(user.id).then(s => { if (s) setWeeklySummary(s) })
  }, [user])

  async function loadDashboard() {
    setLoading(true)

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    setProfile(prof)

    const [streakVal, planData, nutritionData, volumeRows, deloadData] = await Promise.all([
      computeStreak(user.id, prof?.sessions_per_week || 3),
      supabase
        .from('workout_plans')
        .select('id, name, plan_days(id, day_name, day_order, exercise_ids)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      loadNutrition(),
      getWeeklyVolume(user.id),
      checkDeload(user.id),
    ])

    setStreak(streakVal)
    setNutrition(nutritionData)

    // Today's workout day
    if (planData.data) {
      const days = (planData.data.plan_days || []).sort((a, b) => a.day_order - b.day_order)
      const dow = new Date().getDay()
      const idx = dow === 0 ? days.length - 1 : Math.min(dow - 1, days.length - 1)
      const day = days[idx] ?? days[0]
      setTodayDay(day)

      if (day && day.exercise_ids?.length > 0) {
        const ids = day.exercise_ids.map(e => e.exerciseId || e).filter(Boolean)
        const { data: exes } = await supabase
          .from('exercises')
          .select('id, name, muscle_groups')
          .in('id', ids)
        setTodayExercises(exes || [])
      }
    }

    // Mark deload suggested if due
    if (deloadData.deloadDue) {
      markDeloadSuggested(user.id)
    }

    setLoading(false)

    // Load AI flags async after render (non-blocking)
    loadAiFlags(user.id, prof, streakVal, volumeRows, deloadData)
  }

  async function loadNutrition() {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)

    const { data: meals } = await supabase
      .from('meal_history')
      .select('protein_g, calories')
      .eq('user_id', user.id)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())

    const protein = (meals || []).reduce((sum, m) => sum + (m.protein_g || 0), 0)
    const calories = (meals || []).reduce((sum, m) => sum + (m.calories || 0), 0)
    return { protein, calories }
  }

  function getPrFlagsFromStorage() {
    try {
      const stored = localStorage.getItem('forge_new_prs')
      if (!stored) return []
      const { prs, timestamp } = JSON.parse(stored)
      if (Date.now() - timestamp >= 24 * 60 * 60 * 1000) return []
      return prs.map(pr => ({
        severity: 'success',
        message: `New PR: ${pr.name} — ${pr.newMax}kg${pr.reps ? ' × ' + pr.reps + ' reps' : ''}`,
      }))
    } catch { return [] }
  }

  function buildLocalFlags(prof, streakVal, volumeRows, deloadData) {
    const result = []
    const volumeMap = {}
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

  async function loadAiFlags(userId, prof, streakVal, volumeRows, deloadData, forceRefresh = false) {
    const prFlags = getPrFlagsFromStorage()
    const today = new Date().toISOString().split('T')[0]
    const cacheKey = `forge_flags_${userId}_${today}`

    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          const { flags: cachedFlags } = JSON.parse(cached)
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
        setFlags([...prFlags, ...parsed])
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
    await loadAiFlags(user.id, profile, streak.count, [], null, true)
    setRefreshingFlags(false)
  }

  const estDuration = todayExercises.length
    ? Math.round((todayDay?.exercise_ids?.length || todayExercises.length) * 3 * 2.5)
    : 0

  const allMuscles = [...new Set(todayExercises.flatMap(e => e.muscle_groups || []))]

  const proteinTarget = profile?.daily_protein_target || 0
  const calorieTarget = profile?.daily_calorie_target || 0

  const SEVERITY_COLORS = { warning: '#ff5c5c', success: '#4ade80', info: '#60a5fa' }

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
        {streak.count > 0 ? (
          <div style={streak.isAmber ? s.streakBadgeAmber : s.streakBadge}>
            <span>{streak.isAmber ? '🔥' : '⚡'}</span>
            <span>{streak.count} week streak</span>
          </div>
        ) : (
          <div style={s.streakStart}>Start your streak</div>
        )}
      </div>

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
        <MuscleHeatmap userId={user.id} />
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

      {/* ── Weekly summary (Mondays only) ── */}
      {weeklySummary && (
        <>
          <div style={s.sectionLabel}>Last week's summary</div>
          <div style={{ ...s.flagsCard, borderLeft: '3px solid var(--accent)', paddingLeft: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '15px' }}>📅</span>
              <span style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>Weekly review</span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: '1.75', margin: 0 }}>{weeklySummary}</p>
          </div>
        </>
      )}
    </div>
  )
}
