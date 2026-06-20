import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { calcNutrition } from '../lib/workoutPlan'
import type { Profile } from '../types/supabase'
import { useToast } from '../components/Toast'

interface ProfileForm {
  full_name: string; age: string; weight_kg: string; height_cm: string
  fitness_goal: string; experience_level: string; sessions_per_week: string | number
  equipment_available: string; injuries: string; diet_type: string; allergies: string
}

const GOAL_OPTIONS = [
  { value: 'build_muscle', label: 'Build muscle' },
  { value: 'lose_fat', label: 'Lose fat' },
  { value: 'improve_fitness', label: 'Improve fitness' },
  { value: 'maintain', label: 'Maintain' },
]
const EXP_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]
const EQUIP_OPTIONS = [
  { value: 'full_gym', label: 'Full gym' },
  { value: 'dumbbells_only', label: 'Dumbbells only' },
  { value: 'bodyweight', label: 'Bodyweight only' },
  { value: 'bands_and_dbs', label: 'Bands & dumbbells' },
]

export default function SettingsPage() {
  const { user, setAvatarUrl: setGlobalAvatarUrl } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [profile, setProfile] = useState<Record<string, unknown> | null>(null)
  const [form, setForm] = useState<ProfileForm>({ full_name: '', age: '', weight_kg: '', height_cm: '', fitness_goal: 'build_muscle', experience_level: 'intermediate', sessions_per_week: 3, equipment_available: 'full_gym', injuries: '', diet_type: '', allergies: '' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    if (user) loadProfile()
  }, [user])

  async function loadProfile() {
    const { data: rawData } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
    const data = rawData as Profile | null
    if (data) {
      setProfile(data)
      setForm({
        full_name: data.full_name || '',
        age: data.age != null ? String(data.age) : '',
        weight_kg: data.weight_kg != null ? String(data.weight_kg) : '',
        height_cm: data.height_cm != null ? String(data.height_cm) : '',
        fitness_goal: data.fitness_goal || 'build_muscle',
        experience_level: data.experience_level || 'intermediate',
        sessions_per_week: data.sessions_per_week || 3,
        equipment_available: data.equipment_available || 'full_gym',
        injuries: data.injuries || '',
        diet_type: data.diet_type || '',
        allergies: data.allergies || '',
      })
      if (data.avatar_url) setAvatarUrl(data.avatar_url)
    }
  }

  function setField(key: keyof ProfileForm, value: string | number) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function validateForm() {
    const age = parseInt(form.age)
    const weight = parseFloat(form.weight_kg)
    const height = parseFloat(form.height_cm)
    if (form.age && (isNaN(age) || age < 10 || age > 120)) {
      showToast('Age must be between 10 and 120', 'error')
      return false
    }
    if (form.weight_kg && (isNaN(weight) || weight < 20 || weight > 400)) {
      showToast('Weight must be between 20 and 400 kg', 'error')
      return false
    }
    if (form.height_cm && (isNaN(height) || height < 50 || height > 300)) {
      showToast('Height must be between 50 and 300 cm', 'error')
      return false
    }
    return true
  }

  async function handleSave() {
    if (!validateForm()) return
    setSaving(true)
    try {
      const profileData: Record<string, unknown> = {
        ...form,
        age: form.age ? parseInt(form.age as string) : null,
        weight_kg: form.weight_kg ? parseFloat(form.weight_kg as string) : null,
        height_cm: form.height_cm ? parseFloat(form.height_cm as string) : null,
        sessions_per_week: parseInt(String(form.sessions_per_week)) || 3,
      }
      const nutrition = calcNutrition(profileData as unknown as Profile)
      if (nutrition.calories) {
        profileData.daily_calorie_target = nutrition.calories
        profileData.daily_protein_target = nutrition.protein
      }
      if (!profile?.onboarding_complete) {
        profileData.onboarding_complete = true
      }
      const { error } = await (supabase.from('profiles') as any).update(profileData).eq('id', user!.id)
      if (error) throw error
      setProfile(prev => ({ ...(prev ?? {}), ...profileData }))
      showToast('Profile saved', 'success')
    } catch (err) {
      console.error('Profile save error:', err)
      showToast(`Failed to save profile: ${(err as Error)?.message || String(err)}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be under 5MB', 'error')
      return
    }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${user!.id}/avatar.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      await (supabase.from('profiles') as any).update({ avatar_url: publicUrl }).eq('id', user!.id)
      setAvatarUrl(publicUrl)
      setGlobalAvatarUrl(publicUrl)
      showToast('Photo updated', 'success')
    } catch {
      showToast('Photo upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const [sessions, measurements, meals, photos] = await Promise.all([
        supabase.from('sessions').select('*, session_sets(*)').eq('user_id', user!.id),
        supabase.from('measurements').select('*').eq('user_id', user!.id),
        supabase.from('meal_history').select('*').eq('user_id', user!.id),
        supabase.from('progress_photos').select('*').eq('user_id', user!.id),
      ])
      const blob = new Blob([JSON.stringify({
        exported_at: new Date().toISOString(),
        profile,
        sessions: sessions.data || [],
        measurements: measurements.data || [],
        meal_history: meals.data || [],
        progress_photos: photos.data || [],
      }, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'kavafit_data_export.json'
      a.click()
      URL.revokeObjectURL(url)
      showToast('Export downloaded', 'success')
    } catch {
      showToast('Export failed', 'error')
    } finally {
      setExporting(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/')
  }

  const initials = (() => {
    const name = form.full_name || user?.email || ''
    if (!name) return 'U'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  })()

  return (
    <div style={s.page}>
      <h1 style={s.pageTitle}>Settings</h1>

      {/* Profile photo */}
      <section style={s.section}>
        <div style={s.sectionLabel}>Profile Photo</div>
        <div style={s.photoRow}>
          <div style={s.avatarLg} onClick={() => fileRef.current?.click()}>
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }} />
              : <span style={{ fontSize: '22px', fontWeight: '600', color: 'var(--accent)' }}>{initials}</span>
            }
          </div>
          <div>
            <button
              style={{ ...s.btn, ...(uploading ? s.btnDisabled : {}) }}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? 'Uploading…' : 'Change photo'}
            </button>
            <p style={s.hint}>JPG or PNG, max 5 MB</p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
        </div>
      </section>

      {/* Personal info */}
      <section style={s.section}>
        <div style={s.sectionLabel}>Personal Info</div>
        <div style={s.grid2}>
          <Field label="Full name">
            <input style={s.input} value={form.full_name || ''} onChange={e => setField('full_name', e.target.value)} placeholder="Your name" />
          </Field>
          <Field label="Age">
            <input style={s.input} type="number" min="10" max="120" value={form.age || ''} onChange={e => setField('age', e.target.value)} placeholder="—" />
          </Field>
          <Field label="Weight (kg)">
            <input style={s.input} type="number" min="20" max="400" step="0.1" value={form.weight_kg || ''} onChange={e => setField('weight_kg', e.target.value)} placeholder="—" />
          </Field>
          <Field label="Height (cm)">
            <input style={s.input} type="number" min="50" max="300" value={form.height_cm || ''} onChange={e => setField('height_cm', e.target.value)} placeholder="—" />
          </Field>
        </div>
      </section>

      {/* Training */}
      <section style={s.section}>
        <div style={s.sectionLabel}>Training</div>
        <div style={s.grid2}>
          <Field label="Goal">
            <select style={s.input} value={form.fitness_goal || ''} onChange={e => setField('fitness_goal', e.target.value)}>
              {GOAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Experience">
            <select style={s.input} value={form.experience_level || ''} onChange={e => setField('experience_level', e.target.value)}>
              {EXP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Sessions per week">
            <input style={s.input} type="number" min="1" max="7" value={form.sessions_per_week || ''} onChange={e => setField('sessions_per_week', e.target.value)} />
          </Field>
          <Field label="Equipment">
            <select style={s.input} value={form.equipment_available || ''} onChange={e => setField('equipment_available', e.target.value)}>
              {EQUIP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Injuries / limitations" fullWidth>
            <input style={s.input} value={form.injuries || ''} onChange={e => setField('injuries', e.target.value)} placeholder="e.g. bad lower back, no knee flexion" />
          </Field>
        </div>
      </section>

      {/* Nutrition */}
      <section style={s.section}>
        <div style={s.sectionLabel}>Nutrition</div>
        <div style={s.grid2}>
          <Field label="Diet type">
            <input style={s.input} value={form.diet_type || ''} onChange={e => setField('diet_type', e.target.value)} placeholder="e.g. omnivore, vegan" />
          </Field>
          <Field label="Allergies">
            <input style={s.input} value={form.allergies || ''} onChange={e => setField('allergies', e.target.value)} placeholder="e.g. nuts, dairy" />
          </Field>
        </div>
      </section>

      <button
        style={{ ...s.btnAccent, ...(saving ? s.btnDisabled : {}), marginBottom: '32px' }}
        onClick={handleSave}
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>

      {/* Data export */}
      <section style={s.section}>
        <div style={s.sectionLabel}>Data</div>
        <div style={s.card}>
          <div style={s.cardTitle}>Export your data</div>
          <p style={s.cardDesc}>Download all your sessions, sets, measurements, meals and progress photos as JSON.</p>
          <button
            style={{ ...s.btn, ...(exporting ? s.btnDisabled : {}) }}
            onClick={handleExport}
          >
            {exporting ? 'Exporting…' : 'Export kavafit_data_export.json'}
          </button>
        </div>
      </section>

      {/* Danger zone */}
      <section style={s.section}>
        <div style={s.sectionLabel}>Account</div>
        <div style={{ ...s.card, borderColor: 'rgba(255,92,92,0.25)' }}>
          <div style={s.cardTitle}>Sign out</div>
          <p style={s.cardDesc}>You'll need to sign in again to access KavaFit.</p>
          <button
            style={s.btnDanger}
            onClick={handleSignOut}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,92,92,0.12)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
          >
            Sign out
          </button>
        </div>
      </section>
    </div>
  )
}

function Field({ label, children, fullWidth }: { label: string; children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div style={fullWidth ? { gridColumn: '1 / -1' } : {}}>
      <label style={s.fieldLabel}>{label}</label>
      {children}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '28px', maxWidth: '700px', margin: '0 auto' },
  pageTitle: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '28px', letterSpacing: '0.04em', marginBottom: '28px', color: 'var(--text)' },
  section: { marginBottom: '28px' },
  sectionLabel: { fontSize: '10px', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '12px' },
  photoRow: { display: 'flex', alignItems: 'center', gap: '20px' },
  avatarLg: {
    width: '68px', height: '68px', borderRadius: '50%',
    background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', flexShrink: 0, overflow: 'hidden',
  },
  hint: { fontSize: '11px', color: 'var(--dim)', marginTop: '4px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
  fieldLabel: { display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--muted)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  input: {
    width: '100%', padding: '8px 10px',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: '7px', color: 'var(--text)', fontSize: '13px',
    outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  btn: {
    padding: '8px 16px', background: 'var(--surface2)', border: '1px solid var(--border2)',
    borderRadius: '7px', color: 'var(--text)', fontSize: '13px', fontWeight: '500',
    cursor: 'pointer', transition: 'border-color 0.15s',
  },
  btnAccent: {
    padding: '10px 22px', background: 'var(--accent)', border: 'none',
    borderRadius: '8px', color: '#0a0a0a', fontSize: '13px', fontWeight: '600',
    cursor: 'pointer', transition: 'opacity 0.15s', display: 'block',
  },
  btnDanger: {
    padding: '8px 16px', background: 'transparent', border: '1px solid var(--red)',
    borderRadius: '7px', color: 'var(--red)', fontSize: '13px', fontWeight: '600',
    cursor: 'pointer', transition: 'background 0.15s',
  },
  btnDisabled: { opacity: 0.45, pointerEvents: 'none' },
  card: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: '10px', padding: '18px',
  },
  cardTitle: { fontSize: '14px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' },
  cardDesc: { fontSize: '12px', color: 'var(--muted)', marginBottom: '12px', lineHeight: '1.6' },
}
