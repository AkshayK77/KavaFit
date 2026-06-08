import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { generateAndSavePlan } from '../lib/workoutPlan'
import { prewarmGymsCache } from '../lib/gymCache'
import { track } from '../lib/analytics'

const TOTAL_STEPS = 5

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
  },
  container: {
    width: '100%',
    maxWidth: '540px',
  },
  pipBar: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
    marginBottom: '40px',
  },
  pip: {
    height: '4px',
    borderRadius: '2px',
    background: 'var(--surface3)',
    flex: 1,
    transition: 'background 0.25s',
  },
  pipActive: {
    background: 'var(--accent)',
  },
  heading: {
    fontFamily: 'Bebas Neue, sans-serif',
    fontSize: '32px',
    letterSpacing: '0.04em',
    marginBottom: '6px',
  },
  subheading: {
    fontSize: '14px',
    color: 'var(--muted)',
    marginBottom: '28px',
  },
  row3: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '14px',
    marginBottom: '28px',
  },
  numField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  numLabel: {
    fontSize: '10px',
    fontWeight: '500',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
  },
  numInput: {
    padding: '12px 14px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text)',
    fontSize: '16px',
    outline: 'none',
    width: '100%',
    transition: 'border-color 0.15s',
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '28px',
  },
  optCard: {
    padding: '16px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    textAlign: 'left',
  },
  optCardActive: {
    background: 'var(--accent-dim)',
    borderColor: 'var(--accent)',
  },
  optIcon: {
    fontSize: '22px',
    marginBottom: '8px',
    display: 'block',
  },
  optTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text)',
    marginBottom: '3px',
  },
  optSub: {
    fontSize: '12px',
    color: 'var(--muted)',
  },
  sessRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '28px',
  },
  sessBtn: {
    flex: 1,
    padding: '12px 0',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--muted)',
    fontSize: '15px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  sessBtnActive: {
    background: 'var(--accent-dim)',
    borderColor: 'var(--accent)',
    color: 'var(--accent)',
  },
  textArea: {
    width: '100%',
    padding: '12px 14px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text)',
    fontSize: '14px',
    outline: 'none',
    resize: 'vertical',
    minHeight: '80px',
    marginBottom: '28px',
    transition: 'border-color 0.15s',
    fontFamily: 'DM Sans, sans-serif',
  },
  areaLabel: {
    fontSize: '12px',
    color: 'var(--muted)',
    marginBottom: '8px',
    display: 'block',
  },
  continueBtn: {
    width: '100%',
    padding: '13px',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: '10px',
    color: '#0a0a0a',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  saving: {
    textAlign: 'center',
    color: 'var(--muted)',
    fontSize: '14px',
    padding: '20px 0',
  },
}

export default function OnboardingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  const [basics, setBasics] = useState({ age: '', weight: '', height: '', city: '' })
  const [goal, setGoal] = useState('')
  const [experience, setExperience] = useState('')
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number | null>(null)
  const [equipment, setEquipment] = useState('')
  const [injuries, setInjuries] = useState('')
  const [diet, setDiet] = useState('')
  const [allergies, setAllergies] = useState('')

  function next() {
    setStep(s => s + 1)
  }

  async function handleFinish() {
    setSaving(true)
    const profile = {
      id: user!.id,
      age: parseInt(basics.age) || null,
      weight_kg: parseFloat(basics.weight) || null,
      height_cm: parseFloat(basics.height) || null,
      fitness_goal: goal || null,
      experience_level: experience || null,
      sessions_per_week: sessionsPerWeek,
      equipment_available: equipment || null,
      injuries: injuries || null,
      dietary_preference: diet || null,
      allergies: allergies || null,
      city: basics.city.trim() || null,
      onboarding_complete: true,
      updated_at: new Date().toISOString(),
    }

    await (supabase.from('profiles') as any).upsert(profile)

    // Pre-warm gym map cache in the background so the map is ready on first open
    if (basics.city.trim()) {
      prewarmGymsCache(basics.city.trim())
    }

    try {
      await generateAndSavePlan(user!.id, profile as any)
    } catch (e) {
      console.error('Plan generation failed:', e)
      // Non-fatal — user can generate plan from workout page
    }

    track('onboarding_completed')
    navigate('/dashboard')
  }

  const PipBar = () => (
    <div style={s.pipBar}>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div
          key={i}
          style={{ ...s.pip, ...(i < step ? s.pipActive : {}) }}
        />
      ))}
    </div>
  )

  const OptCard = ({ value, current, onChange, icon, title, sub }: { value: string; current: string; onChange: (v: string) => void; icon?: string; title: string; sub?: string }) => {
    const active = current === value
    return (
      <div
        style={{ ...s.optCard, ...(active ? s.optCardActive : {}) }}
        onClick={() => onChange(value)}
        role="button"
      >
        {icon && <span style={s.optIcon}>{icon}</span>}
        <div style={s.optTitle}>{title}</div>
        {sub && <div style={s.optSub}>{sub}</div>}
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.container}>
        <PipBar />

        {step === 1 && (
          <div>
            <h1 style={s.heading}>Let's get started</h1>
            <p style={s.subheading}>Tell us a bit about yourself so we can personalise your experience.</p>
            <div style={s.row3}>
              {[
                { key: 'age', label: 'Age', placeholder: '25' },
                { key: 'weight', label: 'Weight (kg)', placeholder: '75' },
                { key: 'height', label: 'Height (cm)', placeholder: '178' },
              ].map(({ key, label, placeholder }) => (
                <div style={s.numField} key={key}>
                  <label style={s.numLabel}>{label}</label>
                  <input
                    type="number"
                    placeholder={placeholder}
                    value={(basics as Record<string, string>)[key]}
                    onChange={e => setBasics(b => ({ ...b, [key]: e.target.value }))}
                    style={s.numInput}
                    onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                  />
                </div>
              ))}
            </div>
            <div style={s.numField}>
              <label style={s.numLabel}>Your city / area</label>
              <input
                type="text"
                placeholder="e.g. Koramangala, Bangalore"
                value={basics.city}
                onChange={e => setBasics(b => ({ ...b, city: e.target.value }))}
                style={{ ...s.numInput, fontSize: '14px' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>Used to find gyms near you</span>
            </div>
            <button style={{ ...s.continueBtn, marginTop: '28px' }} onClick={next}>Continue</button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h1 style={s.heading}>What's your main goal?</h1>
            <p style={s.subheading}>We'll build everything around this.</p>
            <div style={s.grid2}>
              <OptCard value="build_muscle" current={goal} onChange={setGoal} icon="💪" title="Build muscle" sub="Size and strength" />
              <OptCard value="lose_fat" current={goal} onChange={setGoal} icon="🔥" title="Lose fat" sub="Lean out and tone" />
              <OptCard value="improve_fitness" current={goal} onChange={setGoal} icon="⚡" title="Improve fitness" sub="Endurance and health" />
              <OptCard value="maintain" current={goal} onChange={setGoal} icon="⚖️" title="Maintain" sub="Stay where I am" />
            </div>
            <button style={{ ...s.continueBtn, opacity: goal ? 1 : 0.45 }} onClick={next} disabled={!goal}>Continue</button>
          </div>
        )}

        {step === 3 && (
          <div>
            <h1 style={s.heading}>Experience and schedule</h1>
            <p style={s.subheading}>Help us set the right intensity and volume.</p>
            <div style={s.grid2}>
              <OptCard value="beginner" current={experience} onChange={setExperience} title="Beginner" sub="Under 1 year" />
              <OptCard value="intermediate" current={experience} onChange={setExperience} title="Intermediate" sub="1–3 years" />
              <OptCard value="advanced" current={experience} onChange={setExperience} title="Advanced" sub="3+ years" />
              <OptCard value="returning" current={experience} onChange={setExperience} title="Returning" sub="Getting back in" />
            </div>
            <p style={{ ...s.subheading, marginBottom: '12px' }}>Sessions per week</p>
            <div style={s.sessRow}>
              {[2, 3, 4, 5, 6].map(n => (
                <button
                  key={n}
                  style={{ ...s.sessBtn, ...(sessionsPerWeek === n ? s.sessBtnActive : {}) }}
                  onClick={() => setSessionsPerWeek(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              style={{ ...s.continueBtn, opacity: (experience && sessionsPerWeek) ? 1 : 0.45 }}
              onClick={next}
              disabled={!experience || !sessionsPerWeek}
            >
              Continue
            </button>
          </div>
        )}

        {step === 4 && (
          <div>
            <h1 style={s.heading}>Equipment and injuries</h1>
            <p style={s.subheading}>We'll only suggest exercises you can actually do.</p>
            <div style={s.grid2}>
              <OptCard value="full_gym" current={equipment} onChange={setEquipment} icon="🏋️" title="Full gym" sub="Barbells, cables, machines" />
              <OptCard value="dumbbells_only" current={equipment} onChange={setEquipment} icon="🪨" title="Dumbbells only" sub="Home or limited gym" />
              <OptCard value="bodyweight" current={equipment} onChange={setEquipment} icon="🤸" title="Bodyweight" sub="No equipment" />
              <OptCard value="bands_and_dbs" current={equipment} onChange={setEquipment} icon="🔗" title="Bands + DBs" sub="Home setup" />
            </div>
            <label style={s.areaLabel}>Any injuries or areas to avoid? (optional)</label>
            <textarea
              style={s.textArea}
              placeholder="e.g. lower back pain, left knee issues…"
              value={injuries}
              onChange={e => setInjuries(e.target.value)}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <button
              style={{ ...s.continueBtn, opacity: equipment ? 1 : 0.45 }}
              onClick={next}
              disabled={!equipment}
            >
              Continue
            </button>
          </div>
        )}

        {step === 5 && (
          <div>
            <h1 style={s.heading}>Dietary preferences</h1>
            <p style={s.subheading}>We'll tailor your nutrition recommendations accordingly.</p>
            <div style={s.grid2}>
              <OptCard value="none" current={diet} onChange={setDiet} icon="🍽️" title="No restrictions" sub="Eat everything" />
              <OptCard value="vegetarian" current={diet} onChange={setDiet} icon="🥗" title="Vegetarian" sub="No meat" />
              <OptCard value="vegan" current={diet} onChange={setDiet} icon="🌱" title="Vegan" sub="Plant-based" />
              <OptCard value="halal_kosher" current={diet} onChange={setDiet} icon="🕌" title="Halal / Kosher" sub="Dietary laws" />
            </div>
            <label style={s.areaLabel}>Any allergies? (optional)</label>
            <textarea
              style={s.textArea}
              placeholder="e.g. nuts, gluten, dairy…"
              value={allergies}
              onChange={e => setAllergies(e.target.value)}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            {saving ? (
              <p style={s.saving}>Generating your personalised plan…</p>
            ) : (
              <button
                style={{ ...s.continueBtn, opacity: diet ? 1 : 0.45 }}
                onClick={diet ? handleFinish : undefined}
                disabled={!diet || saving}
              >
                Generate my plan →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
