import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useWorkout } from '../context/WorkoutContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { generateOneOffSession, generateSessionFromPreferences, generateWeeklyPlanByType, getWeekStart } from '../lib/workoutPlan'
import { updateVolumeLog } from '../lib/volumeTracker'
import { getProgressionSuggestion } from '../lib/progressiveOverload'
import { callAgent, parseAgentJSON } from '../lib/geminiAgent'
import { saveOfflineSet, saveOfflineSession, getOfflineSets, getOfflineSessions, clearOfflineSet, clearOfflineSession } from '../lib/offlineDb'
import { useToast } from '../components/Toast'
import { track } from '../lib/analytics'
import ManualWorkoutLogger from '../components/ManualWorkoutLogger'

interface SessionExercise {
  exercise: { id: string; name: string; muscle_groups?: string[] }
  sets: number
  repRange?: string
  note?: string | null
  targetRPE?: number
  notes?: string
  prevSets: Array<{ w: string | null; r: number | null }>
  currentSets: Array<{ reps: string | number; completed: boolean; weight?: string }>
  progressionHint?: { shouldIncrease?: boolean; reason?: string } | null
}
interface ActiveSession { id: string; name: string; planDayId?: string; explanation?: string | null }
interface CompletionData {
  durationMinutes: number; totalSets: number; totalExercises: number
  prs: Array<{ name: string; oldMax: number; newMax: number; reps?: number | null }>
}
interface WarmupExercise { exercise: string; sets: number | string; reps: number | string; notes?: string }
interface PlanDay { id: string; day_name: string; day_order: number; exercise_ids?: Array<Record<string, unknown>> | { exercises: Array<Record<string, unknown>>; explanation?: string | null } }

// ─── helpers ──────────────────────────────────────────────────────────────────

function normalizePlanDay(day: PlanDay): { exercises: Array<Record<string, unknown>>; explanation: string | null } {
  const raw = day.exercise_ids
  if (!raw) return { exercises: [], explanation: null }
  if (Array.isArray(raw)) return { exercises: raw, explanation: null }
  return { exercises: raw.exercises || [], explanation: raw.explanation || null }
}

function fmtTime(secs: number) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0')
  const s = String(secs % 60).padStart(2, '0')
  return `${m}:${s}`
}

function today() {
  return new Date().toISOString().split('T')[0]
}

const ACTIVE_SESSION_KEY = 'kavafit_active_session_v1'

// ─── weekly plan type options ─────────────────────────────────────────────────

const WEEKLY_PLAN_TYPES = [
  { id: 'ppl',      name: 'Push Pull Legs',     days: 6, structure: 'Push · Pull · Legs · Push · Pull · Legs · Rest' },
  { id: 'ppl_ul',   name: 'PPL + Upper Lower',  days: 5, structure: 'Push · Pull · Legs · Upper · Lower · Rest · Rest' },
  { id: 'bro',      name: 'Bro Split',           days: 6, structure: 'Chest · Back · Shoulders · Arms · Legs · Full Body · Rest' },
  { id: 'full_body',name: 'Full Body',           days: 4, structure: 'Full Body · Rest · Full Body · Rest · Full Body · Rest · Full Body' },
]

// ─── generation modal constants ───────────────────────────────────────────────

const SPLIT_OPTIONS = [
  { value: 'Push', subtitle: 'Chest · Shoulders · Triceps' },
  { value: 'Pull', subtitle: 'Back · Biceps' },
  { value: 'Legs', subtitle: 'Quads · Hamstrings · Glutes · Calves' },
  { value: 'Upper Body', subtitle: 'Chest · Back · Shoulders · Arms' },
  { value: 'Full Body', subtitle: 'All muscle groups' },
]

const MUSCLE_OPTIONS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves']

const FEELING_OPTIONS = [
  { value: 'fresh', label: 'Fresh', icon: '⚡', sub: 'At full capacity' },
  { value: 'normal', label: 'Normal', icon: '👌', sub: 'Ready to train' },
  { value: 'tired', label: 'Tired', icon: '😴', sub: 'Low energy day' },
]

// Maps chip names to DB muscle_group patterns
const CHIP_TO_PATTERN = {
  Chest: /^chest/,
  Back: /^lat|^rhomboid|^mid_trap|^lower_trap|^teres|^erector/,
  Shoulders: /delt|rotator/,
  Biceps: /^bicep|^brachial/,
  Triceps: /^tricep/,
  Quads: /^quad/,
  Hamstrings: /^hamstring/,
  Glutes: /^glute/,
  Calves: /^gastrocnemius|^soleus/,
}

const PUSH_RE = /^chest|^tricep|anterior_delt/
const PULL_RE = /^lat|^rhomboid|^mid_trap|^lower_trap|^teres|^erector|^bicep|^brachial/
const LEG_RE = /^quad|^hamstring|^glute|^gastrocnemius|^soleus/

function detectSessionType(muscleGroups: string[]) {
  let push = 0, pull = 0, legs = 0
  for (const m of muscleGroups) {
    const lm = m.toLowerCase()
    if (PUSH_RE.test(lm)) push++
    if (PULL_RE.test(lm)) pull++
    if (LEG_RE.test(lm)) legs++
  }
  const total = push + pull + legs
  if (total === 0) return 'mixed'
  if (legs / total >= 0.5) return 'Legs'
  if (push / total >= 0.5) return 'Push'
  if (pull / total >= 0.5) return 'Pull'
  return 'Upper Body'
}

function getNextSessionType(lastType: string) {
  return { Push: 'Pull', Pull: 'Legs', Legs: 'Push', 'Upper Body': 'Legs' }[lastType] ?? 'Full Body'
}

function getTimeLabel(minutes: number) {
  if (minutes <= 35) return 'Express session — 3-4 exercises'
  if (minutes <= 50) return 'Standard session — 5-6 exercises'
  if (minutes <= 70) return 'Full session — 6-8 exercises'
  return 'Extended session — 8-10 exercises'
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { padding: '28px', width: '100%' },
  title: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '28px', letterSpacing: '0.04em', marginBottom: '4px' },
  sub: { fontSize: '13px', color: 'var(--muted)', marginBottom: '24px' },

  // Mode A
  topCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '24px' },
  topCardTitle: { fontSize: '15px', fontWeight: '600', marginBottom: '6px' },
  topCardDesc: { fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' },
  btnRow: { display: 'flex', gap: '10px' },
  btnOutline: { padding: '9px 18px', background: 'transparent', border: '1px solid var(--border2)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px', fontWeight: '500', cursor: 'pointer', transition: 'border-color 0.15s' },
  btnAccent: { padding: '9px 18px', background: 'var(--accent)', border: 'none', borderRadius: '8px', color: '#0a0a0a', fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'opacity 0.15s' },
  btnDisabled: { opacity: 0.45, pointerEvents: 'none' },
  sectionLabel: { fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '12px' },
  dayGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' },
  dayCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' },
  dayCardActive: { borderColor: 'var(--accent)', background: 'var(--accent-dim)' },
  dayName: { fontSize: '13px', fontWeight: '600', marginBottom: '6px' },
  dayExList: { fontSize: '11px', color: 'var(--muted)', lineHeight: '1.7' },

  // Mode B header
  sessionHeader: { background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 },
  sessionName: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '20px', letterSpacing: '0.04em' },
  sessionMeta: { fontSize: '12px', color: 'var(--muted)', marginTop: '2px' },
  timer: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '32px', color: 'var(--accent)', letterSpacing: '0.04em' },
  timerGroup: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  pauseBtn: { padding: '4px 10px', background: 'var(--surface3)', border: '1px solid var(--border2)', borderRadius: '6px', color: 'var(--muted)', fontSize: '11px', fontWeight: '600', cursor: 'pointer', letterSpacing: '0.06em' },
  finishBtn: { padding: '9px 18px', background: 'transparent', border: '1px solid var(--red)', borderRadius: '8px', color: 'var(--red)', fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'background 0.15s' },

  // Rest timer bar
  restBar: { background: 'var(--surface2)', borderBottom: '1px solid var(--border)', padding: '10px 28px', display: 'flex', alignItems: 'center', gap: '16px', position: 'sticky', top: '52px', zIndex: 9 },
  restLabel: { fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)' },
  restSub: { fontSize: '11px', color: 'var(--dim)', marginTop: '1px' },
  restCount: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '28px', color: 'var(--amber)', letterSpacing: '0.04em', minWidth: '60px' },
  restBtnSm: { padding: '5px 10px', background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '12px', cursor: 'pointer' },

  // Exercise cards
  exerciseList: { padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '16px' },
  exCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', flexShrink: 0 },
  exHeader: { padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' },
  exName: { fontSize: '14px', fontWeight: '600' },
  exMuscles: { fontSize: '11px', color: 'var(--accent)', marginTop: '3px' },
  exPrevWeight: { fontSize: '12px', color: 'var(--accent)', textAlign: 'right' },
  exProgressionHint: { fontSize: '11px', color: 'var(--amber)', marginTop: '2px', textAlign: 'right' },
  setTableHead: { display: 'grid', gridTemplateColumns: '48px 1fr', gap: '6px', padding: '8px 16px', borderBottom: '1px solid var(--border)' },
  setColLabel: { fontSize: '10px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--dim)', textAlign: 'center' },
  setRow: { display: 'grid', gridTemplateColumns: '48px 1fr', gap: '6px', padding: '6px 16px', alignItems: 'center' },
  setRowDone: { background: 'rgba(200,245,90,0.04)' },
  setNum: { fontSize: '13px', color: 'var(--muted)', textAlign: 'center' },
  setPrev: { fontSize: '12px', color: 'var(--dim)', textAlign: 'center' },
  setInput: { padding: '6px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '13px', outline: 'none', width: '100%', textAlign: 'center', transition: 'border-color 0.15s' },
  setCheck: { width: '20px', height: '20px', accentColor: 'var(--accent)', cursor: 'pointer', margin: '0 auto', display: 'block' },
  addSetRow: { padding: '10px 16px', borderTop: '1px solid var(--border)' },
  addSetBtn: { background: 'none', border: 'none', color: 'var(--muted)', fontSize: '12px', cursor: 'pointer', padding: 0 },

  // Completion screen
  completionPage: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100%', padding: '40px', textAlign: 'center' },
  completionTitle: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '48px', letterSpacing: '0.04em', color: 'var(--accent)', marginBottom: '8px' },
  completionSub: { fontSize: '15px', color: 'var(--muted)', marginBottom: '32px' },
  statsRow: { display: 'flex', gap: '32px', marginBottom: '32px' },
  statBox: { textAlign: 'center' },
  statNum: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '36px', letterSpacing: '0.04em', color: 'var(--text)' },
  statLbl: { fontSize: '12px', color: 'var(--muted)', marginTop: '2px' },
  prList: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px', maxWidth: '360px', width: '100%', marginBottom: '24px' },
  prTitle: { fontSize: '12px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '12px' },
  prItem: { fontSize: '13px', color: 'var(--text)', display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' },
  redirectNote: { fontSize: '12px', color: 'var(--dim)' },

  // Generation modal
  modalOverlay: {
    position: 'fixed', inset: 0, zIndex: 50,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '20px',
  },
  modalCard: {
    background: 'var(--surface2)', border: '1px solid var(--border2)',
    borderRadius: '12px', padding: '28px',
    maxWidth: '480px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
  },
  modalHeading: {
    fontFamily: 'Bebas Neue, sans-serif', fontSize: '28px',
    color: 'var(--accent)', letterSpacing: '0.04em',
  },
  modalSubtitle: { fontSize: '13px', color: 'var(--muted)', marginTop: '4px', marginBottom: '0' },
  modalClose: {
    background: 'none', border: 'none', color: 'var(--muted)',
    fontSize: '18px', cursor: 'pointer', padding: '0 4px', lineHeight: 1,
  },
  modalDivider: { borderTop: '1px solid var(--border)', margin: '20px 0' },
  questionLabel: {
    fontSize: '12px', fontWeight: '700', letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--text)', marginBottom: '12px',
  },
  chipGrid: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  chipBase: {
    padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
    fontSize: '12px', fontWeight: '500', border: '1px solid',
    background: 'none', transition: 'all 0.12s', textAlign: 'center',
    position: 'relative',
  },
  chipSelected: { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#0a0a0a' },
  chipUnselected: { background: 'var(--surface3)', borderColor: 'var(--border)', color: 'var(--muted)' },
  feelingGrid: { display: 'flex', gap: '10px' },
  feelingCard: {
    flex: 1, padding: '14px 10px', borderRadius: '10px', cursor: 'pointer',
    border: '1px solid', background: 'none', transition: 'all 0.12s', textAlign: 'center',
  },

  // Offline banner
  offlineBanner: {
    background: 'rgba(251,191,36,0.1)', borderBottom: '1px solid rgba(251,191,36,0.3)',
    padding: '8px 28px', display: 'flex', alignItems: 'center', gap: '8px',
    fontSize: '12px', color: '#FBBF24', fontWeight: '500',
  },

  // Warm-up card
  warmupCard: {
    flexShrink: 0,
    background: 'rgba(245,166,35,0.06)',
    border: '1px solid rgba(245,166,35,0.3)',
    borderRadius: '10px',
    padding: '14px 16px',
  },
  warmupHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' },
  warmupLabel: { fontSize: '10px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--amber)' },
  warmupDismiss: { background: 'none', border: 'none', color: 'var(--dim)', fontSize: '13px', cursor: 'pointer', padding: '0 2px' },
  warmupItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0', borderBottom: '1px solid rgba(245,166,35,0.1)', fontSize: '12px' },
  warmupExName: { fontWeight: '500', color: 'var(--text)', flex: '0 0 auto' },
  warmupMeta: { color: 'var(--amber)', fontSize: '11px' },
  warmupNotes: { color: 'var(--dim)', fontSize: '11px', flex: 1 },
}

// ─── component ────────────────────────────────────────────────────────────────

export default function WorkoutPage() {
  const { user } = useAuth()
  const { workoutUpdate, setWorkoutUpdate, setActiveSessionExercises, triggerHeatmapRefresh } = useWorkout()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const isMobile = useIsMobile()

  // Mode A state
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null)
  const [planDays, setPlanDays] = useState<PlanDay[]>([])
  const [selectedDay, setSelectedDay] = useState<PlanDay | null>(null)
  const [completedDayIds, setCompletedDayIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [recentSessions, setRecentSessions] = useState<Array<{id: string; name?: string | null; date: string; duration_minutes?: number | null}>>([])
  const [editSessionId, setEditSessionId] = useState<string | null>(null)

  // Mode B state
  const [mode, setMode] = useState('A')
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [sessionExercises, setSessionExercises] = useState<SessionExercise[]>([])
  const [exerciseDone, setExerciseDone] = useState<Record<string, boolean>>({})

  // Warm-up
  const [warmup, setWarmup] = useState<WarmupExercise[] | null>(null)
  const [warmupDismissed, setWarmupDismissed] = useState(false)

  // Timers
  const [elapsed, setElapsed] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const startTimeRef = useRef<number | null>(null)
  const isPausedRef = useRef(false)
  const pausedTimeRef = useRef(0)
  const pauseStartRef = useRef<number | null>(null)
  const [restSeconds, setRestSeconds] = useState(0)
  const [restActive, setRestActive] = useState(false)

  // Completion
  const [completed, setCompleted] = useState(false)
  const [completionData, setCompletionData] = useState<CompletionData | null>(null)
  const [prOverlay, setPrOverlay] = useState<CompletionData['prs'] | null>(null)
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null)

  // Log workout modal
  const [showLogModal, setShowLogModal] = useState(false)

  // Generation modal
  const [showGenModal, setShowGenModal] = useState(false)
  const [modalInitLoading, setModalInitLoading] = useState(false)
  const [modalMuscleGroups, setModalMuscleGroups] = useState<string[]>([])
  const [modalMinutes, setModalMinutes] = useState(60)
  const [modalFeeling, setModalFeeling] = useState('normal')
  const [modalAutoSuggested, setModalAutoSuggested] = useState<string | null>(null)
  const [modalOverdueMuscles, setModalOverdueMuscles] = useState<string[]>([])
  const [modalSuggestionCleared, setModalSuggestionCleared] = useState(false)

  // Weekly plan modal
  const [showPlanTypeModal, setShowPlanTypeModal] = useState(false)
  const [generatingWeeklyPlan, setGeneratingWeeklyPlan] = useState(false)
  const [selectedPlanType, setSelectedPlanType] = useState<string | null>(null)
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null)

  // Offline
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  // ── data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (user) loadPlanData()
  }, [user])

  useEffect(() => {
    if (!user) return
    const restored = loadPersistedSession(user.id)
    if (!restored) return
    setMode('B')
    setActiveSession(restored.activeSession || null)
    setSessionExercises(restored.sessionExercises || [])
    setWarmup(restored.warmup || null)
    setWarmupDismissed(!!restored.warmupDismissed)
    setExerciseDone(restored.exerciseDone || {})
    setIsPaused(!!restored.isPaused)
    isPausedRef.current = !!restored.isPaused
    startTimeRef.current = restored.startTime || Date.now()
    pausedTimeRef.current = restored.pausedTime || 0
    pauseStartRef.current = restored.pauseStart || null
    const now = Date.now()
    const livePaused = isPausedRef.current && pauseStartRef.current ? now - pauseStartRef.current : 0
    const totalElapsed = Math.max(0, Math.floor((now - (startTimeRef.current ?? now) - pausedTimeRef.current - livePaused) / 1000))
    setElapsed(totalElapsed)
    setActiveSessionExercises(((restored.sessionExercises || []) as SessionExercise[]).map(ex => ex.exercise).filter(Boolean) as { name: string }[])
  }, [user])

  useEffect(() => {
    if (mode !== 'B' || !activeSession || sessionExercises.length === 0) return
    persistActiveSession()
  }, [mode, activeSession, sessionExercises, warmup, warmupDismissed, exerciseDone])

  useEffect(() => {
    if (!sessionExercises.length) return
    setExerciseDone((prev: Record<string, boolean>) => {
      const next: Record<string, boolean> = {}
      sessionExercises.forEach(ex => {
        if (prev[ex.exercise.id]) next[ex.exercise.id] = true
      })
      return next
    })
  }, [sessionExercises])

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
      syncOfflineSets()
    }
    function handleOffline() { setIsOnline(false) }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  async function syncOfflineSets() {
    try {
      const [sets, sessions] = await Promise.all([
        getOfflineSets<{ key: string; client_updated_at?: string } & Record<string, unknown>>(),
        getOfflineSessions<{ session_id: string } & Record<string, unknown>>(),
      ])
      for (const sess of sessions) {
        await (supabase.from('sessions') as any).upsert(sess)
        await clearOfflineSession(sess.session_id)
      }
      for (const set of sets) {
        const { key, client_updated_at, ...setData } = set

        // Conflict check: only upsert if local record is newer than the server row
        const setId = setData.id as string | undefined
        if (setId) {
          type ServerRow = { updated_at: string | null }
          const { data: existing } = await supabase
            .from('session_sets')
            .select('updated_at')
            .eq('id', setId)
            .maybeSingle()
          const serverRow = existing as ServerRow | null
          if (serverRow?.updated_at && client_updated_at) {
            const serverTime = new Date(serverRow.updated_at).getTime()
            const localTime = new Date(client_updated_at).getTime()
            if (serverTime >= localTime) {
              console.warn('[offline-sync] skipping set — server version is newer', setId)
              await clearOfflineSet(key)
              continue
            }
          }
        }

        await (supabase.from('session_sets') as any).upsert({ ...setData, client_updated_at })
        await clearOfflineSet(key)
      }
    } catch (syncErr) {
      const msg = syncErr instanceof Error ? syncErr.message : String(syncErr)
      if (/jwt expired|not authenticated|401/i.test(msg)) {
        showToast('Session expired — log back in. Your workout is saved locally.', 'warning')
      }
    }
  }

  async function loadPlanData() {
    setLoading(true)
    const weekStart = getWeekStart()
    const [{ data: prof }, { data: planDataRaw }, { data: completedSessionsRaw }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user!.id).single(),
      supabase
        .from('workout_plans')
        .select('id, name, created_at, plan_days(id, day_name, day_order, exercise_ids)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('sessions')
        .select('plan_day_id')
        .eq('user_id', user!.id)
        .gte('date', weekStart)
        .not('completed_at', 'is', null)
        .not('plan_day_id', 'is', null),
    ])
    type PlanDayRow = { id: string; day_name: string; day_order: number; exercise_ids: unknown }
    type PlanDataRow = { id: string; name: string; plan_days: PlanDayRow[] | null }
    type CompletedRow = { plan_day_id: string | null }
    const planData = planDataRaw as PlanDataRow | null
    const completedSessions = completedSessionsRaw as CompletedRow[] | null
    setProfile(prof as Record<string, unknown> | null)
    setCompletedDayIds(new Set((completedSessions || []).map(s => s.plan_day_id).filter(Boolean) as string[]))

    const { data: recentRaw } = await supabase
      .from('sessions')
      .select('id, name, date, duration_minutes')
      .eq('user_id', user!.id)
      .not('completed_at', 'is', null)
      .order('date', { ascending: false })
      .limit(5)
    type RecentRow = { id: string; name: string | null; date: string; duration_minutes: number | null }
    setRecentSessions((recentRaw as RecentRow[] | null) || [])

    if (planData) {
      // Treat plan as stale if all 7 days have passed (created more than 7 days ago)
      const planCreatedAt = (planData as unknown as { created_at?: string }).created_at
      if (planCreatedAt) {
        const expiryDate = new Date(planCreatedAt.split('T')[0] + 'T12:00:00')
        expiryDate.setDate(expiryDate.getDate() + 7)
        if (expiryDate.toISOString().split('T')[0] <= new Date().toISOString().split('T')[0]) {
          setLoading(false)
          return
        }
      }
      setPlan(planData as unknown as Record<string, unknown>)
      const days = (planData.plan_days || []).sort((a: PlanDayRow, b: PlanDayRow) => a.day_order - b.day_order)
      setPlanDays(days as unknown as PlanDay[])
      const dow = new Date().getDay()
      const idx = dow === 0 ? days.length - 1 : Math.min(dow - 1, days.length - 1)
      setSelectedDay((days[idx] ?? days[0]) as unknown as PlanDay)
    }
    setLoading(false)
  }

  // ── elapsed timer ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode !== 'B') return
    if (!startTimeRef.current) {
      startTimeRef.current = Date.now()
      isPausedRef.current = false
      pausedTimeRef.current = 0
      pauseStartRef.current = null
    }
    const id = setInterval(() => {
      if (!isPausedRef.current) {
        setElapsed(Math.floor((Date.now() - (startTimeRef.current ?? Date.now()) - pausedTimeRef.current) / 1000))
      }
    }, 1000)
    return () => clearInterval(id)
  }, [mode])

  function handlePauseToggle() {
    if (!isPausedRef.current) {
      isPausedRef.current = true
      pauseStartRef.current = Date.now()
      setIsPaused(true)
      persistActiveSession()
    } else {
      isPausedRef.current = false
      pausedTimeRef.current += Date.now() - (pauseStartRef.current ?? Date.now())
      pauseStartRef.current = null
      setIsPaused(false)
      persistActiveSession()
    }
  }

  function loadPersistedSession(userId: string) {
    try {
      const raw = localStorage.getItem(ACTIVE_SESSION_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || parsed.userId !== userId) return null
      return parsed
    } catch {
      return null
    }
  }

  function persistActiveSession() {
    if (!user || mode !== 'B' || !activeSession) return
    const payload = {
      userId: user.id,
      activeSession,
      sessionExercises,
      warmup,
      warmupDismissed,
      exerciseDone,
      startTime: startTimeRef.current,
      pausedTime: pausedTimeRef.current,
      isPaused: isPausedRef.current,
      pauseStart: pauseStartRef.current,
    }
    try {
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(payload))
    } catch {
      // Ignore storage errors
    }
  }

  function clearPersistedSession() {
    try {
      localStorage.removeItem(ACTIVE_SESSION_KEY)
    } catch {
      // Ignore storage errors
    }
  }

  function resetActiveSessionState() {
    startTimeRef.current = null
    isPausedRef.current = false
    pausedTimeRef.current = 0
    pauseStartRef.current = null
    setElapsed(0)
    setIsPaused(false)
    setExerciseDone({})
  }

  // ── rest timer ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!restActive || restSeconds <= 0) {
      if (restActive && restSeconds <= 0) setRestActive(false)
      return
    }
    const id = setInterval(() => setRestSeconds(s => s - 1), 1000)
    return () => clearInterval(id)
  }, [restActive, restSeconds])

  function startRest() {
    setRestSeconds(90)
    setRestActive(true)
  }

  // ── Workout update from AI drawer ─────────────────────────────────────────

  useEffect(() => {
    if (!workoutUpdate || mode !== 'B' || !activeSession) return
    applyWorkoutUpdate(workoutUpdate)
    setWorkoutUpdate(null)
  }, [workoutUpdate, mode, activeSession])

  async function applyWorkoutUpdate(update: Record<string, unknown>) {
    const exercises = update.exercises as Array<{ exerciseName?: string; sets: number; repRange?: string }> | undefined
    if (!exercises?.length) return
    const nameMap: Record<string, SessionExercise> = {}
    sessionExercises.forEach(ex => { nameMap[ex.exercise.name.toLowerCase()] = ex })

    const updated = []
    for (const cfg of exercises) {
      const key = (cfg.exerciseName ?? '').toLowerCase()
      const existing = key ? nameMap[key] : undefined
      if (existing) {
        updated.push({ ...existing, sets: cfg.sets, repRange: cfg.repRange })
      } else {
        const { data } = await supabase
          .from('exercises')
          .select('*')
          .ilike('name', `%${cfg.exerciseName}%`)
          .limit(1)
          .maybeSingle()
        if (data) {
          const exData = data as { id: string; name: string; muscle_groups?: string[] }
          const hint = await getProgressionSuggestion(user!.id, exData.id)
          updated.push({
            exercise: exData,
            sets: cfg.sets,
            repRange: cfg.repRange,
            prevSets: [],
            currentSets: Array.from({ length: cfg.sets }, () => ({ reps: '', completed: false })),
            progressionHint: hint,
          })
        }
      }
    }
    if (updated.length > 0) {
      setSessionExercises(updated as SessionExercise[])
      setActiveSessionExercises((updated as SessionExercise[]).map(ex => ex.exercise))
    }
  }

  // ── Warm-up generator ────────────────────────────────────────────────────

  async function generateWarmup(muscleGroups: string[]) {
    try {
      const muscleStr = muscleGroups.slice(0, 5).join(', ')
      const text = await callAgent(
        user!.id,
        `Generate a 5-exercise warm-up for a user about to train: ${muscleStr}`,
        'warmup'
      )
      const parsed = parseAgentJSON(text)
      if (Array.isArray(parsed)) setWarmup(parsed.slice(0, 5))
    } catch { /* silently skip */ }
  }

  // ── Mode A actions ────────────────────────────────────────────────────────

  async function handleLoadTemplate(dayOverride?: PlanDay | null) {
    const day = dayOverride ?? selectedDay
    if (!day) return
    type ExerciseCfg = { exerciseId?: string; sets?: number; repRange?: string; [k: string]: unknown }
    const { exercises: exerciseConfigs, explanation: dayExplanation } = normalizePlanDay(day)
    if (!exerciseConfigs.length) return

    const ids = exerciseConfigs.map(e => e.exerciseId ?? String(e)).filter(Boolean) as string[]
    const { data: exercisesRaw } = await supabase.from('exercises').select('*').in('id', ids)
    type ExRow = { id: string; name: string; muscle_groups?: string[] }
    const exercises = exercisesRaw as ExRow[] | null
    if (!exercises) return

    const prevSetsMap = await fetchPreviousSets(ids)

    const { data: sessRaw } = await (supabase.from('sessions') as any)
      .insert({ user_id: user!.id, plan_day_id: day.id, date: today() })
      .select()
      .single()
    const sess = sessRaw as { id: string } | null

    const sessionExs = exerciseConfigs
      .map((cfg: ExerciseCfg) => {
        const exId = cfg.exerciseId ?? String(cfg)
        const ex = exercises.find(e => e.id === exId)
        if (!ex) return null
        const prev = prevSetsMap[exId] || []
        const numSets = cfg.sets || 3
        return {
          exercise: ex,
          sets: numSets,
          repRange: cfg.repRange || '8-12',
          note: (cfg.note as string | null) || null,
          prevSets: prev,
          currentSets: Array.from({ length: numSets }, () => ({ reps: '', completed: false })),
          progressionHint: null,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    const hints = await Promise.all(
      sessionExs.map(ex => getProgressionSuggestion(user!.id, ex.exercise.id))
    )
    const sessionExsWithHints = sessionExs.map((ex, i) => ({ ...ex, progressionHint: hints[i] }))

    setActiveSession({ id: sess?.id ?? '', name: day.day_name, planDayId: day.id, explanation: dayExplanation })
    setSessionExercises(sessionExsWithHints as SessionExercise[])
    setActiveSessionExercises(sessionExsWithHints.map(ex => ex.exercise))
    setExerciseDone({})
    startTimeRef.current = Date.now()
    isPausedRef.current = false
    pausedTimeRef.current = 0
    pauseStartRef.current = null
    setElapsed(0)
    setIsPaused(false)
    setWarmup(null)
    setWarmupDismissed(false)
    setMode('B')
    track('workout_session_started', { source: 'template', exercise_count: sessionExsWithHints.length })
    persistActiveSession()
    const muscles = [...new Set(sessionExsWithHints.flatMap(ex => ex.exercise.muscle_groups ?? []))]
    generateWarmup(muscles)
  }

  async function handleGenerateWithAI() {
    if (!profile) return
    setShowGenModal(true)
    setModalInitLoading(true)
    setModalMuscleGroups([])
    setModalMinutes(60)
    setModalFeeling('normal')
    setModalAutoSuggested(null)
    setModalOverdueMuscles([])
    setModalSuggestionCleared(false)

    try {
      const fiveDaysAgo = new Date()
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)
      const fiveDaysAgoStr = fiveDaysAgo.toISOString().split('T')[0]

      const { data: recentSessionsRaw } = await supabase
        .from('sessions')
        .select('id, date')
        .eq('user_id', user!.id)
        .order('date', { ascending: false })
        .limit(5)
      type RecentSessRow = { id: string; date: string }
      const recentSessions = recentSessionsRaw as RecentSessRow[] | null

      let autoSelect = 'Full Body'
      let allRecentMuscles: string[] = []

      if ((recentSessions?.length ?? 0) > 0) {
        const sessionIds = (recentSessions ?? []).map(s => s.id)
        const [{ data: setsRaw }, { data: volRowsRaw }] = await Promise.all([
          supabase
            .from('session_sets')
            .select('session_id, exercise_id')
            .in('session_id', sessionIds)
            .eq('completed', true),
          supabase
            .from('muscle_volume_log')
            .select('muscle_group, total_sets')
            .eq('user_id', user!.id)
            .eq('week_start', getWeekStart()),
        ])

        type SetsRow = { session_id: string; exercise_id: string | null }
        type VolRow = { muscle_group: string | null; total_sets: number | null }
        type ExRow = { id: string; muscle_groups?: string[] | null }
        const sets = setsRaw as SetsRow[] | null
        const volRows = volRowsRaw as VolRow[] | null
        const exIds = [...new Set((sets || []).map(s => s.exercise_id).filter(Boolean) as string[])]
        let exMap: Record<string, string[]> = {}
        if (exIds.length > 0) {
          const { data: exsRaw } = await supabase
            .from('exercises')
            .select('id, muscle_groups')
            .in('id', exIds)
          const exs = exsRaw as ExRow[] | null
          exs?.forEach(e => { exMap[e.id] = (e.muscle_groups as string[]) || [] })
        }

        // Build per-session muscle groups
        const sessionMuscles: Record<string, string[]> = {}
        ;(recentSessions ?? []).forEach(sess => {
          const sessSets = (sets || []).filter(s => s.session_id === sess.id)
          sessionMuscles[sess.date] = [...new Set(sessSets.flatMap(s => exMap[s.exercise_id ?? ''] || []))]
        })

        // Auto-detect: use most recent session
        const mostRecentMuscles = Object.values(sessionMuscles)[0] || []
        const lastType = detectSessionType(mostRecentMuscles)
        autoSelect = getNextSessionType(lastType)

        // Overdue: muscles at 0 sets this week AND not trained in last 5 days
        const trainedThisWeek = new Set((volRows || []).map(r => r.muscle_group).filter(Boolean) as string[])
        const recentlyTrained = new Set(
          Object.entries(sessionMuscles)
            .filter(([date]) => date >= fiveDaysAgoStr)
            .flatMap(([, muscles]) => muscles)
        )
        allRecentMuscles = [...recentlyTrained]

        const overdue = MUSCLE_OPTIONS.filter(chip => {
          const pattern = (CHIP_TO_PATTERN as Record<string, RegExp>)[chip]
          if (!pattern) return false
          const trainedWeek = [...trainedThisWeek].some(m => pattern.test(m))
          const trainedRecent = allRecentMuscles.some(m => pattern.test(m))
          return !trainedWeek && !trainedRecent
        })
        setModalOverdueMuscles(overdue)
      }

      setModalAutoSuggested(autoSelect)
      setModalMuscleGroups([autoSelect])
    } catch (err) {
      console.error('Modal init failed:', err)
      setModalAutoSuggested('Full Body')
      setModalMuscleGroups(['Full Body'])
    } finally {
      setModalInitLoading(false)
    }
  }

  function toggleModalMuscleGroup(group: string) {
    setModalMuscleGroups(prev =>
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
    )
  }

  function handleClearSuggestion() {
    setModalSuggestionCleared(true)
    setModalMuscleGroups([])
  }

  async function handleGenerateFromModal() {
    setShowGenModal(false)
    setGenerating(true)
    try {
      const preferences = {
        muscleGroups: modalMuscleGroups,
        minutes: modalMinutes,
        feeling: modalFeeling,
      }
      const { session, exercises, sessionName, explanation } = await generateSessionFromPreferences(user!.id, profile as Parameters<typeof generateSessionFromPreferences>[1], preferences)
      const ids = exercises.map(e => e.exercise.id)
      const prevSetsMap = await fetchPreviousSets(ids)

      const sessionExs = exercises.map(({ exercise, sets, repRange, targetRPE, notes }) => {
        return {
          exercise,
          sets,
          repRange,
          targetRPE,
          note: notes || null,
          prevSets: prevSetsMap[exercise.id] || [],
          currentSets: Array.from({ length: sets }, () => ({ reps: '', completed: false })),
          progressionHint: null,
        }
      })

      const hints = await Promise.all(
        sessionExs.map(ex => getProgressionSuggestion(user!.id, ex.exercise.id))
      )
      const sessionExsWithHints = sessionExs.map((ex, i) => ({ ...ex, progressionHint: hints[i] }))

      setActiveSession({ id: session.id, name: sessionName, explanation })
      setSessionExercises(sessionExsWithHints as SessionExercise[])
      setActiveSessionExercises(sessionExsWithHints.map(ex => ex.exercise))
      setExerciseDone({})
      startTimeRef.current = Date.now()
      isPausedRef.current = false
      pausedTimeRef.current = 0
      pauseStartRef.current = null
      setElapsed(0)
      setIsPaused(false)
      setWarmup(null)
      setWarmupDismissed(false)
      setMode('B')
      track('workout_session_started', { source: 'ai_generated', exercise_count: sessionExsWithHints.length })
      persistActiveSession()
      const muscles = [...new Set(sessionExsWithHints.flatMap(ex => ex.exercise.muscle_groups || []))]
      generateWarmup(muscles)
    } catch (err) {
      console.error('AI generation failed:', err)
      showToast('Could not generate session. Check your Groq API key and try again.', 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function handleGenerateWeeklyPlan() {
    if (!selectedPlanType || !profile) return
    setGeneratingWeeklyPlan(true)
    try {
      await generateWeeklyPlanByType(user!.id, profile as Parameters<typeof generateWeeklyPlanByType>[1], selectedPlanType)
      setShowPlanTypeModal(false)
      setSelectedPlanType(null)
      await loadPlanData()
    } catch (err) {
      console.error('Weekly plan generation failed:', err)
      showToast('Could not generate plan. Check your Groq API key and try again.', 'error')
    } finally {
      setGeneratingWeeklyPlan(false)
    }
  }

  function handleRegenerateWeeklyPlan() {
    setSelectedPlanType(null)
    setExpandedDayId(null)
    setShowPlanTypeModal(true)
  }

  async function fetchPreviousSets(exerciseIds: string[]): Promise<Record<string, Array<{w: string | null; r: number | null}>>> {
    if (!exerciseIds.length) return {}
    const { data } = await supabase
      .from('session_sets')
      .select('exercise_id, weight_kg, reps, set_number, created_at')
      .in('exercise_id', exerciseIds)
      .eq('completed', true)
      .order('created_at', { ascending: false })

    type SetRow = { exercise_id: string | null; weight_kg: number | null; reps: number | null }
    const rows = data as SetRow[] | null
    const map: Record<string, Array<{w: string | null; r: number | null}>> = {}
    rows?.forEach(row => {
      const eid = String(row.exercise_id ?? '')
      if (!map[eid]) map[eid] = []
      if (map[eid].length < 5) map[eid].push({ w: row.weight_kg != null ? String(row.weight_kg) : null, r: row.reps })
    })
    return map
  }

  // ── Mode B actions ────────────────────────────────────────────────────────

  function updateSet(exIdx: number, setIdx: number, field: string, value: string) {
    setSessionExercises(prev => {
      const next = prev.map((ex, i) => {
        if (i !== exIdx) return ex
        const nextSets = ex.currentSets.map((s, j) => {
          if (j !== setIdx) return s
          if (field === 'reps') {
            const numeric = value === '' ? '' : Math.max(0, parseInt(value, 10) || 0)
            return { ...s, [field]: numeric }
          }
          return { ...s, [field]: value }
        })
        return { ...ex, currentSets: nextSets }
      })
      return next
    })
  }

  function addSet(exIdx: number) {
    setSessionExercises(prev => prev.map((ex, i) =>
      i !== exIdx ? ex : { ...ex, currentSets: [...ex.currentSets, { reps: '', completed: false }] }
    ))
  }

  async function handleFinishSession() {
    const endTime = new Date()
    const durationMinutes = Math.round(elapsed / 60)

    type FinishSet = { session_id: string; exercise_id: string; set_number: number; weight_kg: number | null; reps: number | null; completed: boolean }
    type PrEntry = { name: string; oldMax: number; newMax: number; reps: number | null }

    // Collect completed sets
    const allSets: FinishSet[] = []
    sessionExercises.forEach(ex => {
      ex.currentSets.forEach((set, idx) => {
        const hasReps = String(set.reps || '').trim() !== ''
        if (hasReps) {
          allSets.push({
            session_id: activeSession!.id,
            exercise_id: ex.exercise.id,
            set_number: idx + 1,
            weight_kg: parseFloat(set.weight ?? '') || null,
            reps: parseInt(String(set.reps)) || null,
            completed: true,
          })
        }
      })
    })

    if (!isOnline) {
      await saveOfflineSession({
        session_id: activeSession!.id,
        user_id: user!.id,
        completed_at: endTime.toISOString(),
        duration_minutes: durationMinutes,
      })
      for (const set of allSets) {
        await saveOfflineSet(set as Record<string, unknown>)
      }
      setActiveSessionExercises([])
      setWarmup(null)
      if (activeSession!.planDayId) {
        setCompletedDayIds(prev => new Set([...prev, activeSession!.planDayId as string]))
      }
      setCompletionData({ durationMinutes, totalSets: allSets.length, totalExercises: new Set(allSets.map(s => s.exercise_id)).size, prs: [] })
      setCompleted(true)
      setMode('A')
      clearPersistedSession()
      resetActiveSessionState()
      showToast('Session saved offline — will sync when reconnected', 'warning')
      setTimeout(() => navigate('/dashboard'), 3000)
      return
    }

    // Guard against expired session before writing — saves data locally instead of losing it
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) {
      for (const set of allSets) await saveOfflineSet(set as Record<string, unknown>)
      await saveOfflineSession({
        session_id: activeSession!.id,
        user_id: user!.id,
        completed_at: endTime.toISOString(),
        duration_minutes: durationMinutes,
      })
      showToast('Session expired — log back in. Your workout is saved locally.', 'warning')
      return
    }

    if (allSets.length > 0) {
      await (supabase.from('session_sets') as any).insert(allSets)
    }

    await (supabase.from('sessions') as any)
      .update({ completed_at: endTime.toISOString(), duration_minutes: durationMinutes })
      .eq('id', activeSession!.id)

    // PR detection
    type PrevSetRow = { exercise_id: string | null; weight_kg: number | null }
    const exerciseIds = sessionExercises.map(ex => ex.exercise.id)
    const { data: prevSetsRaw } = await supabase
      .from('session_sets')
      .select('exercise_id, weight_kg')
      .in('exercise_id', exerciseIds)
      .eq('completed', true)
      .neq('session_id', activeSession!.id)
    const prevSets = prevSetsRaw as PrevSetRow[] | null

    const prs: PrEntry[] = []
    sessionExercises.forEach(ex => {
      const doneSets = ex.currentSets.filter(s => String(s.reps || '').trim() !== '' && s.weight)
      if (!doneSets.length) return
      const bestSet = doneSets.reduce((best, s) =>
        (parseFloat(s.weight ?? '') || 0) > (parseFloat(best?.weight ?? '') || 0) ? s : best, doneSets[0])
      const currentMax = parseFloat(bestSet?.weight ?? '') || 0
      const prevForEx = (prevSets || []).filter(s => s.exercise_id === ex.exercise.id)
      const prevMax = prevForEx.length > 0 ? Math.max(...prevForEx.map(s => s.weight_kg ?? 0)) : 0
      if (currentMax > prevMax && currentMax > 0) {
        prs.push({ name: ex.exercise.name, oldMax: prevMax, newMax: currentMax, reps: bestSet?.reps != null ? parseInt(String(bestSet.reps)) || null : null })
      }
    })

    if (allSets.length > 0) {
      const completedSetsWithMuscles: Array<{ muscle_groups: string[] }> = []
      sessionExercises.forEach(ex => {
        ex.currentSets.forEach(set => {
          const hasReps = String(set.reps || '').trim() !== ''
          if (hasReps) {
            completedSetsWithMuscles.push({ muscle_groups: ex.exercise.muscle_groups || [] })
          }
        })
      })
      await updateVolumeLog(user!.id, completedSetsWithMuscles)
    }

    const totalSets = allSets.length
    const totalExercises = new Set(allSets.map(s => s.exercise_id)).size

    setActiveSessionExercises([])
    setWarmup(null)
    if (activeSession!.planDayId) {
      setCompletedDayIds(prev => new Set([...prev, activeSession!.planDayId as string]))
    }
    setCompletionData({ durationMinutes, totalSets, totalExercises, prs })
    setCompleted(true)
    setMode('A')
    clearPersistedSession()
    resetActiveSessionState()
    triggerHeatmapRefresh()
    track('workout_session_completed', { duration_minutes: durationMinutes, exercise_count: totalExercises, set_count: totalSets })
    showToast(prs.length > 0 ? `Session complete — ${prs.length} new PR${prs.length > 1 ? 's' : ''}!` : 'Session complete', 'success')

    if (prs.length > 0) {
      try {
        localStorage.setItem('kavafit_new_prs', JSON.stringify({ prs, timestamp: Date.now() }))
      } catch { /* ignore */ }
      setPrOverlay(prs)
      setTimeout(() => setPrOverlay(null), 2000)
      setTimeout(() => navigate('/dashboard'), 5000)
    } else {
      setTimeout(() => navigate('/dashboard'), 3000)
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  const logModal = showLogModal && (
    <ManualWorkoutLogger
      onClose={() => setShowLogModal(false)}
      onSaved={() => { setShowLogModal(false); loadPlanData() }}
    />
  )

  const editModal = editSessionId && (
    <ManualWorkoutLogger
      editSessionId={editSessionId}
      onClose={() => setEditSessionId(null)}
      onSaved={() => { setEditSessionId(null); loadPlanData() }}
    />
  )

  const planTypeModal = showPlanTypeModal && (
    <div style={s.modalOverlay} onClick={e => { if (e.target === e.currentTarget && !generatingWeeklyPlan) setShowPlanTypeModal(false) }}>
      <div style={s.modalCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={s.modalHeading}>Choose Your Split</div>
            <div style={s.modalSubtitle}>Select a training structure for this week</div>
          </div>
          {!generatingWeeklyPlan && (
            <button style={s.modalClose} onClick={() => setShowPlanTypeModal(false)}>×</button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
          {WEEKLY_PLAN_TYPES.map(pt => {
            const isSelected = selectedPlanType === pt.id
            return (
              <div
                key={pt.id}
                onClick={() => !generatingWeeklyPlan && setSelectedPlanType(pt.id)}
                style={{
                  padding: '14px 16px', borderRadius: '10px',
                  cursor: generatingWeeklyPlan ? 'default' : 'pointer',
                  border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                  background: isSelected ? 'rgba(200,245,90,0.06)' : 'var(--surface)',
                  transition: 'border-color 0.12s, background 0.12s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: isSelected ? 'var(--accent)' : 'var(--text)' }}>{pt.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: '700', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{pt.days} days/wk</div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{pt.structure}</div>
              </div>
            )
          })}
        </div>

        <button
          style={{ ...s.btnAccent, width: '100%', padding: '12px', fontSize: '14px', ...(!selectedPlanType || generatingWeeklyPlan ? s.btnDisabled : {}) }}
          onClick={handleGenerateWeeklyPlan}
        >
          {generatingWeeklyPlan ? 'Generating plan…' : 'Generate Plan'}
        </button>
      </div>
    </div>
  )

  const genModal = showGenModal && (
    <div style={s.modalOverlay}>
      <div style={s.modalCard}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={s.modalHeading}>Generate Session</div>
            <p style={s.modalSubtitle}>Tell us about today and we'll build the perfect session for you</p>
          </div>
          <button style={s.modalClose} onClick={() => setShowGenModal(false)}>✕</button>
        </div>

        {/* Q1 — Muscle groups */}
        <div>
          <div style={s.questionLabel}>What are you training today?</div>
          {modalInitLoading ? (
            <div style={{ fontSize: '12px', color: 'var(--dim)' }}>Detecting from recent history…</div>
          ) : (
            <>
              <div style={s.chipGrid}>
                {SPLIT_OPTIONS.map(opt => {
                  const sel = modalMuscleGroups.includes(opt.value)
                  return (
                    <button key={opt.value}
                      style={{ ...s.chipBase, ...(sel ? s.chipSelected : s.chipUnselected), minWidth: '90px' }}
                      onClick={() => toggleModalMuscleGroup(opt.value)}>
                      <div>{opt.value}</div>
                      <div style={{ fontSize: '10px', marginTop: '2px', opacity: 0.75 }}>{opt.subtitle}</div>
                    </button>
                  )
                })}
              </div>
              <div style={{ ...s.chipGrid, marginTop: '8px' }}>
                {MUSCLE_OPTIONS.map(m => {
                  const sel = modalMuscleGroups.includes(m)
                  const overdue = modalOverdueMuscles.includes(m)
                  return (
                    <button key={m}
                      style={{ ...s.chipBase, ...(sel ? s.chipSelected : s.chipUnselected) }}
                      onClick={() => toggleModalMuscleGroup(m)}>
                      {m}
                      {overdue && !sel && (
                        <span style={{
                          position: 'absolute', top: '-7px', right: '-4px',
                          background: 'var(--amber)', color: '#0a0a0a',
                          fontSize: '8px', fontWeight: '700', padding: '1px 4px', borderRadius: '4px',
                        }}>Overdue</span>
                      )}
                    </button>
                  )
                })}
              </div>
              {modalAutoSuggested && !modalSuggestionCleared && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    Suggested based on your recent training history
                  </span>
                  <button style={{ fontSize: '11px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    onClick={handleClearSuggestion}>Change</button>
                </div>
              )}
            </>
          )}
        </div>

        <div style={s.modalDivider} />

        {/* Q2 — Time */}
        <div>
          <div style={s.questionLabel}>How much time do you have?</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="number"
              min="20" max="120"
              value={modalMinutes}
              onChange={e => {
                const v = parseInt(e.target.value) || 20
                setModalMinutes(Math.min(120, Math.max(20, v)))
              }}
              style={{
                width: '72px', padding: '8px 10px',
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: '7px', color: 'var(--text)', fontSize: '14px',
                outline: 'none', textAlign: 'center', fontFamily: 'inherit',
              }}
            />
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>minutes</span>
          </div>
          <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--dim)' }}>
            {getTimeLabel(modalMinutes)}
          </div>
        </div>

        <div style={s.modalDivider} />

        {/* Q3 — Feeling */}
        <div>
          <div style={s.questionLabel}>How are you feeling today?</div>
          <div style={s.feelingGrid}>
            {FEELING_OPTIONS.map(f => {
              const sel = modalFeeling === f.value
              return (
                <button key={f.value}
                  style={{ ...s.feelingCard, ...(sel ? s.chipSelected : s.chipUnselected) }}
                  onClick={() => setModalFeeling(f.value)}>
                  <div style={{ fontSize: '22px', marginBottom: '4px' }}>{f.icon}</div>
                  <div style={{ fontSize: '13px', fontWeight: '600' }}>{f.label}</div>
                  <div style={{ fontSize: '11px', marginTop: '2px', opacity: 0.75 }}>{f.sub}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '24px', flexWrap: 'wrap' }}>
          <button
            style={{
              flex: 1, minWidth: '120px', padding: '10px 16px',
              background: 'transparent', border: '1px solid var(--border2)',
              borderRadius: '8px', color: 'var(--muted)', fontSize: '13px', cursor: 'pointer',
            }}
            onClick={() => setShowGenModal(false)}>
            Cancel
          </button>
          <button
            style={{
              flex: 1, minWidth: '120px', padding: '10px 16px',
              background: 'var(--accent)', border: 'none',
              borderRadius: '8px', color: '#0a0a0a', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
              ...(modalMuscleGroups.length === 0 || modalInitLoading ? { opacity: 0.45, pointerEvents: 'none' } : {}),
            }}
            onClick={handleGenerateFromModal}>
            Generate session →
          </button>
        </div>
      </div>
    </div>
  )

  if (prOverlay) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(10,10,10,0.97)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '20px',
      }}>
        <svg width="52" height="52" viewBox="0 0 32 32" fill="none">
          <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" stroke="#C8F55A" strokeWidth="1.5" fill="none" />
          <circle cx="16" cy="16" r="2.5" fill="#C8F55A" />
        </svg>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '34px', letterSpacing: '0.06em', color: 'var(--accent)', textAlign: 'center' }}>
          New Personal Record 🎉
        </div>
        {prOverlay.map((pr, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '15px', color: 'var(--muted)', marginBottom: '6px' }}>{pr.name}</div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '52px', color: 'var(--text)', letterSpacing: '0.04em', lineHeight: 1 }}>
              {pr.newMax}kg{pr.reps ? ` × ${pr.reps}` : ''}
            </div>
            {pr.oldMax > 0 && (
              <div style={{ fontSize: '13px', color: 'var(--dim)', marginTop: '4px' }}>Previous best: {pr.oldMax}kg</div>
            )}
          </div>
        ))}
      </div>
    )
  }

  if (completed && completionData) {
    return (
      <>
        {logModal}
        {editModal}
        {genModal}
        {planTypeModal}
        <div style={s.completionPage}>
          <div style={s.completionTitle}>Session Complete 🎉</div>
          <p style={s.completionSub}>Great work. Your data has been saved.</p>
          <div style={s.statsRow}>
            <div style={s.statBox}>
              <div style={s.statNum}>{completionData.durationMinutes}</div>
              <div style={s.statLbl}>Minutes</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statNum}>{completionData.totalExercises}</div>
              <div style={s.statLbl}>Exercises</div>
            </div>
            <div style={s.statBox}>
              <div style={s.statNum}>{completionData.totalSets}</div>
              <div style={s.statLbl}>Sets</div>
            </div>
          </div>

          {completionData.prs.length > 0 && (
            <div style={s.prList}>
              <div style={s.prTitle}>🏆 New Personal Records</div>
              {completionData.prs.map(pr => (
                <div key={pr.name} style={s.prItem}>
                  <span>{pr.name}</span>
                  <span style={{ color: 'var(--amber)' }}>
                    {pr.oldMax > 0 ? `${pr.oldMax}kg → ` : ''}{pr.newMax}kg
                  </span>
                </div>
              ))}
            </div>
          )}

          <p style={s.redirectNote}>Redirecting to dashboard…</p>
        </div>
      </>
    )
  }

  if (mode === 'B') {
    return (
      <>
        {logModal}
        {editModal}
        {genModal}
        {planTypeModal}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Session header */}
          <div style={{ ...s.sessionHeader, padding: isMobile ? '12px 16px' : '14px 28px' }}>
            <div>
              <div style={s.sessionName}>{activeSession?.name}</div>
              <div style={s.sessionMeta}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
            </div>
            <div style={s.timerGroup}>
              <div style={{ ...s.timer, ...(isPaused ? { color: 'var(--muted)' } : {}) }}>{fmtTime(elapsed)}</div>
              <button style={s.pauseBtn} onClick={handlePauseToggle}>
                {isPaused ? 'RESUME' : 'PAUSE'}
              </button>
            </div>
            <button
              style={s.finishBtn}
              onClick={handleFinishSession}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(255,92,92,0.12)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              Finish Session
            </button>
          </div>

          {/* Offline banner */}
          {!isOnline && (
            <div style={s.offlineBanner}>
              <span>⚠</span>
              <span>You're offline — sets will be saved locally and synced when reconnected</span>
            </div>
          )}

          {/* Rest timer bar */}
          {restActive && (
            <div style={s.restBar}>
              <div>
                <div style={s.restLabel}>Rest</div>
                <div style={s.restSub}>Auto-started after last set</div>
              </div>
              <div style={s.restCount}>{fmtTime(restSeconds)}</div>
              <button style={s.restBtnSm} onClick={() => setRestSeconds(s => s + 30)}>+30s</button>
              <button style={s.restBtnSm} onClick={() => { setRestActive(false); setRestSeconds(0) }}>Skip</button>
            </div>
          )}

          {/* Exercise cards */}
          <div style={{ ...s.exerciseList, flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '20px 28px' }}>
            {activeSession?.explanation && (
              <div style={{
                flexShrink: 0,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '10px', padding: '12px 14px',
              }}>
                <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '5px' }}>Why this workout?</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.55' }}>{activeSession.explanation}</div>
              </div>
            )}
            {warmup && !warmupDismissed && (
              <div style={s.warmupCard}>
                <div style={s.warmupHeader}>
                  <span style={s.warmupLabel}>Warm-up</span>
                  <button style={s.warmupDismiss} onClick={() => setWarmupDismissed(true)}>✕</button>
                </div>
                {warmup.map((ex, i) => (
                  <div key={i} style={{ ...s.warmupItem, ...(i === warmup.length - 1 ? { borderBottom: 'none' } : {}) }}>
                    <span style={s.warmupExName}>{ex.exercise}</span>
                    <span style={s.warmupMeta}>{ex.sets}×{ex.reps}</span>
                    {ex.notes && <span style={s.warmupNotes}>{ex.notes}</span>}
                  </div>
                ))}
              </div>
            )}
            {sessionExercises.map((ex, exIdx) => {
              const prevMax = ex.prevSets.length > 0 ? Math.max(...ex.prevSets.map(s => parseFloat(s.w ?? '') || 0)) : null
              const hint = ex.progressionHint?.shouldIncrease ? ex.progressionHint.reason : null
              const allSetsDone = ex.currentSets.every(s => s.completed)
              const isExerciseDone = exerciseDone[ex.exercise.id] ?? allSetsDone
              const recommendedSets = ex.sets || ex.currentSets.length

              return (
                <div key={ex.exercise.id} style={s.exCard}>
                  <div style={s.exHeader}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.exName}>{ex.exercise.name}</div>
                      <div style={s.exMuscles}>
                        {(ex.exercise.muscle_groups || []).slice(0, 3).map(m => m.replace(/_/g, ' ')).join(' · ')}
                      </div>
                      {ex.note && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', marginTop: '5px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--amber)', flexShrink: 0, lineHeight: '16px' }}>⚠</span>
                          <span style={{ fontSize: '11px', color: 'var(--amber)', lineHeight: '16px' }}>{ex.note}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Rep range: {ex.repRange || '—'}</span>
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Recommended sets: {recommendedSets}</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={isExerciseDone}
                            onChange={() => {
                              setExerciseDone(prev => ({ ...prev, [ex.exercise.id]: !isExerciseDone }))
                            }}
                            style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                          />
                          Done
                        </label>
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, marginLeft: '12px', textAlign: 'right' }}>
                      {prevMax ? <div style={s.exPrevWeight}>Prev best: {prevMax}kg</div> : null}
                      {hint ? <div style={s.exProgressionHint}>{hint}</div> : null}
                    </div>
                  </div>

                  {/* Column headers */}
                  <div style={s.setTableHead}>
                    {['SET', 'REPS'].map(col => (
                      <div key={col} style={s.setColLabel}>{col}</div>
                    ))}
                  </div>

                  {/* Set rows */}
                  {ex.currentSets.map((set, setIdx) => {
                    return (
                      <div key={setIdx} style={s.setRow}>
                        <div style={s.setNum}>{setIdx + 1}</div>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="0"
                          value={set.reps}
                          onChange={e => updateSet(exIdx, setIdx, 'reps', e.target.value)}
                          style={s.setInput}
                          onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                        />
                      </div>
                    )
                  })}

                  <div style={s.addSetRow}>
                    <button style={s.addSetBtn} onClick={() => addSet(exIdx)}>+ Add set</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </>
    )
  }

  // Mode A
  return (
    <>
      {logModal}
      {editModal}
      {genModal}
      {planTypeModal}
      <div style={{ ...s.page, padding: isMobile ? '16px 16px 24px' : '28px' }}>
        <h1 style={s.title}>Workout</h1>
        <p style={s.sub}>Select a session template or generate a fresh one with AI.</p>

        <div style={s.topCard}>
          <div style={s.topCardTitle}>Workout Plan</div>
          <div style={s.topCardDesc}>
            Load your scheduled session or generate a fresh one with AI.
          </div>
          <div style={s.btnRow}>
            <button
              style={s.btnOutline}
              onClick={() => setShowLogModal(true)}
              onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border2)'}
            >
              Log workout
            </button>
            <button
              style={{ ...s.btnAccent, ...(generating ? s.btnDisabled : {}) }}
              onClick={handleGenerateWithAI}
              onMouseOver={e => !generating && (e.currentTarget.style.opacity = '0.85')}
              onMouseOut={e => e.currentTarget.style.opacity = '1'}
            >
              {generating ? 'Generating…' : 'Generate with AI'}
            </button>
          </div>
        </div>

        {loading ? (
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Loading plan…</p>
        ) : !plan ? (
          <div style={{ ...s.topCard, textAlign: 'center', padding: '32px' }}>
            <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '20px' }}>
              {profile?.fitness_goal && profile?.experience_level && profile?.equipment_available
                ? 'No weekly plan for this week yet.'
                : 'No workout plan yet. Complete your profile in Settings first.'}
            </p>
            {!!(profile?.fitness_goal && profile?.experience_level && profile?.equipment_available) && (
              <button
                style={s.btnAccent}
                onClick={() => { setSelectedPlanType(null); setShowPlanTypeModal(true) }}
              >
                Generate Weekly Plan
              </button>
            )}
          </div>
        ) : planDays.length === 7 ? (
          <>
            {/* 7-day weekly plan view */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <div style={s.sectionLabel}>{plan.name as string}</div>
                {!!profile?.sessions_per_week && (
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '3px' }}>
                    Based on your preference of <span style={{ color: 'var(--accent)', fontWeight: '600' }}>{profile.sessions_per_week as number} workout{(profile.sessions_per_week as number) !== 1 ? 's' : ''}</span> per week
                  </div>
                )}
              </div>
              <button
                style={{ ...s.btnOutline, fontSize: '12px', padding: '6px 12px' }}
                onClick={handleRegenerateWeeklyPlan}
                onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border2)'}
              >
                Regenerate Plan
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {planDays.map(day => {
                const { exercises: exConfigs, explanation: dayExplanation } = normalizePlanDay(day)
                const isRest = exConfigs.length === 0
                const isDone = completedDayIds.has(day.id)
                const isExpanded = expandedDayId === day.id

                // Compute the actual calendar date using local timezone (not UTC split)
                const _createdAt = (plan as Record<string, unknown>).created_at as string | undefined
                const _planStart = _createdAt ? new Date(_createdAt) : new Date()
                const planStartStr = `${_planStart.getFullYear()}-${String(_planStart.getMonth() + 1).padStart(2, '0')}-${String(_planStart.getDate()).padStart(2, '0')}`
                const weekStartDate = new Date(planStartStr + 'T00:00:00')
                weekStartDate.setDate(weekStartDate.getDate() + day.day_order - 1)
                const _now = new Date()
                const todayStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`
                const dayDateStr = `${weekStartDate.getFullYear()}-${String(weekStartDate.getMonth() + 1).padStart(2, '0')}-${String(weekStartDate.getDate()).padStart(2, '0')}`
                const isToday = dayDateStr === todayStr
                const isPast = dayDateStr < todayStr
                const dateLabel = weekStartDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                const dayShort = DAY_SHORT[weekStartDate.getDay()]

                return (
                  <div
                    key={day.id}
                    style={{
                      background: isToday ? 'rgba(200,245,90,0.04)' : 'var(--surface)',
                      border: `1px solid ${isToday ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: '10px',
                      overflow: 'hidden',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    {/* Row header — always visible */}
                    <div
                      onClick={() => !isRest && setExpandedDayId(isExpanded ? null : day.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '12px 14px',
                        cursor: isRest ? 'default' : 'pointer',
                      }}
                    >
                      {/* Date pill */}
                      <div style={{
                        minWidth: '44px', textAlign: 'center', flexShrink: 0,
                      }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: isToday ? 'var(--accent)' : 'var(--dim)' }}>{dayShort}</div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: isToday ? 'var(--accent)' : 'var(--text)', lineHeight: 1.2 }}>{dateLabel}</div>
                      </div>

                      {/* Session info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: isRest ? 'var(--dim)' : 'var(--text)', marginBottom: '2px' }}>
                          {day.day_name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                          {isRest ? 'Rest' : `${exConfigs.length} exercise${exConfigs.length !== 1 ? 's' : ''}`}
                        </div>
                      </div>

                      {/* Right side: done badge, missed badge, or chevron */}
                      {isDone ? (
                        <div style={{
                          width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                          background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '10px', fontWeight: '700', color: '#0a0a0a',
                        }}>✓</div>
                      ) : isPast && !isRest ? (
                        <div style={{
                          width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                          background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.5)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '10px', fontWeight: '700', color: '#FBBF24',
                        }}>!</div>
                      ) : !isRest ? (
                        <div style={{ color: 'var(--dim)', fontSize: '14px', flexShrink: 0, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▾</div>
                      ) : null}
                    </div>

                    {/* Expanded exercise list */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px 14px' }}>
                        {dayExplanation && (
                          <div style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '4px' }}>Why this workout?</div>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.55' }}>{dayExplanation}</div>
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                          {exConfigs.map((ex, i) => {
                            const exName = (ex.exerciseName as string) || `Exercise ${i + 1}`
                            const sets = ex.sets as number | undefined
                            const repRange = ex.repRange as string | undefined
                            const note = ex.note as string | null | undefined
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'var(--dim)', flexShrink: 0, marginTop: '1px' }}>{i + 1}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text)' }}>{exName}</span>
                                    <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0 }}>{sets ? `${sets} × ` : ''}{repRange || ''}</span>
                                  </div>
                                  {note && <div style={{ fontSize: '10px', color: 'var(--amber)', marginTop: '2px' }}>{note}</div>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        <button
                          style={{
                            width: '100%', padding: '8px 0',
                            background: isDone ? 'var(--surface3)' : 'var(--accent)',
                            border: isDone ? '1px solid var(--border2)' : 'none',
                            borderRadius: '7px',
                            color: isDone ? 'var(--muted)' : '#0a0a0a',
                            fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                          }}
                          onClick={() => handleLoadTemplate(day)}
                        >
                          {isDone ? 'Redo session →' : 'Start session →'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <>
            {/* Legacy plan view (onboarding-generated plans with < 7 days) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <div style={s.sectionLabel}>This week's plan — {plan.name as string}</div>
                {!!profile?.sessions_per_week && (
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '3px' }}>
                    Based on your preference of <span style={{ color: 'var(--accent)', fontWeight: '600' }}>{profile.sessions_per_week as number} workout{(profile.sessions_per_week as number) !== 1 ? 's' : ''}</span> per week
                  </div>
                )}
              </div>
              <button
                style={{ ...s.btnOutline, fontSize: '12px', padding: '6px 12px' }}
                onClick={handleRegenerateWeeklyPlan}
                onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border2)'}
              >
                Regenerate Plan
              </button>
            </div>
            <div style={s.dayGrid}>
              {planDays.map((day) => {
                const _createdAt2 = (plan as Record<string, unknown>).created_at as string | undefined
                const _planStart2 = _createdAt2 ? new Date(_createdAt2) : new Date()
                const planStartStr = `${_planStart2.getFullYear()}-${String(_planStart2.getMonth() + 1).padStart(2, '0')}-${String(_planStart2.getDate()).padStart(2, '0')}`
                const dayDate = new Date(planStartStr + 'T00:00:00')
                dayDate.setDate(dayDate.getDate() + day.day_order - 1)
                const _now = new Date()
                const todayStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`
                const dayDateStr = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`
                const isToday = dayDateStr === todayStr
                const isPast = dayDateStr < todayStr
                const isSelected = selectedDay?.id === day.id
                const isDone = completedDayIds.has(day.id)
                const { exercises: exConfigs } = normalizePlanDay(day)
                return (
                  <div
                    key={day.id}
                    style={{
                      ...s.dayCard,
                      ...(isSelected ? s.dayCardActive : {}),
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                    onClick={() => setSelectedDay(day)}
                  >
                    {isDone ? (
                      <div style={{
                        position: 'absolute', top: '10px', right: '10px',
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', fontWeight: '700', color: '#0a0a0a',
                      }}>✓</div>
                    ) : isPast && exConfigs.length > 0 ? (
                      <div style={{
                        position: 'absolute', top: '10px', right: '10px',
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', fontWeight: '700', color: '#FBBF24',
                      }}>!</div>
                    ) : null}
                    <div style={s.dayName}>
                      {isToday && <span style={{ color: 'var(--accent)', marginRight: '6px', fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase' }}>TODAY · </span>}
                      {day.day_name}
                    </div>
                    <div style={s.dayExList}>
                      {exConfigs.length > 0
                        ? `${exConfigs.length} exercises`
                        : <span style={{ color: 'var(--dim)' }}>Rest day</span>
                      }
                    </div>
                    {isSelected && exConfigs.length > 0 && (
                      <button
                        style={{
                          marginTop: '10px', width: '100%', padding: '7px 0',
                          background: isDone ? 'var(--surface3)' : 'var(--accent)',
                          border: isDone ? '1px solid var(--border2)' : 'none',
                          borderRadius: '6px',
                          color: isDone ? 'var(--muted)' : '#0a0a0a',
                          fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                        }}
                        onClick={e => { e.stopPropagation(); handleLoadTemplate(day) }}
                      >
                        {isDone ? 'Redo session →' : 'Start session →'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}
