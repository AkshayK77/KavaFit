import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import { updateVolumeLog } from '../lib/volumeTracker'
import { classifyExercise } from '../lib/exerciseClassifier'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 60,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '20px',
  },
  card: {
    background: 'var(--surface2)', border: '1px solid var(--border2)',
    borderRadius: '14px', padding: '28px',
    maxWidth: '540px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: '20px',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '28px', letterSpacing: '0.04em', color: 'var(--accent)' },
  closeBtn: { background: 'none', border: 'none', color: 'var(--muted)', fontSize: '18px', cursor: 'pointer', padding: '0 4px', lineHeight: 1 },
  label: { fontSize: '11px', fontWeight: '700', letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '6px', display: 'block' },
  input: {
    width: '100%', padding: '9px 12px', boxSizing: 'border-box',
    background: 'var(--surface3)', border: '1px solid var(--border)',
    borderRadius: '8px', color: 'var(--text)', fontSize: '14px',
    outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.15s',
  },
  divider: { borderTop: '1px solid var(--border)', margin: '0' },
  searchWrap: { position: 'relative' },
  dropdown: {
    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 10,
    background: 'var(--surface3)', border: '1px solid var(--border2)',
    borderRadius: '8px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
  dropdownItem: {
    padding: '10px 14px', cursor: 'pointer', fontSize: '13px',
    borderBottom: '1px solid var(--border)', transition: 'background 0.1s',
  },
  dropdownCustom: {
    padding: '10px 14px', cursor: 'pointer', fontSize: '13px',
    color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px',
    transition: 'background 0.1s',
  },
  exBlock: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '10px', overflow: 'hidden',
  },
  exBlockHeader: {
    padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    borderBottom: '1px solid var(--border)',
  },
  exName: { fontSize: '14px', fontWeight: '600' },
  exMuscles: { fontSize: '11px', color: 'var(--accent)', marginTop: '2px' },
  exCustomBadge: { fontSize: '10px', color: 'var(--amber)', marginTop: '2px', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase' },
  removeExBtn: { background: 'none', border: 'none', color: 'var(--muted)', fontSize: '16px', cursor: 'pointer', lineHeight: 1 },
  setHeadRow: {
    display: 'grid', gridTemplateColumns: '36px 1fr 1fr 28px', gap: '8px',
    padding: '6px 14px', borderBottom: '1px solid var(--border)',
  },
  setColLabel: { fontSize: '10px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--dim)', textAlign: 'center' },
  setRow: {
    display: 'grid', gridTemplateColumns: '36px 1fr 1fr 28px', gap: '8px',
    padding: '5px 14px', alignItems: 'center',
  },
  setNum: { fontSize: '12px', color: 'var(--muted)', textAlign: 'center' },
  setInput: {
    padding: '5px 7px', background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: '6px', color: 'var(--text)', fontSize: '13px', outline: 'none',
    width: '100%', textAlign: 'center', fontFamily: 'inherit', transition: 'border-color 0.15s',
  },
  removeSetBtn: { background: 'none', border: 'none', color: 'var(--dim)', fontSize: '14px', cursor: 'pointer', textAlign: 'center' },
  addSetRow: { padding: '8px 14px', borderTop: '1px solid var(--border)' },
  addSetBtn: { background: 'none', border: 'none', color: 'var(--muted)', fontSize: '12px', cursor: 'pointer', padding: 0 },
  saveBtn: {
    padding: '12px', background: 'var(--accent)', border: 'none',
    borderRadius: '9px', color: '#0a0a0a', fontSize: '14px', fontWeight: '700',
    cursor: 'pointer', width: '100%', transition: 'opacity 0.15s',
  },
  saveBtnDisabled: { opacity: 0.45, pointerEvents: 'none' },
  emptyExercises: { fontSize: '13px', color: 'var(--dim)', textAlign: 'center', padding: '16px 0' },
}

export default function ManualWorkoutLogger({ onClose, onSaved }) {
  const { user } = useAuth()
  const { showToast } = useToast()

  const [sessionName, setSessionName] = useState('')
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [durationMinutes, setDurationMinutes] = useState('')
  const [exercises, setExercises] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [classifying, setClassifying] = useState({}) // tempId → true while classifying
  const searchTimeout = useRef(null)

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    clearTimeout(searchTimeout.current)
    setSearching(true)
    searchTimeout.current = setTimeout(async () => {
      const { data } = await supabase
        .from('exercises')
        .select('id, name, muscle_groups')
        .ilike('name', `%${searchQuery.trim()}%`)
        .limit(8)
      const already = new Set(exercises.map(e => e.exercise.id))
      setSearchResults((data || []).filter(ex => !already.has(ex.id)))
      setSearching(false)
    }, 280)
    return () => clearTimeout(searchTimeout.current)
  }, [searchQuery, exercises])

  function addExercise(ex) {
    setExercises(prev => [
      ...prev,
      { exercise: ex, sets: [{ weight: '', reps: '' }, { weight: '', reps: '' }, { weight: '', reps: '' }] },
    ])
    setSearchQuery('')
    setSearchResults([])
  }

  async function addCustomExercise(name) {
    const tempId = `__custom_${Date.now()}`
    const trimmed = name.trim()
    addExercise({ id: tempId, name: trimmed, muscle_groups: [], isCustom: true })
    setClassifying(prev => ({ ...prev, [tempId]: true }))
    const groups = await classifyExercise(trimmed)
    setExercises(prev => prev.map(ex =>
      ex.exercise.id === tempId
        ? { ...ex, exercise: { ...ex.exercise, muscle_groups: groups } }
        : ex
    ))
    setClassifying(prev => { const next = { ...prev }; delete next[tempId]; return next })
  }

  function removeExercise(idx) {
    setExercises(prev => prev.filter((_, i) => i !== idx))
  }

  function updateSet(exIdx, setIdx, field, value) {
    setExercises(prev => {
      const next = prev.map((ex, i) => {
        if (i !== exIdx) return ex
        const newSets = ex.sets.map((s, si) => si === setIdx ? { ...s, [field]: value } : s)
        return { ...ex, sets: newSets }
      })
      return next
    })
  }

  function addSet(exIdx) {
    setExercises(prev => prev.map((ex, i) =>
      i === exIdx ? { ...ex, sets: [...ex.sets, { weight: '', reps: '' }] } : ex
    ))
  }

  function removeSet(exIdx, setIdx) {
    setExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex
      if (ex.sets.length <= 1) return ex
      return { ...ex, sets: ex.sets.filter((_, si) => si !== setIdx) }
    }))
  }

  function isValid() {
    if (!sessionName.trim() || !selectedDate) return false
    return exercises.some(ex => ex.sets.some(s => String(s.reps || '').trim() !== ''))
  }

  async function resolveExerciseId(ex) {
    if (!ex.isCustom) return ex.id
    const { data: existing } = await supabase
      .from('exercises')
      .select('id')
      .ilike('name', ex.name)
      .limit(1)
      .maybeSingle()
    if (existing) return existing.id
    const { data: created, error } = await supabase
      .from('exercises')
      .insert({ name: ex.name, muscle_groups: ex.muscle_groups || [] })
      .select('id')
      .single()
    if (error) throw error
    return created.id
  }

  async function handleSave() {
    if (!isValid() || saving) return
    setSaving(true)
    try {
      const name = sessionName.trim()

      // Resolve any custom exercises to real DB IDs first
      const resolvedExercises = await Promise.all(
        exercises.map(async ex => ({
          ...ex,
          exercise: { ...ex.exercise, id: await resolveExerciseId(ex.exercise) },
        }))
      )

      const exerciseIds = resolvedExercises.map(ex => ex.exercise.id)

      const { data: sessionRow, error: sessionErr } = await supabase
        .from('sessions')
        .insert({
          user_id: user.id,
          date: selectedDate,
          name,
          plan_day_id: null,
          notes: JSON.stringify({ sessionName: name, generatedExerciseIds: exerciseIds }),
          completed_at: new Date(selectedDate + 'T12:00:00').toISOString(),
          duration_minutes: durationMinutes !== '' ? parseInt(durationMinutes) || null : null,
        })
        .select('id')
        .single()

      if (sessionErr) throw sessionErr

      const allInsertSets = []
      const setsForVolume = []

      resolvedExercises.forEach(ex => {
        ex.sets.forEach((s, si) => {
          const repsStr = String(s.reps || '').trim()
          if (!repsStr) return
          const repsNum = parseInt(repsStr)
          const weightNum = parseFloat(s.weight) || null
          allInsertSets.push({
            session_id: sessionRow.id,
            exercise_id: ex.exercise.id,
            set_number: si + 1,
            weight_kg: weightNum,
            reps: isNaN(repsNum) ? null : repsNum,
            completed: true,
          })
          setsForVolume.push({ muscle_groups: ex.exercise.muscle_groups || [] })
        })
      })

      if (allInsertSets.length > 0) {
        const { error: setsErr } = await supabase.from('session_sets').insert(allInsertSets)
        if (setsErr) throw setsErr
        await updateVolumeLog(user.id, setsForVolume, selectedDate)
      }

      showToast('Workout logged successfully', 'success')
      onSaved?.()
      onClose()
    } catch (err) {
      console.error('Failed to log manual workout:', err)
      showToast('Failed to save workout', 'error')
    } finally {
      setSaving(false)
    }
  }

  function formatMuscles(muscleGroups) {
    if (!muscleGroups?.length) return ''
    const unique = [...new Set(muscleGroups.map(m => m.split('_')[0]))]
    return unique.slice(0, 3).join(', ')
  }

  const trimmedQuery = searchQuery.trim()
  const showCustomOption = trimmedQuery.length > 1 && !searching &&
    !exercises.some(e => e.exercise.name.toLowerCase() === trimmedQuery.toLowerCase())
  const showDropdown = searching || searchResults.length > 0 || showCustomOption

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.card}>
        <div style={s.header}>
          <div>
            <div style={s.title}>Log Workout</div>
            <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
              Record a past or missed session
            </div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.divider} />

        {/* Session name + date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
          <div>
            <label style={s.label}>Session name</label>
            <input
              style={s.input}
              placeholder="e.g. Push Day, Upper Body…"
              value={sessionName}
              onChange={e => setSessionName(e.target.value)}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
          <div>
            <label style={s.label}>Date</label>
            <input
              type="date"
              style={{ ...s.input, width: 'auto' }}
              value={selectedDate}
              max={todayStr()}
              onChange={e => setSelectedDate(e.target.value)}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
        </div>

        {/* Duration */}
        <div>
          <label style={s.label}>Duration (optional)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="number"
              min="1"
              max="300"
              placeholder="—"
              style={{ ...s.input, width: '80px', textAlign: 'center' }}
              value={durationMinutes}
              onChange={e => setDurationMinutes(e.target.value)}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>minutes</span>
          </div>
        </div>

        <div style={s.divider} />

        {/* Exercise search */}
        <div>
          <label style={s.label}>Add exercises</label>
          <div style={s.searchWrap}>
            <input
              style={s.input}
              placeholder="Search or type any exercise name…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => { e.target.style.borderColor = 'var(--border)'; setTimeout(() => setSearchResults([]), 150) }}
            />
            {showDropdown && (
              <div style={s.dropdown}>
                {searching && (
                  <div style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--muted)' }}>
                    Searching…
                  </div>
                )}
                {searchResults.map(ex => (
                  <div
                    key={ex.id}
                    style={s.dropdownItem}
                    onMouseDown={() => addExercise(ex)}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ fontWeight: '500' }}>{ex.name}</div>
                    {ex.muscle_groups?.length > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                        {formatMuscles(ex.muscle_groups)}
                      </div>
                    )}
                  </div>
                ))}
                {showCustomOption && (
                  <div
                    style={s.dropdownCustom}
                    onMouseDown={() => addCustomExercise(trimmedQuery)}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontSize: '16px', lineHeight: 1 }}>+</span>
                    <span>Add "<strong>{trimmedQuery}</strong>" as new exercise</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Exercise blocks */}
        {exercises.length === 0 ? (
          <div style={s.emptyExercises}>Search above to add exercises, or type a name to create a custom one</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {exercises.map((ex, exIdx) => (
              <div key={ex.exercise.id} style={s.exBlock}>
                <div style={s.exBlockHeader}>
                  <div>
                    <div style={s.exName}>{ex.exercise.name}</div>
                    {ex.exercise.isCustom && (
                      classifying[ex.exercise.id]
                        ? <div style={s.exCustomBadge}>Identifying muscles…</div>
                        : ex.exercise.muscle_groups?.length > 0
                          ? <div style={s.exMuscles}>{ex.exercise.muscle_groups.join(', ')}</div>
                          : <div style={s.exCustomBadge}>Custom · no muscles identified</div>
                    )}
                    {!ex.exercise.isCustom && ex.exercise.muscle_groups?.length > 0 && (
                      <div style={s.exMuscles}>{formatMuscles(ex.exercise.muscle_groups)}</div>
                    )}
                  </div>
                  <button style={s.removeExBtn} onClick={() => removeExercise(exIdx)}>✕</button>
                </div>

                <div style={s.setHeadRow}>
                  <div style={s.setColLabel}>Set</div>
                  <div style={s.setColLabel}>Weight (kg)</div>
                  <div style={s.setColLabel}>Reps</div>
                  <div />
                </div>

                {ex.sets.map((set, setIdx) => (
                  <div key={setIdx} style={s.setRow}>
                    <div style={s.setNum}>{setIdx + 1}</div>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="—"
                      style={s.setInput}
                      value={set.weight}
                      onChange={e => updateSet(exIdx, setIdx, 'weight', e.target.value)}
                      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    />
                    <input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="—"
                      style={s.setInput}
                      value={set.reps}
                      onChange={e => updateSet(exIdx, setIdx, 'reps', e.target.value)}
                      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    />
                    <button
                      style={s.removeSetBtn}
                      onClick={() => removeSet(exIdx, setIdx)}
                      title="Remove set"
                    >✕</button>
                  </div>
                ))}

                <div style={s.addSetRow}>
                  <button style={s.addSetBtn} onClick={() => addSet(exIdx)}>+ Add set</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={s.divider} />

        <button
          style={{ ...s.saveBtn, ...(!isValid() || saving ? s.saveBtnDisabled : {}) }}
          onClick={handleSave}
          onMouseOver={e => isValid() && !saving && (e.currentTarget.style.opacity = '0.85')}
          onMouseOut={e => e.currentTarget.style.opacity = '1'}
        >
          {saving ? 'Saving…' : 'Save Workout'}
        </button>
      </div>
    </div>
  )
}
