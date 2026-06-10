import React, { useState, useEffect, useCallback } from 'react'
import { callGemini } from '../lib/gemini'
import { useIsMobile } from '../hooks/useIsMobile'
import { supabase } from '../lib/supabase'

async function searchExerciseDB(query: string) {
  const encoded = encodeURIComponent(query.toLowerCase())
  const { data, error } = await supabase.functions.invoke('rapidapi-proxy', {
    body: { endpoint: `/exercises/name/${encoded}`, params: { limit: '5', offset: '0' } },
  })
  if (error || !data) return null
  return Array.isArray(data) && data.length > 0 ? data[0] : null
}

async function fetchSteps(name: string): Promise<string[]> {
  const clean = name.replace(/\s*\(.*?\)/g, '').trim()

  let exercise = null
  try { exercise = await searchExerciseDB(clean) } catch { /* ignore */ }

  if (!exercise) {
    const firstTwo = clean.split(' ').slice(0, 2).join(' ')
    if (firstTwo !== clean) {
      try { exercise = await searchExerciseDB(firstTwo) } catch { /* ignore */ }
    }
  }

  if (exercise?.instructions?.length) return exercise.instructions as string[]

  // Fallback: generate with Groq
  const result = await callGemini(
    `Provide exactly 5 clear step-by-step instructions for performing the "${name}" exercise with proper form. Be concise — one sentence per step. Return JSON: { "steps": ["step 1", "step 2", "step 3", "step 4", "step 5"] }`
  )
  return Array.isArray(result?.steps) ? result.steps as string[] : []
}

export default function ExerciseModal({ exerciseName, onClose }: { exerciseName: string; onClose: () => void }) {
  const [steps, setSteps] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const isMobile = useIsMobile()

  useEffect(() => {
    let cancelled = false
    setSteps([])
    setLoading(true)

    fetchSteps(exerciseName)
      .then(s => { if (!cancelled) { setSteps(s); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [exerciseName])

  const handleBackdrop = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const modalStyle: React.CSSProperties = isMobile
    ? { ...s.modal, maxWidth: '100%', width: '100%', maxHeight: '92vh', borderRadius: '20px 20px 0 0', position: 'fixed', bottom: 0, left: 0, right: 0 }
    : s.modal

  return (
    <div style={{ ...s.backdrop, alignItems: isMobile ? 'flex-end' : 'center' }} onClick={handleBackdrop}>
      <div style={modalStyle}>
        <div style={s.header}>
          <h2 style={s.title}>{exerciseName}</h2>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={s.body}>
          <p style={s.stepsLabel}>HOW TO PERFORM</p>
          {loading ? (
            <div style={s.stepsLoading}>
              {[95, 80, 92, 75, 88, 70, 85].map((w, i) => (
                <div key={i} style={{ ...s.stepSkeleton, width: `${w}%` }} />
              ))}
            </div>
          ) : steps.length === 0 ? (
            <p style={s.errorText}>Could not load instructions.</p>
          ) : (
            <ol style={s.stepsList}>
              {steps.map((step, i) => (
                <li key={i} style={s.stepItem}>
                  <span style={s.stepNum}>{i + 1}</span>
                  <span style={s.stepText}>{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px',
    backdropFilter: 'blur(4px)',
  },
  modal: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '14px',
    width: '100%', maxWidth: '520px', maxHeight: '85vh',
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  title: {
    fontFamily: 'Bebas Neue, sans-serif',
    fontSize: '22px', letterSpacing: '0.05em',
    color: 'var(--text)', margin: 0,
  },
  closeBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--muted)', fontSize: '16px',
    padding: '4px 8px', borderRadius: '6px',
  },
  body: {
    overflowY: 'auto', padding: '22px 24px',
  },
  stepsLabel: {
    fontSize: '10px', fontWeight: '700', letterSpacing: '0.12em',
    color: 'var(--accent)', margin: '0 0 18px',
  },
  stepsList: {
    listStyle: 'none', margin: 0, padding: 0,
    display: 'flex', flexDirection: 'column', gap: '14px',
  },
  stepItem: {
    display: 'flex', gap: '14px', alignItems: 'flex-start',
  },
  stepNum: {
    flexShrink: 0,
    width: '24px', height: '24px', borderRadius: '50%',
    background: 'var(--accent-dim)',
    border: '1px solid rgba(200,245,90,0.3)',
    color: 'var(--accent)',
    fontSize: '11px', fontWeight: '700',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  stepText: {
    fontSize: '13px', color: 'var(--muted)',
    lineHeight: '1.7', paddingTop: '3px',
  },
  stepsLoading: {
    display: 'flex', flexDirection: 'column', gap: '16px',
  },
  stepSkeleton: {
    height: '13px', borderRadius: '6px',
    background: 'var(--border)',
    animation: 'pulse 1.4s ease-in-out infinite',
  },
  errorText: { fontSize: '13px', color: 'var(--dim)' },
}
