import { useState, useEffect, useRef, useCallback } from 'react'
import { getWeeklyVolume, getVolumeStatus, setVolumeManual, VOLUME_THRESHOLDS } from '../lib/volumeTracker'
import { useIsMobile } from '../hooks/useIsMobile'
import ManualWorkoutLogger from './ManualWorkoutLogger'

// ─── region definitions ──────────────────────────────────────────────────────

const FRONT_REGIONS = [
  { id: 'head-f', shape: 'ellipse', attrs: { cx: 50, cy: 14, rx: 12, ry: 13 } },
  { id: 'neck-f', shape: 'rect', attrs: { x: 45, y: 27, width: 10, height: 8, rx: 2 } },
  { id: 'abs', shape: 'rect', attrs: { x: 37, y: 71, width: 26, height: 30, rx: 4 } },
  { id: 'hip-l', shape: 'rect', attrs: { x: 32, y: 102, width: 14, height: 12, rx: 3 } },
  { id: 'hip-r', shape: 'rect', attrs: { x: 54, y: 102, width: 14, height: 12, rx: 3 } },
  { id: 'forearm-l', muscleGroup: 'forearms', shape: 'rect', attrs: { x: 14, y: 88, width: 9, height: 20, rx: 4 } },
  { id: 'forearm-r', muscleGroup: 'forearms', shape: 'rect', attrs: { x: 77, y: 88, width: 9, height: 20, rx: 4 } },
  { id: 'chest', muscleGroup: 'chest', shape: 'rect', attrs: { x: 32, y: 40, width: 36, height: 28, rx: 5 } },
  { id: 'delt-l', muscleGroup: 'shoulders', shape: 'ellipse', attrs: { cx: 25, cy: 50, rx: 9, ry: 9 } },
  { id: 'delt-r', muscleGroup: 'shoulders', shape: 'ellipse', attrs: { cx: 75, cy: 50, rx: 9, ry: 9 } },
  { id: 'bicep-l', muscleGroup: 'biceps', shape: 'rect', attrs: { x: 15, y: 62, width: 10, height: 24, rx: 5 } },
  { id: 'bicep-r', muscleGroup: 'biceps', shape: 'rect', attrs: { x: 75, y: 62, width: 10, height: 24, rx: 5 } },
  { id: 'quad-l', muscleGroup: 'quads', shape: 'rect', attrs: { x: 33, y: 116, width: 16, height: 46, rx: 6 } },
  { id: 'quad-r', muscleGroup: 'quads', shape: 'rect', attrs: { x: 51, y: 116, width: 16, height: 46, rx: 6 } },
  { id: 'calf-fl', muscleGroup: 'calves', shape: 'rect', attrs: { x: 34, y: 166, width: 14, height: 34, rx: 5 } },
  { id: 'calf-fr', muscleGroup: 'calves', shape: 'rect', attrs: { x: 52, y: 166, width: 14, height: 34, rx: 5 } },
]

const BACK_REGIONS = [
  { id: 'head-b', shape: 'ellipse', attrs: { cx: 50, cy: 14, rx: 12, ry: 13 } },
  { id: 'neck-b', shape: 'rect', attrs: { x: 45, y: 27, width: 10, height: 8, rx: 2 } },
  { id: 'forearm-bl', muscleGroup: 'forearms', shape: 'rect', attrs: { x: 14, y: 88, width: 9, height: 20, rx: 4 } },
  { id: 'forearm-br', muscleGroup: 'forearms', shape: 'rect', attrs: { x: 77, y: 88, width: 9, height: 20, rx: 4 } },
  { id: 'trap-l', muscleGroup: 'mid_back', shape: 'rect', attrs: { x: 30, y: 36, width: 14, height: 16, rx: 4 } },
  { id: 'trap-r', muscleGroup: 'mid_back', shape: 'rect', attrs: { x: 56, y: 36, width: 14, height: 16, rx: 4 } },
  { id: 'rdelt-l', muscleGroup: 'shoulders', shape: 'ellipse', attrs: { cx: 24, cy: 52, rx: 9, ry: 9 } },
  { id: 'rdelt-r', muscleGroup: 'shoulders', shape: 'ellipse', attrs: { cx: 76, cy: 52, rx: 9, ry: 9 } },
  { id: 'rhomboid', muscleGroup: 'mid_back', shape: 'rect', attrs: { x: 37, y: 52, width: 26, height: 26, rx: 4 } },
  { id: 'lat-l', muscleGroup: 'lats', shape: 'rect', attrs: { x: 22, y: 58, width: 14, height: 36, rx: 5 } },
  { id: 'lat-r', muscleGroup: 'lats', shape: 'rect', attrs: { x: 64, y: 58, width: 14, height: 36, rx: 5 } },
  { id: 'tri-l', muscleGroup: 'triceps', shape: 'rect', attrs: { x: 14, y: 62, width: 9, height: 26, rx: 4 } },
  { id: 'tri-r', muscleGroup: 'triceps', shape: 'rect', attrs: { x: 77, y: 62, width: 9, height: 26, rx: 4 } },
  { id: 'glute', muscleGroup: 'glutes', shape: 'rect', attrs: { x: 32, y: 106, width: 36, height: 24, rx: 6 } },
  { id: 'ham-l', muscleGroup: 'hamstrings', shape: 'rect', attrs: { x: 33, y: 132, width: 16, height: 40, rx: 6 } },
  { id: 'ham-r', muscleGroup: 'hamstrings', shape: 'rect', attrs: { x: 51, y: 132, width: 16, height: 40, rx: 6 } },
  { id: 'calf-bl', muscleGroup: 'calves', shape: 'rect', attrs: { x: 34, y: 176, width: 14, height: 30, rx: 5 } },
  { id: 'calf-br', muscleGroup: 'calves', shape: 'rect', attrs: { x: 52, y: 176, width: 14, height: 30, rx: 5 } },
]

const STATUS_COLORS = {
  none:    (o) => `rgba(51,51,51,${o})`,
  low:     (o) => `rgba(245,166,35,${0.6 * o})`,
  optimal: (o) => `rgba(200,245,90,${0.75 * o})`,
  high:    (o) => `rgba(255,92,92,${0.55 * o})`,
}

const STATUS_DOT_COLORS = {
  none:    '#555555',
  low:     '#f5a623',
  optimal: '#C8F55A',
  high:    '#ff5c5c',
}

const STATUS_LABELS = {
  none:    'Not trained',
  low:     'Below target',
  optimal: 'On track',
  high:    'Overloaded',
}

const DECORATIVE_FILL   = '#1e1e1e'
const DECORATIVE_STROKE = '#2a2a2a'

const ALL_MUSCLE_GROUPS = Object.keys(VOLUME_THRESHOLDS)

const STATUS_LEGEND = [
  { color: '#333333',               label: 'Not trained this week' },
  { color: 'rgba(245,166,35,0.6)',  label: 'Below target volume' },
  { color: 'rgba(200,245,90,0.75)', label: 'Optimal volume' },
  { color: 'rgba(255,92,92,0.55)',  label: 'Overdue or overtrained' },
]

function regionFill(muscleGroup, volumeMap) {
  if (!muscleGroup) return DECORATIVE_FILL
  const row = volumeMap[muscleGroup]
  const sets = row?.total_sets || 0
  const status = getVolumeStatus(muscleGroup, sets)
  let opacity = 1
  if (row?.updated_at) {
    const daysSince = (Date.now() - new Date(row.updated_at).getTime()) / 86400000
    if (daysSince > 3) opacity = 0.7
  }
  return (STATUS_COLORS[status] || STATUS_COLORS.none)(opacity)
}

// ─── BodySVG ─────────────────────────────────────────────────────────────────

function BodySVG({ regions, label, volumeMap, selectedMuscle, onMuscleClick }) {
  const [hoveredId, setHoveredId] = useState(null)

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '6px' }}>
        {label}
      </div>
      <svg viewBox="0 0 100 210" width="110" height="231" style={{ display: 'block', margin: '0 auto' }}>
        {regions.map(r => {
          const isInteractive = !!r.muscleGroup
          const isSelected    = r.muscleGroup === selectedMuscle
          const isHovered     = r.id === hoveredId && isInteractive

          const fill   = regionFill(r.muscleGroup, volumeMap)
          const stroke = isSelected
            ? 'rgba(255,255,255,0.55)'
            : isHovered
              ? 'rgba(255,255,255,0.28)'
              : isInteractive ? 'rgba(255,255,255,0.06)' : DECORATIVE_STROKE

          const common = {
            fill,
            stroke,
            strokeWidth: isSelected ? 1.4 : 0.8,
            cursor:  isInteractive ? 'pointer' : 'default',
            opacity: isHovered ? 0.82 : 1,
            transition: 'opacity 0.1s',
          }

          const handlers = isInteractive
            ? {
                onMouseEnter: () => setHoveredId(r.id),
                onMouseLeave: () => setHoveredId(null),
                onClick:      () => onMuscleClick(r.muscleGroup),
              }
            : {}

          if (r.shape === 'ellipse') return <ellipse key={r.id} {...r.attrs} {...common} {...handlers} />
          return <rect key={r.id} {...r.attrs} {...common} {...handlers} />
        })}
      </svg>
    </div>
  )
}

// ─── EditPanel ────────────────────────────────────────────────────────────────

function EditPanel({ muscleGroup, volumeMap, userId, onClose, onUpdate, onOpenLogger }) {
  const t       = VOLUME_THRESHOLDS[muscleGroup] || { min: 10, max: 20 }
  const row     = volumeMap[muscleGroup]
  const current = row?.total_sets || 0
  const status  = getVolumeStatus(muscleGroup, current)

  const saveTimerRef = useRef(null)

  const persist = useCallback((sets) => {
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      setVolumeManual(userId, muscleGroup, sets)
    }, 400)
  }, [userId, muscleGroup])

  useEffect(() => () => clearTimeout(saveTimerRef.current), [])

  function adjust(delta) {
    const next = Math.max(0, current + delta)
    onUpdate(muscleGroup, next)
    persist(next)
  }

  function setPreset(sets) {
    onUpdate(muscleGroup, sets)
    persist(sets)
  }

  const presets = [
    { label: 'None',    sets: 0,                       status: 'none' },
    { label: 'Light',   sets: Math.floor(t.min * 0.7), status: 'low' },
    { label: 'Trained', sets: t.min,                   status: 'optimal' },
    { label: 'Max',     sets: t.max,                   status: 'optimal' },
  ]

  const name = muscleGroup.replace(/_/g, ' ')

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.4)' }}
      />

      {/* panel */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '440px',
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        borderRadius: '16px 16px 0 0', padding: '20px 24px 32px',
        zIndex: 41, boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
      }}>
        {/* drag handle */}
        <div style={{ width: '36px', height: '4px', background: 'var(--border2)', borderRadius: '2px', margin: '0 auto 16px' }} />

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '22px', letterSpacing: '0.04em', textTransform: 'capitalize' }}>
              {name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: STATUS_DOT_COLORS[status] }} />
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{STATUS_LABELS[status]}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer', padding: '4px', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* set count adjuster */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', marginBottom: '20px' }}>
          <button
            onClick={() => adjust(-2)}
            style={adjBtnStyle}
          >
            −
          </button>
          <div style={{ textAlign: 'center', minWidth: '80px' }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '40px', letterSpacing: '0.04em', lineHeight: 1, color: STATUS_DOT_COLORS[status] }}>
              {current}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--dim)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              sets · target {t.min}–{t.max}
            </div>
          </div>
          <button
            onClick={() => adjust(2)}
            style={adjBtnStyle}
          >
            +
          </button>
        </div>

        {/* quick presets */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
          {presets.map(p => {
            const isActive = current === p.sets
            return (
              <button
                key={p.label}
                onClick={() => setPreset(p.sets)}
                style={{
                  padding: '8px 0',
                  background: isActive ? `${STATUS_DOT_COLORS[p.status]}22` : 'var(--surface2, #1a1a1a)',
                  border: `1px solid ${isActive ? STATUS_DOT_COLORS[p.status] : 'var(--border)'}`,
                  borderRadius: '8px',
                  color: isActive ? STATUS_DOT_COLORS[p.status] : 'var(--muted)',
                  fontSize: '11px', fontWeight: '600', letterSpacing: '0.04em',
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
              >
                <div>{p.label}</div>
                <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '2px' }}>{p.sets} sets</div>
              </button>
            )
          })}
        </div>

        {/* log full workout link */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', textAlign: 'center' }}>
          <button
            onClick={onOpenLogger}
            style={{
              background: 'none', border: '1px solid var(--border2)', borderRadius: '8px',
              color: 'var(--text)', fontSize: '13px', fontWeight: '500',
              cursor: 'pointer', padding: '9px 20px', fontFamily: 'inherit', width: '100%',
            }}
          >
            Log a full workout instead →
          </button>
        </div>
      </div>
    </>
  )
}

const adjBtnStyle = {
  width: '44px', height: '44px',
  background: 'var(--surface2, #1a1a1a)', border: '1px solid var(--border2)',
  borderRadius: '50%', color: 'var(--text)', fontSize: '22px', fontWeight: '300',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit', lineHeight: 1,
}

// ─── MuscleHeatmap ────────────────────────────────────────────────────────────

export default function MuscleHeatmap({ userId }) {
  const [volumeMap, setVolumeMap]           = useState({})
  const [loading, setLoading]               = useState(true)
  const [selectedMuscle, setSelectedMuscle] = useState(null)
  const [showLogger, setShowLogger]         = useState(false)
  const isMobile = useIsMobile()

  function loadVolume() {
    if (!userId) return
    getWeeklyVolume(userId).then(rows => {
      const map = {}
      rows.forEach(r => { map[r.muscle_group] = r })
      setVolumeMap(map)
      setLoading(false)
    })
  }

  useEffect(() => { loadVolume() }, [userId])

  function handleMuscleClick(muscleGroup) {
    setSelectedMuscle(prev => prev === muscleGroup ? null : muscleGroup)
  }

  function handleUpdate(muscleGroup, newSets) {
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

  const logBtn = (
    <button
      onClick={() => { setSelectedMuscle(null); setShowLogger(true) }}
      style={{
        padding: '7px 14px', background: 'var(--accent)', border: 'none',
        borderRadius: '7px', color: '#0a0a0a', fontSize: '12px', fontWeight: '700',
        cursor: 'pointer', letterSpacing: '0.02em', fontFamily: 'inherit',
        flexShrink: 0,
      }}
    >
      + Log Workout
    </button>
  )

  return (
    <div>
      {/* header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)' }}>
          Tap a muscle to adjust
        </div>
        {logBtn}
      </div>

      {isMobile ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', marginBottom: '16px' }}>
            <BodySVG regions={FRONT_REGIONS} label="Front" volumeMap={volumeMap} selectedMuscle={selectedMuscle} onMuscleClick={handleMuscleClick} />
            <BodySVG regions={BACK_REGIONS}  label="Back"  volumeMap={volumeMap} selectedMuscle={selectedMuscle} onMuscleClick={handleMuscleClick} />
          </div>
          <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '8px' }}>
            This week
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
            {ALL_MUSCLE_GROUPS.map(mg => {
              const row    = volumeMap[mg]
              const sets   = row?.total_sets || 0
              const status = getVolumeStatus(mg, sets)
              const t      = VOLUME_THRESHOLDS[mg]
              const isSelected = mg === selectedMuscle
              return (
                <div
                  key={mg}
                  onClick={() => handleMuscleClick(mg)}
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
        </>
      ) : (
        <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '24px' }}>
            <BodySVG regions={FRONT_REGIONS} label="Front" volumeMap={volumeMap} selectedMuscle={selectedMuscle} onMuscleClick={handleMuscleClick} />
            <BodySVG regions={BACK_REGIONS}  label="Back"  volumeMap={volumeMap} selectedMuscle={selectedMuscle} onMuscleClick={handleMuscleClick} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '10px' }}>
              This week
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {ALL_MUSCLE_GROUPS.map(mg => {
                const row    = volumeMap[mg]
                const sets   = row?.total_sets || 0
                const status = getVolumeStatus(mg, sets)
                const t      = VOLUME_THRESHOLDS[mg]
                const isSelected = mg === selectedMuscle
                return (
                  <div
                    key={mg}
                    onClick={() => handleMuscleClick(mg)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px',
                      cursor: 'pointer', padding: '4px 6px', borderRadius: '6px',
                      background: isSelected ? 'var(--surface2, rgba(255,255,255,0.05))' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_DOT_COLORS[status], flexShrink: 0 }} />
                    <span style={{ color: 'var(--text)', flex: 1, textTransform: 'capitalize' }}>{mg.replace(/_/g, ' ')}</span>
                    <span style={{ color: 'var(--muted)', fontSize: '11px' }}>{sets} / {t.min}–{t.max}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* legend */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '16px', flexWrap: 'wrap' }}>
        {STATUS_LEGEND.map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted)' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: color, flexShrink: 0 }} />
            {label}
          </div>
        ))}
      </div>

      {/* edit panel */}
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

      {/* manual workout logger */}
      {showLogger && (
        <ManualWorkoutLogger
          onClose={() => setShowLogger(false)}
          onSaved={() => { setShowLogger(false); loadVolume() }}
        />
      )}
    </div>
  )
}
