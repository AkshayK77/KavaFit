import { useState, useEffect } from 'react'
import { getWeeklyVolume, getVolumeStatus, VOLUME_THRESHOLDS } from '../lib/volumeTracker'
import { useIsMobile } from '../hooks/useIsMobile'

// ─── region definitions ──────────────────────────────────────────────────────

const FRONT_REGIONS = [
  // decorative
  { id: 'head-f', shape: 'ellipse', attrs: { cx: 50, cy: 14, rx: 12, ry: 13 } },
  { id: 'neck-f', shape: 'rect', attrs: { x: 45, y: 27, width: 10, height: 8, rx: 2 } },
  { id: 'abs', shape: 'rect', attrs: { x: 37, y: 71, width: 26, height: 30, rx: 4 } },
  { id: 'hip-l', shape: 'rect', attrs: { x: 32, y: 102, width: 14, height: 12, rx: 3 } },
  { id: 'hip-r', shape: 'rect', attrs: { x: 54, y: 102, width: 14, height: 12, rx: 3 } },
  { id: 'forearm-l', muscleGroup: 'forearms', shape: 'rect', attrs: { x: 14, y: 88, width: 9, height: 20, rx: 4 } },
  { id: 'forearm-r', muscleGroup: 'forearms', shape: 'rect', attrs: { x: 77, y: 88, width: 9, height: 20, rx: 4 } },
  // muscle groups
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
  // decorative
  { id: 'head-b', shape: 'ellipse', attrs: { cx: 50, cy: 14, rx: 12, ry: 13 } },
  { id: 'neck-b', shape: 'rect', attrs: { x: 45, y: 27, width: 10, height: 8, rx: 2 } },
  { id: 'forearm-bl', muscleGroup: 'forearms', shape: 'rect', attrs: { x: 14, y: 88, width: 9, height: 20, rx: 4 } },
  { id: 'forearm-br', muscleGroup: 'forearms', shape: 'rect', attrs: { x: 77, y: 88, width: 9, height: 20, rx: 4 } },
  // muscle groups
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
  none: (opacity) => `rgba(51,51,51,${opacity})`,
  low: (opacity) => `rgba(245,166,35,${0.6 * opacity})`,
  optimal: (opacity) => `rgba(200,245,90,${0.75 * opacity})`,
  high: (opacity) => `rgba(255,92,92,${0.55 * opacity})`,
}

const DECORATIVE_FILL = '#1e1e1e'
const DECORATIVE_STROKE = '#2a2a2a'

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

function BodySVG({ regions, label, volumeMap }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '6px' }}>
        {label}
      </div>
      <svg viewBox="0 0 100 210" width="110" height="231" style={{ display: 'block', margin: '0 auto' }}>
        {regions.map(r => {
          const fill = regionFill(r.muscleGroup, volumeMap)
          const stroke = r.muscleGroup ? 'rgba(255,255,255,0.06)' : DECORATIVE_STROKE
          const common = { fill, stroke, strokeWidth: 0.8 }
          if (r.shape === 'ellipse') {
            return <ellipse key={r.id} {...r.attrs} {...common} />
          }
          return <rect key={r.id} {...r.attrs} {...common} />
        })}
      </svg>
    </div>
  )
}

const ALL_MUSCLE_GROUPS = Object.keys(VOLUME_THRESHOLDS)

const STATUS_LEGEND = [
  { color: '#333333', label: 'Not trained this week' },
  { color: 'rgba(245,166,35,0.6)', label: 'Below target volume' },
  { color: 'rgba(200,245,90,0.75)', label: 'Optimal volume' },
  { color: 'rgba(255,92,92,0.55)', label: 'Overdue or overtrained' },
]

const STATUS_DOT_COLORS = {
  none: '#555555',
  low: '#f5a623',
  optimal: '#C8F55A',
  high: '#ff5c5c',
}

// ─── component ────────────────────────────────────────────────────────────────

export default function MuscleHeatmap({ userId }) {
  const [volumeMap, setVolumeMap] = useState({})
  const [loading, setLoading] = useState(true)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!userId) return
    getWeeklyVolume(userId).then(rows => {
      const map = {}
      rows.forEach(r => { map[r.muscle_group] = r })
      setVolumeMap(map)
      setLoading(false)
    })
  }, [userId])

  if (loading) {
    return <div style={{ color: 'var(--dim)', fontSize: '12px', padding: '20px 0' }}>Loading muscle data…</div>
  }

  return (
    <div>
      {isMobile ? (
        /* ── Mobile: bodies centered on top, grid list below ── */
        <>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', marginBottom: '16px' }}>
            <BodySVG regions={FRONT_REGIONS} label="Front" volumeMap={volumeMap} />
            <BodySVG regions={BACK_REGIONS} label="Back" volumeMap={volumeMap} />
          </div>
          <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '8px' }}>
            This week
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
            {ALL_MUSCLE_GROUPS.map(mg => {
              const row = volumeMap[mg]
              const sets = row?.total_sets || 0
              const status = getVolumeStatus(mg, sets)
              const t = VOLUME_THRESHOLDS[mg]
              return (
                <div key={mg} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: STATUS_DOT_COLORS[status], flexShrink: 0 }} />
                  <span style={{ color: 'var(--text)', textTransform: 'capitalize', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mg.replace(/_/g, ' ')}</span>
                  <span style={{ color: 'var(--muted)', fontSize: '10px', flexShrink: 0 }}>{sets}</span>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        /* ── Desktop: original side-by-side layout ── */
        <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '24px' }}>
            <BodySVG regions={FRONT_REGIONS} label="Front" volumeMap={volumeMap} />
            <BodySVG regions={BACK_REGIONS} label="Back" volumeMap={volumeMap} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '10px' }}>
              This week
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {ALL_MUSCLE_GROUPS.map(mg => {
                const row = volumeMap[mg]
                const sets = row?.total_sets || 0
                const status = getVolumeStatus(mg, sets)
                const t = VOLUME_THRESHOLDS[mg]
                return (
                  <div key={mg} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
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

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '16px', flexWrap: 'wrap' }}>
        {STATUS_LEGEND.map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted)' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: color, flexShrink: 0 }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}
