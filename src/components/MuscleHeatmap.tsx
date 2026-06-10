import React, { useState, useEffect, useRef, useCallback } from 'react'
import { BodyChart, ViewSide } from 'body-muscles'
import type { BodyState } from 'body-muscles'
import { getWeeklyVolume, getVolumeStatus, setVolumeManual, VOLUME_THRESHOLDS } from '../lib/volumeTracker'
import { useIsMobile } from '../hooks/useIsMobile'
import ManualWorkoutLogger from './ManualWorkoutLogger'

type VolumeStatus = 'none' | 'low' | 'optimal' | 'high'

interface VolumeRow {
  muscle_group: string
  total_sets: number
  updated_at: string | null
}

// ─── Muscle ID ↔ volume group mappings ────────────────────────────────────────

const MUSCLE_ID_TO_GROUP: Record<string, string> = {
  'chest-upper-left': 'chest', 'chest-lower-left': 'chest',
  'chest-upper-right': 'chest', 'chest-lower-right': 'chest',
  'shoulder-front-left': 'shoulders', 'shoulder-side-left': 'shoulders',
  'shoulder-front-right': 'shoulders', 'shoulder-side-right': 'shoulders',
  'deltoid-rear-left': 'shoulders', 'deltoid-rear-right': 'shoulders',
  'triceps-long-left': 'triceps', 'triceps-lateral-left': 'triceps',
  'triceps-long-right': 'triceps', 'triceps-lateral-right': 'triceps',
  'lats-upper-left': 'lats', 'lats-mid-left': 'lats', 'lats-lower-left': 'lats',
  'lats-upper-right': 'lats', 'lats-mid-right': 'lats', 'lats-lower-right': 'lats',
  'traps-upper-left': 'mid_back', 'traps-mid-left': 'mid_back', 'traps-lower-left': 'mid_back',
  'traps-upper-right': 'mid_back', 'traps-mid-right': 'mid_back', 'traps-lower-right': 'mid_back',
  'spine': 'mid_back',
  'lower-back-erectors-left': 'mid_back', 'lower-back-ql-left': 'mid_back',
  'lower-back-erectors-right': 'mid_back', 'lower-back-ql-right': 'mid_back',
  'abs-upper-left': 'abs', 'abs-upper-right': 'abs',
  'abs-lower-left': 'abs', 'abs-lower-right': 'abs',
  'obliques-left': 'abs', 'obliques-right': 'abs',
  'serratus-anterior-left': 'abs', 'serratus-anterior-right': 'abs',
  'biceps-left': 'biceps', 'biceps-right': 'biceps',
  'forearm-left': 'forearms', 'forearm-right': 'forearms',
  'forearm-flexors-left': 'forearms', 'forearm-extensors-left': 'forearms',
  'forearm-flexors-right': 'forearms', 'forearm-extensors-right': 'forearms',
  'quads-left': 'quads', 'quads-right': 'quads',
  'hamstrings-medial-left': 'hamstrings', 'hamstrings-lateral-left': 'hamstrings',
  'hamstrings-medial-right': 'hamstrings', 'hamstrings-lateral-right': 'hamstrings',
  'gluteus-maximus-left': 'glutes', 'gluteus-medius-left': 'glutes',
  'gluteus-maximus-right': 'glutes', 'gluteus-medius-right': 'glutes',
  'tibialis-anterior-left': 'calves', 'tibialis-anterior-right': 'calves',
  'calves-gastroc-medial-left': 'calves', 'calves-gastroc-lateral-left': 'calves',
  'calves-soleus-left': 'calves',
  'calves-gastroc-medial-right': 'calves', 'calves-gastroc-lateral-right': 'calves',
  'calves-soleus-right': 'calves',
}

const FRONT_MUSCLE_IDS: Record<string, string[]> = {
  chest: ['chest-upper-left', 'chest-lower-left', 'chest-upper-right', 'chest-lower-right'],
  shoulders: ['shoulder-front-left', 'shoulder-side-left', 'shoulder-front-right', 'shoulder-side-right'],
  triceps: [],
  lats: [],
  mid_back: [],
  biceps: ['biceps-left', 'biceps-right'],
  abs: ['abs-upper-left', 'abs-upper-right', 'abs-lower-left', 'abs-lower-right', 'obliques-left', 'obliques-right', 'serratus-anterior-left', 'serratus-anterior-right'],
  forearms: ['forearm-left', 'forearm-right'],
  quads: ['quads-left', 'quads-right'],
  hamstrings: [],
  glutes: [],
  calves: ['tibialis-anterior-left', 'tibialis-anterior-right'],
}

const BACK_MUSCLE_IDS: Record<string, string[]> = {
  chest: [],
  shoulders: ['deltoid-rear-left', 'deltoid-rear-right'],
  triceps: ['triceps-long-left', 'triceps-lateral-left', 'triceps-long-right', 'triceps-lateral-right'],
  lats: ['lats-upper-left', 'lats-mid-left', 'lats-lower-left', 'lats-upper-right', 'lats-mid-right', 'lats-lower-right'],
  mid_back: ['traps-upper-left', 'traps-mid-left', 'traps-lower-left', 'traps-upper-right', 'traps-mid-right', 'traps-lower-right', 'spine', 'lower-back-erectors-left', 'lower-back-ql-left', 'lower-back-erectors-right', 'lower-back-ql-right'],
  biceps: [],
  abs: [],
  forearms: ['forearm-flexors-left', 'forearm-extensors-left', 'forearm-flexors-right', 'forearm-extensors-right'],
  quads: [],
  hamstrings: ['hamstrings-medial-left', 'hamstrings-lateral-left', 'hamstrings-medial-right', 'hamstrings-lateral-right'],
  glutes: ['gluteus-maximus-left', 'gluteus-medius-left', 'gluteus-maximus-right', 'gluteus-medius-right'],
  calves: ['calves-gastroc-medial-left', 'calves-gastroc-lateral-left', 'calves-soleus-left', 'calves-gastroc-medial-right', 'calves-gastroc-lateral-right', 'calves-soleus-right'],
}

function statusToIntensity(status: string): number {
  if (status === 'low') return 3
  if (status === 'optimal') return 6
  if (status === 'high') return 10
  return 0
}

function buildHeatmapState(
  volumeMap: Record<string, VolumeRow>,
  selectedMuscle: string | null,
  muscleIds: Record<string, string[]>
): BodyState {
  const state: BodyState = {}
  for (const [group, ids] of Object.entries(muscleIds)) {
    if (!ids.length) continue
    const sets = volumeMap[group]?.total_sets || 0
    const intensity = statusToIntensity(getVolumeStatus(group, sets))
    const selected = group === selectedMuscle
    for (const id of ids) state[id] = { intensity, selected }
  }
  return state
}

// ─── Status display constants (used by legend + EditPanel) ────────────────────

const STATUS_DOT_COLORS: Record<VolumeStatus, string> = {
  none: '#555555', low: '#f5a623', optimal: '#C8F55A', high: '#ff5c5c',
}
const STATUS_LABELS: Record<VolumeStatus, string> = {
  none: 'Not trained', low: 'Below target', optimal: 'On track', high: 'Overloaded',
}
const STATUS_LEGEND = [
  { color: '#94a3b8', label: 'Not trained' },
  { color: '#eab308', label: 'Below target' },
  { color: '#4ade80', label: 'On track' },
  { color: '#7f1d1d', label: 'Overloaded' },
]
const ALL_MUSCLE_GROUPS = Object.keys(VOLUME_THRESHOLDS)

// ─── EditPanel (unchanged) ────────────────────────────────────────────────────

interface EditPanelProps {
  muscleGroup: string
  volumeMap: Record<string, VolumeRow>
  userId: string
  onClose: () => void
  onUpdate: (muscleGroup: string, newSets: number) => void
  onOpenLogger: () => void
}

function EditPanel({ muscleGroup, volumeMap, userId, onClose, onUpdate, onOpenLogger }: EditPanelProps) {
  const t = VOLUME_THRESHOLDS[muscleGroup as keyof typeof VOLUME_THRESHOLDS] || { min: 10, max: 20 }
  const row = volumeMap[muscleGroup]
  const current = row?.total_sets || 0
  const status = getVolumeStatus(muscleGroup, current) as VolumeStatus

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persist = useCallback((sets: number) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => { setVolumeManual(userId, muscleGroup, sets) }, 400)
  }, [userId, muscleGroup])
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  function adjust(delta: number) {
    const next = Math.max(0, current + delta)
    onUpdate(muscleGroup, next); persist(next)
  }
  function setPreset(sets: number) { onUpdate(muscleGroup, sets); persist(sets) }

  const presets = [
    { label: 'None', sets: 0, status: 'none' as VolumeStatus },
    { label: 'Light', sets: Math.floor(t.min * 0.7), status: 'low' as VolumeStatus },
    { label: 'Trained', sets: t.min, status: 'optimal' as VolumeStatus },
    { label: 'Max', sets: t.max, status: 'optimal' as VolumeStatus },
  ]

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '440px',
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        borderRadius: '16px 16px 0 0', padding: '20px 24px',
        paddingBottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
        zIndex: 211, boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
        maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto', boxSizing: 'border-box',
      }}>
        <div style={{ width: '36px', height: '4px', background: 'var(--border2)', borderRadius: '2px', margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '22px', letterSpacing: '0.04em', textTransform: 'capitalize' }}>
              {muscleGroup.replace(/_/g, ' ')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: STATUS_DOT_COLORS[status] }} />
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{STATUS_LABELS[status]}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer', padding: '4px', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', marginBottom: '20px' }}>
          <button onClick={() => adjust(-2)} style={adjBtnStyle}>−</button>
          <div style={{ textAlign: 'center', minWidth: '80px' }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '40px', letterSpacing: '0.04em', lineHeight: 1, color: STATUS_DOT_COLORS[status] }}>{current}</div>
            <div style={{ fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>sets · target {t.min}–{t.max}</div>
          </div>
          <button onClick={() => adjust(2)} style={adjBtnStyle}>+</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
          {presets.map(p => {
            const isActive = current === p.sets
            return (
              <button key={p.label} onClick={() => setPreset(p.sets)} style={{
                padding: '8px 0', background: isActive ? `${STATUS_DOT_COLORS[p.status]}22` : 'var(--surface2, #1a1a1a)',
                border: `1px solid ${isActive ? STATUS_DOT_COLORS[p.status] : 'var(--border)'}`,
                borderRadius: '8px', color: isActive ? STATUS_DOT_COLORS[p.status] : 'var(--muted)',
                fontSize: '11px', fontWeight: '600', letterSpacing: '0.04em', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <div>{p.label}</div>
                <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '2px' }}>{p.sets} sets</div>
              </button>
            )
          })}
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', textAlign: 'center' }}>
          <button onClick={onOpenLogger} style={{
            background: 'none', border: '1px solid var(--border2)', borderRadius: '8px',
            color: 'var(--text)', fontSize: '13px', fontWeight: '500',
            cursor: 'pointer', padding: '9px 20px', fontFamily: 'inherit', width: '100%',
          }}>
            Log a full workout instead →
          </button>
        </div>
      </div>
    </>
  )
}

const adjBtnStyle: React.CSSProperties = {
  width: '44px', height: '44px', background: 'var(--surface2, #1a1a1a)',
  border: '1px solid var(--border2)', borderRadius: '50%', color: 'var(--text)',
  fontSize: '22px', fontWeight: '300', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit', lineHeight: 1,
}

// ─── MuscleHeatmap ────────────────────────────────────────────────────────────

export default function MuscleHeatmap({ userId, refreshKey }: { userId: string; refreshKey?: number }) {
  const [volumeMap, setVolumeMap] = useState<Record<string, VolumeRow>>({})
  const [loading, setLoading] = useState(true)
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null)
  const [showLogger, setShowLogger] = useState(false)
  const isMobile = useIsMobile()

  const frontRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const frontChart = useRef<BodyChart | null>(null)
  const backChart = useRef<BodyChart | null>(null)

  // Keep latest values accessible inside BodyChart callbacks without recreating handlers
  const volumeMapRef = useRef(volumeMap)
  const selectedRef = useRef(selectedMuscle)
  useEffect(() => { volumeMapRef.current = volumeMap }, [volumeMap])
  useEffect(() => { selectedRef.current = selectedMuscle }, [selectedMuscle])

  function loadVolume() {
    if (!userId) return
    getWeeklyVolume(userId).then(rows => {
      const map: Record<string, VolumeRow> = {}
      rows.forEach(r => { map[r.muscle_group] = r })
      setVolumeMap(map)
      setLoading(false)
    })
  }

  useEffect(() => { loadVolume() }, [userId, refreshKey])

  // Mount charts once — must wait until loading is done so the ref divs are in the DOM
  useEffect(() => {
    if (loading) return
    if (!frontRef.current || !backRef.current) return
    const handleClick = (id: string) => {
      const group = MUSCLE_ID_TO_GROUP[id]
      if (group) setSelectedMuscle(prev => prev === group ? null : group)
    }
    frontChart.current = new BodyChart(frontRef.current, {
      view: ViewSide.FRONT,
      bodyState: buildHeatmapState(volumeMapRef.current, selectedRef.current, FRONT_MUSCLE_IDS),
      onMuscleClick: handleClick,
    })
    backChart.current = new BodyChart(backRef.current, {
      view: ViewSide.BACK,
      bodyState: buildHeatmapState(volumeMapRef.current, selectedRef.current, BACK_MUSCLE_IDS),
      onMuscleClick: handleClick,
    })
    return () => { frontChart.current?.destroy(); backChart.current?.destroy() }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync charts whenever volume data or selection changes
  useEffect(() => {
    frontChart.current?.update({ bodyState: buildHeatmapState(volumeMap, selectedMuscle, FRONT_MUSCLE_IDS) })
    backChart.current?.update({ bodyState: buildHeatmapState(volumeMap, selectedMuscle, BACK_MUSCLE_IDS) })
  }, [volumeMap, selectedMuscle])

  const applyOnTrackColor = useCallback((container: HTMLDivElement | null) => {
    if (!container) return
    const paths = container.querySelectorAll<SVGPathElement>('.body-chart-muscle')
    paths.forEach(path => {
      const label = path.getAttribute('aria-label') || ''
      const isOnTrack = label.includes('intensity 6')
      if (isOnTrack) {
        path.style.fill = '#4ade80'
      } else if (path.style.fill === 'rgb(74, 222, 128)') {
        path.style.removeProperty('fill')
      }
    })
  }, [])

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      applyOnTrackColor(frontRef.current)
      applyOnTrackColor(backRef.current)
    })
    return () => window.cancelAnimationFrame(raf)
  }, [volumeMap, selectedMuscle, applyOnTrackColor])

  function handleUpdate(muscleGroup: string, newSets: number) {
    setVolumeMap(prev => ({
      ...prev,
      [muscleGroup]: {
        ...(prev[muscleGroup] || { muscle_group: muscleGroup }),
        total_sets: newSets,
        updated_at: new Date().toISOString(),
      },
    }))
  }

  if (loading) {
    return <div style={{ color: 'var(--dim)', fontSize: '12px', padding: '20px 0' }}>Loading muscle data…</div>
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em',
    textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '4px', textAlign: 'center',
  }

  const CHART_W = isMobile ? '130px' : '140px'

  const charts = (
    <div style={{
      display: 'flex', gap: '12px', alignItems: 'flex-start', flexShrink: 0,
      ...(isMobile ? { width: '100%', justifyContent: 'center' } : {}),
    }}>
      <div>
        <div style={labelStyle}>Front</div>
        <div ref={frontRef} style={{ width: CHART_W }} />
      </div>
      <div>
        <div style={labelStyle}>Back</div>
        <div ref={backRef} style={{ width: CHART_W }} />
      </div>
    </div>
  )

  const volumeList = (mg: string) => {
    const row = volumeMap[mg]
    const sets = row?.total_sets || 0
    const status = getVolumeStatus(mg, sets) as VolumeStatus
    const t = VOLUME_THRESHOLDS[mg as keyof typeof VOLUME_THRESHOLDS]
    const isSelected = mg === selectedMuscle
    return (
      <div
        key={mg}
        onClick={() => setSelectedMuscle(prev => prev === mg ? null : mg)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px',
          cursor: 'pointer', padding: '4px 6px', borderRadius: '6px',
          background: isSelected ? 'var(--surface2, rgba(255,255,255,0.05))' : 'transparent',
          transition: 'background 0.15s',
        }}
      >
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_DOT_COLORS[status], flexShrink: 0 }} />
        <span style={{ color: 'var(--text)', flex: 1, textTransform: 'capitalize' }}>{mg.replace(/_/g, ' ')}</span>
        <span style={{ color: 'var(--muted)', fontSize: '11px' }}>{sets}{t ? ` / ${t.min}–${t.max}` : ''}</span>
      </div>
    )
  }

  const logBtn = (
    <button
      onClick={() => { setSelectedMuscle(null); setShowLogger(true) }}
      style={{
        padding: '7px 14px', background: 'var(--accent)', border: 'none',
        borderRadius: '7px', color: '#0a0a0a', fontSize: '12px', fontWeight: '700',
        cursor: 'pointer', letterSpacing: '0.02em', fontFamily: 'inherit', flexShrink: 0,
      }}
    >
      + Log Workout
    </button>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)' }}>
          Tap a muscle to adjust
        </div>
        {logBtn}
      </div>

      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? '16px' : '24px',
        alignItems: isMobile ? 'center' : 'flex-start',
      }}>
        {charts}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '8px' }}>
            This week
          </div>
          {isMobile ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
              {ALL_MUSCLE_GROUPS.map(mg => {
                const row = volumeMap[mg]
                const sets = row?.total_sets || 0
                const status = getVolumeStatus(mg, sets) as VolumeStatus
                const isSelected = mg === selectedMuscle
                return (
                  <div
                    key={mg}
                    onClick={() => setSelectedMuscle(prev => prev === mg ? null : mg)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px',
                      cursor: 'pointer', padding: '3px 4px', borderRadius: '4px',
                      background: isSelected ? 'var(--surface2, rgba(255,255,255,0.05))' : 'transparent',
                    }}
                  >
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: STATUS_DOT_COLORS[status], flexShrink: 0 }} />
                    <span style={{ color: 'var(--text)', textTransform: 'capitalize', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {mg.replace(/_/g, ' ')}
                    </span>
                    <span style={{ color: 'var(--muted)', fontSize: '10px', flexShrink: 0 }}>{sets}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {ALL_MUSCLE_GROUPS.map(volumeList)}
            </div>
          )}
        </div>
      </div>

      {/* Legend — reflects library intensity scale */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '16px', flexWrap: 'wrap' }}>
        {STATUS_LEGEND.map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted)' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: color, flexShrink: 0 }} />
            {label}
          </div>
        ))}
      </div>

      {selectedMuscle && (
        <EditPanel
          muscleGroup={selectedMuscle}
          volumeMap={volumeMap}
          userId={userId}
          onClose={() => setSelectedMuscle(null)}
          onUpdate={handleUpdate}
          onOpenLogger={() => { setSelectedMuscle(null); setShowLogger(true) }}
        />
      )}

      {showLogger && (
        <ManualWorkoutLogger
          onClose={() => setShowLogger(false)}
          onSaved={() => { setShowLogger(false); loadVolume() }}
        />
      )}
    </div>
  )
}
