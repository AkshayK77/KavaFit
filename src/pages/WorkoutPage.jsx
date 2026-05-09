import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { generateOneOffSession, generateSessionFromPreferences, getWeekStart } from '../lib/workoutPlan'
import { updateVolumeLog } from '../lib/volumeTracker'
import { getProgressionSuggestion } from '../lib/progressiveOverload'
import { callAgent, parseAgentJSON } from '../lib/geminiAgent'
import { saveOfflineSet, saveOfflineSession, getOfflineSets, getOfflineSessions, clearOfflineSet, clearOfflineSession } from '../lib/offlineDb'
import { useToast } from '../components/Toast'

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtTime(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0')
  const s = String(secs % 60).padStart(2, '0')
  return `${m}:${s}`
}

function today() {
  return new Date().toISOString().split('T')[0]
}

const ACTIVE_SESSION_KEY = 'forge_active_session_v1'

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

function detectSessionType(muscleGroups) {
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

function getNextSessionType(lastType) {
  return { Push: 'Pull', Pull: 'Legs', Legs: 'Push', 'Upper Body': 'Legs' }[lastType] ?? 'Full Body'
}

function getTimeLabel(minutes) {
  if (minutes <= 35) return 'Express session — 3-4 exercises'
  if (minutes <= 50) return 'Standard session — 5-6 exercises'
  if (minutes <= 70) return 'Full session — 6-8 exercises'
  return 'Extended session — 8-10 exercises'
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s = {
  page: { padding: '28px', maxWidth: '900px', margin: '0 auto' },
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
  exCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' },
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
    margin: '16px 28px 0',
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
  const { user, workoutUpdate, setWorkoutUpdate, setActiveSessionExercises } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const isMobile = useIsMobile()

  // Mode A state
  const [plan, setPlan] = useState(null)
  const [planDays, setPlanDays] = useState([])
  const [todayDay, setTodayDay] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  // Mode B state
  const [mode, setMode] = useState('A')
  const [activeSession, setActiveSession] = useState(null) // { id, name }
  const [sessionExercises, setSessionExercises] = useState([])
  const [exerciseDone, setExerciseDone] = useState({})

  // Warm-up
  const [warmup, setWarmup] = useState(null)
  const [warmupDismissed, setWarmupDismissed] = useState(false)

  // Timers
  const [elapsed, setElapsed] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const startTimeRef = useRef(null)
  const isPausedRef = useRef(false)
  const pausedTimeRef = useRef(0)
  const pauseStartRef = useRef(null)
  const [restSeconds, setRestSeconds] = useState(0)
  const [restActive, setRestActive] = useState(false)

  // Completion
  const [completed, setCompleted] = useState(false)
  const [completionData, setCompletionData] = useState(null)
  const [prOverlay, setPrOverlay] = useState(null)
  const [profile, setProfile] = useState(null)

  // Generation modal
  const [showGenModal, setShowGenModal] = useState(false)
  const [modalInitLoading, setModalInitLoading] = useState(false)
  const [modalMuscleGroups, setModalMuscleGroups] = useState([])
  const [modalMinutes, setModalMinutes] = useState(60)
  const [modalFeeling, setModalFeeling] = useState('normal')
  const [modalAutoSuggested, setModalAutoSuggested] = useState(null)
  const [modalOverdueMuscles, setModalOverdueMuscles] = useState([])
  const [modalSuggestionCleared, setModalSuggestionCleared] = useState(false)

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
    const totalElapsed = Math.max(0, Math.floor((now - startTimeRef.current - pausedTimeRef.current - livePaused) / 1000))
    setElapsed(totalElapsed)
    setActiveSessionExercises((restored.sessionExercises || []).map(ex => ex.exercise).filter(Boolean))
  }, [user])

  useEffect(() => {
    if (mode !== 'B' || !activeSession || sessionExercises.length === 0) return
    persistActiveSession()
  }, [mode, activeSession, sessionExercises, warmup, warmupDismissed, exerciseDone])

  useEffect(() => {
    if (!sessionExercises.length) return
    setExerciseDone(prev => {
      const next = {}
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
      const [sets, sessions] = await Promise.all([getOfflineSets(), getOfflineSessions()])
      for (const sess of sessions) {
        await supabase.from('sessions').upsert(sess)
        await clearOfflineSession(sess.session_id)
      }
      for (const set of sets) {
        const { key, ...setData } = set
        await supabase.from('session_sets').upsert(setData)
        await clearOfflineSet(key)
      }
    } catch { /* sync silently fails */ }
  }

  async function loadPlanData() {
    setLoading(true)
    const [{ data: prof }, { data: planData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase
        .from('workout_plans')
        .select('id, name, plan_days(id, day_name, day_order, exercise_ids)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    setProfile(prof)
    if (planData) {
      setPlan(planData)
      const days = (planData.plan_days || []).sort((a, b) => a.day_order - b.day_order)
      setPlanDays(days)
      const dow = new Date().getDay()
      const idx = dow === 0 ? days.length - 1 : Math.min(dow - 1, days.length - 1)
      setTodayDay(days[idx] ?? days[0])
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
        setElapsed(Math.floor((Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000))
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
      pausedTimeRef.current += Date.now() - pauseStartRef.current
      pauseStartRef.current = null
      setIsPaused(false)
      persistActiveSession()
    }
  }

  function loadPersistedSession(userId) {
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
  }, [workoutUpdate])

  async function applyWorkoutUpdate(update) {
    if (!update?.exercises?.length) return
    const nameMap = {}
    sessionExercises.forEach(ex => { nameMap[ex.exercise.name.toLowerCase()] = ex })

    const updated = []
    for (const cfg of update.exercises) {
      const key = cfg.exerciseName?.toLowerCase()
      const existing = nameMap[key]
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
          const hint = await getProgressionSuggestion(user.id, data.id)
          updated.push({
            exercise: data,
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
      setSessionExercises(updated)
      setActiveSessionExercises(updated.map(ex => ex.exercise))
    }
  }

  // ── Warm-up generator ────────────────────────────────────────────────────

  async function generateWarmup(muscleGroups) {
    try {
      const muscleStr = muscleGroups.slice(0, 5).join(', ')
      const text = await callAgent(
        user.id,
        `Generate a 5-exercise warm-up for a user about to train: ${muscleStr}`,
        'warmup'
      )
      const parsed = parseAgentJSON(text)
      if (Array.isArray(parsed)) setWarmup(parsed.slice(0, 5))
    } catch { /* silently skip */ }
  }

  // ── Mode A actions ────────────────────────────────────────────────────────

  async function handleLoadTemplate() {
    if (!todayDay) return
    const exerciseConfigs = todayDay.exercise_ids || []
    if (!exerciseConfigs.length) return

    const ids = exerciseConfigs.map(e => e.exerciseId || e).filter(Boolean)
    const { data: exercises } = await supabase.from('exercises').select('*').in('id', ids)
    if (!exercises) return

    // Fetch previous sets for each exercise
    const prevSetsMap = await fetchPreviousSets(ids)

    // Create session row
    const { data: sess } = await supabase
      .from('sessions')
      .insert({ user_id: user.id, plan_day_id: todayDay.id, date: today() })
      .select()
      .single()

    const sessionExs = exerciseConfigs
      .map(cfg => {
        const exId = cfg.exerciseId || cfg
        const ex = exercises.find(e => e.id === exId)
        if (!ex) return null
        const prev = prevSetsMap[exId] || []
        const numSets = cfg.sets || 3
        return {
          exercise: ex,
          sets: numSets,
          repRange: cfg.repRange || '8-12',
          prevSets: prev,
          currentSets: Array.from({ length: numSets }, () => ({ reps: '', completed: false })),
          progressionHint: null,
        }
      })
      .filter(Boolean)

    const hints = await Promise.all(
      sessionExs.map(ex => getProgressionSuggestion(user.id, ex.exercise.id))
    )
    const sessionExsWithHints = sessionExs.map((ex, i) => ({ ...ex, progressionHint: hints[i] }))

    setActiveSession({ id: sess.id, name: todayDay.day_name })
    setSessionExercises(sessionExsWithHints)
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
    persistActiveSession()
    const muscles = [...new Set(sessionExsWithHints.flatMap(ex => ex.exercise.muscle_groups || []))]
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

      const { data: recentSessions } = await supabase
        .from('sessions')
        .select('id, date')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(5)

      let autoSelect = 'Full Body'
      let allRecentMuscles = []

      if (recentSessions?.length > 0) {
        const sessionIds = recentSessions.map(s => s.id)
        const [{ data: sets }, { data: volRows }] = await Promise.all([
          supabase
            .from('session_sets')
            .select('session_id, exercise_id')
            .in('session_id', sessionIds)
            .eq('completed', true),
          supabase
            .from('muscle_volume_log')
            .select('muscle_group, total_sets')
            .eq('user_id', user.id)
            .eq('week_start', getWeekStart()),
        ])

        const exIds = [...new Set((sets || []).map(s => s.exercise_id))]
        let exMap = {}
        if (exIds.length > 0) {
          const { data: exs } = await supabase
            .from('exercises')
            .select('id, muscle_groups')
            .in('id', exIds)
          exs?.forEach(e => { exMap[e.id] = e.muscle_groups || [] })
        }

        // Build per-session muscle groups
        const sessionMuscles = {}
        recentSessions.forEach(sess => {
          const sessSets = (sets || []).filter(s => s.session_id === sess.id)
          sessionMuscles[sess.date] = [...new Set(sessSets.flatMap(s => exMap[s.exercise_id] || []))]
        })

        // Auto-detect: use most recent session
        const mostRecentMuscles = Object.values(sessionMuscles)[0] || []
        const lastType = detectSessionType(mostRecentMuscles)
        autoSelect = getNextSessionType(lastType)

        // Overdue: muscles at 0 sets this week AND not trained in last 5 days
        const trainedThisWeek = new Set((volRows || []).map(r => r.muscle_group))
        const recentlyTrained = new Set(
          Object.entries(sessionMuscles)
            .filter(([date]) => date >= fiveDaysAgoStr)
            .flatMap(([, muscles]) => muscles)
        )
        allRecentMuscles = [...recentlyTrained]

        const overdue = MUSCLE_OPTIONS.filter(chip => {
          const pattern = CHIP_TO_PATTERN[chip]
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

  function toggleModalMuscleGroup(group) {
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
      const { session, exercises, sessionName } = await generateSessionFromPreferences(user.id, profile, preferences)
      const ids = exercises.map(e => e.exercise.id)
      const prevSetsMap = await fetchPreviousSets(ids)

      const sessionExs = exercises.map(({ exercise, sets, repRange, targetRPE, notes }) => {
        return {
          exercise,
          sets,
          repRange,
          targetRPE,
          notes,
          prevSets: prevSetsMap[exercise.id] || [],
          currentSets: Array.from({ length: sets }, () => ({ reps: '', completed: false })),
          progressionHint: null,
        }
      })

      const hints = await Promise.all(
        sessionExs.map(ex => getProgressionSuggestion(user.id, ex.exercise.id))
      )
      const sessionExsWithHints = sessionExs.map((ex, i) => ({ ...ex, progressionHint: hints[i] }))

      setActiveSession({ id: session.id, name: sessionName })
      setSessionExercises(sessionExsWithHints)
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

  async function fetchPreviousSets(exerciseIds) {
    if (!exerciseIds.length) return {}
    const { data } = await supabase
      .from('session_sets')
      .select('exercise_id, weight_kg, reps, set_number, created_at')
      .in('exercise_id', exerciseIds)
      .eq('completed', true)
      .order('created_at', { ascending: false })

    const map = {}
    data?.forEach(row => {
      if (!map[row.exercise_id]) map[row.exercise_id] = []
      if (map[row.exercise_id].length < 5) map[row.exercise_id].push({ w: row.weight_kg, r: row.reps })
    })
    return map
  }

  // ── Mode B actions ────────────────────────────────────────────────────────

  function updateSet(exIdx, setIdx, field, value) {
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

  function addSet(exIdx) {
    setSessionExercises(prev => prev.map((ex, i) =>
      i !== exIdx ? ex : { ...ex, currentSets: [...ex.currentSets, { reps: '', completed: false }] }
    ))
  }

  async function handleFinishSession() {
    const endTime = new Date()
    const durationMinutes = Math.round(elapsed / 60)

    // Collect completed sets
    const allSets = []
    sessionExercises.forEach(ex => {
      ex.currentSets.forEach((set, idx) => {
        const hasReps = String(set.reps || '').trim() !== ''
        if (hasReps) {
          allSets.push({
            session_id: activeSession.id,
            exercise_id: ex.exercise.id,
            set_number: idx + 1,
            weight_kg: parseFloat(set.weight) || null,
            reps: parseInt(set.reps) || null,
            completed: true,
          })
        }
      })
    })

    if (!isOnline) {
      await saveOfflineSession({
        session_id: activeSession.id,
        user_id: user.id,
        completed_at: endTime.toISOString(),
        duration_minutes: durationMinutes,
      })
      for (const set of allSets) {
        await saveOfflineSet(set)
      }
      setActiveSessionExercises([])
      setWarmup(null)
      setCompletionData({ durationMinutes, totalSets: allSets.length, totalExercises: new Set(allSets.map(s => s.exercise_id)).size, prs: [] })
      setCompleted(true)
      setMode('A')
      clearPersistedSession()
      resetActiveSessionState()
      showToast('Session saved offline — will sync when reconnected', 'warning')
      setTimeout(() => navigate('/dashboard'), 3000)
      return
    }

    if (allSets.length > 0) {
      await supabase.from('session_sets').insert(allSets)
    }

    await supabase
      .from('sessions')
      .update({ completed_at: endTime.toISOString(), duration_minutes: durationMinutes })
      .eq('id', activeSession.id)

    // PR detection
    const exerciseIds = sessionExercises.map(ex => ex.exercise.id)
    const { data: prevSets } = await supabase
      .from('session_sets')
      .select('exercise_id, weight_kg')
      .in('exercise_id', exerciseIds)
      .eq('completed', true)
      .neq('session_id', activeSession.id)

    const prs = []
    sessionExercises.forEach(ex => {
      const doneSets = ex.currentSets.filter(s => String(s.reps || '').trim() !== '' && s.weight)
      if (!doneSets.length) return
      const bestSet = doneSets.reduce((best, s) =>
        (parseFloat(s.weight) || 0) > (parseFloat(best?.weight) || 0) ? s : best, doneSets[0])
      const currentMax = parseFloat(bestSet?.weight) || 0
      const prevForEx = (prevSets || []).filter(s => s.exercise_id === ex.exercise.id)
      const prevMax = prevForEx.length > 0 ? Math.max(...prevForEx.map(s => parseFloat(s.weight_kg) || 0)) : 0
      if (currentMax > prevMax && currentMax > 0) {
        prs.push({ name: ex.exercise.name, oldMax: prevMax, newMax: currentMax, reps: bestSet?.reps || null })
      }
    })

    if (allSets.length > 0) {
      const completedSetsWithMuscles = []
      sessionExercises.forEach(ex => {
        ex.currentSets.forEach(set => {
          const hasReps = String(set.reps || '').trim() !== ''
          if (hasReps) {
            completedSetsWithMuscles.push({ muscle_groups: ex.exercise.muscle_groups || [] })
          }
        })
      })
      await updateVolumeLog(user.id, completedSetsWithMuscles)
    }

    const totalSets = allSets.length
    const totalExercises = new Set(allSets.map(s => s.exercise_id)).size

    setActiveSessionExercises([])
    setWarmup(null)
    setCompletionData({ durationMinutes, totalSets, totalExercises, prs })
    setCompleted(true)
    setMode('A')
    clearPersistedSession()
    resetActiveSessionState()
    showToast(prs.length > 0 ? `Session complete — ${prs.length} new PR${prs.length > 1 ? 's' : ''}!` : 'Session complete', 'success')

    if (prs.length > 0) {
      try {
        localStorage.setItem('forge_new_prs', JSON.stringify({ prs, timestamp: Date.now() }))
      } catch { /* ignore */ }
      setPrOverlay(prs)
      setTimeout(() => setPrOverlay(null), 2000)
      setTimeout(() => navigate('/dashboard'), 5000)
    } else {
      setTimeout(() => navigate('/dashboard'), 3000)
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

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
        {genModal}
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
        {genModal}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Session header */}
          <div style={s.sessionHeader}>
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
          <div style={{ ...s.exerciseList, flex: 1, overflowY: 'auto' }}>
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
              const prevMax = ex.prevSets.length > 0 ? Math.max(...ex.prevSets.map(s => parseFloat(s.w) || 0)) : null
              const hint = ex.progressionHint?.shouldIncrease ? ex.progressionHint.reason : null
              const allSetsDone = ex.currentSets.every(s => s.completed)
              const isExerciseDone = exerciseDone[ex.exercise.id] ?? allSetsDone
              const recommendedSets = ex.sets || ex.currentSets.length

              return (
                <div key={ex.exercise.id} style={s.exCard}>
                  <div style={s.exHeader}>
                    <div>
                      <div style={s.exName}>{ex.exercise.name}</div>
                      <div style={s.exMuscles}>
                        {(ex.exercise.muscle_groups || []).slice(0, 3).map(m => m.replace(/_/g, ' ')).join(' · ')}
                      </div>
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
                    <div>
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
                          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                          onBlur={e => e.target.style.borderColor = 'var(--border)'}
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
      {genModal}
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
              style={{ ...s.btnOutline, ...((!todayDay || loading) ? s.btnDisabled : {}) }}
              onClick={handleLoadTemplate}
              onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border2)'}
            >
              Load template
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
            <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '16px' }}>
              {profile?.fitness_goal && profile?.experience_level && profile?.sessions_per_week && profile?.equipment_available
                ? 'No weekly plan yet — use "Generate with AI" above to build your first session.'
                : 'No workout plan yet. Complete your profile in Settings or use "Generate with AI" above.'}
            </p>
          </div>
        ) : (
          <>
            <div style={s.sectionLabel}>This week's plan — {plan.name}</div>
            <div style={s.dayGrid}>
              {planDays.map((day, idx) => {
                const isToday = idx === (new Date().getDay() === 0 ? planDays.length - 1 : Math.min(new Date().getDay() - 1, planDays.length - 1))
                const exConfigs = day.exercise_ids || []
                return (
                  <div key={day.id} style={{ ...s.dayCard, ...(isToday ? s.dayCardActive : {}) }}>
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
