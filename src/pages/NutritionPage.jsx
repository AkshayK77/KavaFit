import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { callAgent, parseAgentJSON } from '../lib/geminiAgent'
import { useToast } from '../components/Toast'
import { useIsMobile } from '../hooks/useIsMobile'

function todayStr() { return new Date().toISOString().split('T')[0] }

function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate() }
function getFirstDayOfMonth(y, m) { return new Date(y, m, 1).getDay() }
function toDateStr(y, m, d) { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function MacroCard({ label, current, target, color, unit }) {
  const pct = target > 0 ? Math.min(current / target, 1) : 0
  const remaining = target > 0 ? Math.max(target - current, 0) : null
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px 16px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '26px', letterSpacing: '0.04em', lineHeight: 1, marginBottom: '2px' }}>
        {current}
        {target > 0 && <span style={{ fontSize: '14px', color: 'var(--muted)', fontWeight: 400 }}> / {target}</span>}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '10px' }}>
        {remaining !== null ? `${remaining}${unit} remaining` : unit}
      </div>
      <div style={{ height: '3px', background: 'var(--surface3)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct * 100}%`, background: color, borderRadius: '2px', transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

const s = {
  page: { width: '100%', padding: '28px 28px 60px' },
  title: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '32px', letterSpacing: '0.04em', marginBottom: '32px' },
  card: { marginBottom: '20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '22px 24px' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' },
  cardTitle: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '18px', letterSpacing: '0.04em' },
  label: { fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)' },
  macroRow: { display: 'flex', gap: '10px' },

  cupBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', padding: '2px', lineHeight: 1, transition: 'transform 0.1s' },
  cupsRow: { display: 'flex', gap: '6px', margin: '10px 0 6px' },
  waterLabel: { fontSize: '13px', color: 'var(--muted)', marginTop: '2px' },

  mealRow: { display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' },
  mealName: { flex: 1, fontSize: '13px', fontWeight: '500', marginRight: '8px' },
  mealMacros: { fontSize: '11px', color: 'var(--muted)', marginRight: '14px', whiteSpace: 'nowrap' },
  mealCals: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '18px', color: 'var(--accent)', minWidth: '48px', textAlign: 'right' },

  btnSm: { padding: '7px 14px', background: 'transparent', border: '1px solid var(--border2)', borderRadius: '7px', color: 'var(--text)', fontSize: '12px', fontWeight: '500', cursor: 'pointer', marginTop: '12px', display: 'inline-block' },
  btnAccent: { padding: '9px 18px', background: 'var(--accent)', border: 'none', borderRadius: '8px', color: '#0a0a0a', fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'opacity 0.15s' },
  btnDim: { padding: '7px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: '7px', color: 'var(--muted)', fontSize: '12px', cursor: 'pointer' },

  form: { marginTop: '14px', padding: '14px', background: 'var(--surface2)', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' },
  field: { display: 'flex', flexDirection: 'column', gap: '4px' },
  fieldLabel: { fontSize: '10px', fontWeight: '600', color: 'var(--dim)', letterSpacing: '0.06em', textTransform: 'uppercase' },
  input: { padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '7px', color: 'var(--text)', fontSize: '13px', outline: 'none', width: '80px' },
  inputWide: { padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '7px', color: 'var(--text)', fontSize: '13px', outline: 'none', width: '180px' },
  ingredientInput: { width: '100%', padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px', outline: 'none', marginBottom: '10px', boxSizing: 'border-box' },

  recipeCard: { background: 'linear-gradient(135deg, #0d1a00 0%, #111 100%)', border: '1px solid rgba(200,245,90,0.2)', borderRadius: '12px', padding: '20px', marginBottom: '16px' },
  recipeName: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '22px', letterSpacing: '0.04em', marginBottom: '4px' },
  recipeDesc: { fontSize: '12px', color: 'var(--muted)', marginBottom: '10px', lineHeight: 1.5 },
  recipeMacroRow: { display: 'flex', gap: '20px', marginBottom: '12px', flexWrap: 'wrap' },
  recipeMacroItem: { fontSize: '12px', color: 'var(--muted)' },
  recipeMacroVal: { fontWeight: '600', color: 'var(--text)' },

  groceryCategory: { marginBottom: '16px' },
  groceryCatTitle: { fontSize: '10px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '8px' },
  groceryItem: { fontSize: '13px', color: 'var(--text)', padding: '3px 0', display: 'flex', gap: '8px', alignItems: 'flex-start' },

  historyDate: { fontSize: '10px', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', padding: '12px 0 4px', borderTop: '1px solid var(--border)', marginTop: '4px' },
  historyRow: { display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' },
  historyName: { flex: 1, fontSize: '13px', fontWeight: '500', marginRight: '8px' },
  historyMacros: { fontSize: '11px', color: 'var(--muted)', marginRight: '12px', whiteSpace: 'nowrap' },
  useAgainBtn: { padding: '4px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--muted)', fontSize: '11px', cursor: 'pointer', flexShrink: 0 },
  deleteBtn: { padding: '4px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: '5px', color: '#ff8b8b', fontSize: '11px', cursor: 'pointer', flexShrink: 0 },

  calNav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' },
  calMonth: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '16px', letterSpacing: '0.04em' },
  calNavBtn: { background: 'none', border: 'none', color: 'var(--muted)', fontSize: '16px', cursor: 'pointer', padding: '2px 8px' },
  calGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' },
  calDayLabel: { fontSize: '9px', color: 'var(--dim)', textAlign: 'center', padding: '3px 0', fontWeight: '500' },
  calCell: { aspectRatio: '1', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '11px', transition: 'background 0.12s', position: 'relative', border: '1px solid transparent' },
  calCellActive: { background: 'rgba(200,245,90,0.12)', borderColor: 'rgba(200,245,90,0.4)' },
  calDot: { width: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent)', position: 'absolute', bottom: '4px' },
  mealDetailRow: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid var(--border)' },
}

export default function NutritionPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const isMobile = useIsMobile()

  const [profile, setProfile] = useState(null)
  const [todayMeals, setTodayMeals] = useState([])
  const [allMeals, setAllMeals] = useState([])
  const [hasSessionToday, setHasSessionToday] = useState(false)
  const [todayMuscles, setTodayMuscles] = useState([])

  const hydrKey = `forge_hydration_${todayStr()}`
  const [hydrationCups, setHydrationCups] = useState(() => {
    try { const v = localStorage.getItem(hydrKey); return v ? JSON.parse(v) : Array(10).fill(false) }
    catch { return Array(10).fill(false) }
  })

  const [showAddMeal, setShowAddMeal] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', protein: '', carbs: '', fat: '', calories: '' })
  const [savingMeal, setSavingMeal] = useState(false)

  const [ingredients, setIngredients] = useState('')
  const [currentRecipe, setCurrentRecipe] = useState(null)
  const [generatingRecipe, setGeneratingRecipe] = useState(false)
  const [loggingRecipe, setLoggingRecipe] = useState(false)

  const [groceryList, setGroceryList] = useState(null)
  const [generatingGrocery, setGeneratingGrocery] = useState(false)
  const [copied, setCopied] = useState(false)

  // Section E — meal calendar
  const now = new Date()
  const [mealCalYear, setMealCalYear] = useState(now.getFullYear())
  const [mealCalMonth, setMealCalMonth] = useState(now.getMonth())
  const [selectedMealDate, setSelectedMealDate] = useState(todayStr())

  useEffect(() => { if (user) loadAll() }, [user])

  useEffect(() => {
    try { localStorage.setItem(hydrKey, JSON.stringify(hydrationCups)) } catch { /* ignore */ }
  }, [hydrationCups])

  async function loadAll() {
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(prof)
    await Promise.all([loadTodayMeals(), loadAllMeals(), checkSessionToday()])
  }

  async function loadTodayMeals() {
    const { data } = await supabase
      .from('meal_history').select('*').eq('user_id', user.id)
      .gte('created_at', todayStr() + 'T00:00:00')
      .lte('created_at', todayStr() + 'T23:59:59')
      .order('created_at', { ascending: false })
    setTodayMeals(data || [])
  }

  async function loadAllMeals() {
    const { data } = await supabase
      .from('meal_history').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(150)
    setAllMeals(data || [])
  }

  async function deleteMeal(id) {
    const ok = window.confirm('Delete this meal entry?')
    if (!ok) return
    await supabase.from('meal_history').delete().eq('id', id).eq('user_id', user.id)
    setTodayMeals(prev => prev.filter(m => m.id !== id))
    setAllMeals(prev => prev.filter(m => m.id !== id))
  }

  async function checkSessionToday() {
    const { data } = await supabase
      .from('sessions').select('id').eq('user_id', user.id)
      .eq('date', todayStr()).not('completed_at', 'is', null)
    const hasSess = (data || []).length > 0
    setHasSessionToday(hasSess)
    if (hasSess) {
      const ids = (data || []).map(s => s.id)
      const { data: sets } = await supabase.from('session_sets').select('exercise_id').in('session_id', ids).eq('completed', true)
      const exIds = [...new Set((sets || []).map(s => s.exercise_id))]
      if (exIds.length) {
        const { data: exs } = await supabase.from('exercises').select('muscle_groups').in('id', exIds)
        const muscles = [...new Set((exs || []).flatMap(e => e.muscle_groups || []))]
        setTodayMuscles(muscles.slice(0, 4))
      }
    }
  }

  function toggleCup(i) {
    setHydrationCups(prev => prev.map((v, idx) => idx === i ? !v : v))
  }

  async function saveAddMeal() {
    if (!addForm.name) return
    setSavingMeal(true)
    await supabase.from('meal_history').insert({
      user_id: user.id,
      recipe_name: addForm.name,
      protein_g: parseFloat(addForm.protein) || 0,
      carbs_g: parseFloat(addForm.carbs) || 0,
      fat_g: parseFloat(addForm.fat) || 0,
      calories: parseFloat(addForm.calories) || 0,
    })
    setSavingMeal(false)
    setShowAddMeal(false)
    setAddForm({ name: '', protein: '', carbs: '', fat: '', calories: '' })
    loadTodayMeals()
    loadAllMeals()
  }

  async function generateRecipe(ingredientsOverride) {
    const ing = ingredientsOverride !== undefined ? ingredientsOverride : ingredients
    if (!ing.trim()) return
    if (ingredientsOverride !== undefined) setIngredients(ingredientsOverride)
    setGeneratingRecipe(true)
    const consumed = {
      calories: todayMeals.reduce((s, m) => s + (m.calories || 0), 0),
      protein: todayMeals.reduce((s, m) => s + (m.protein_g || 0), 0),
    }
    const remainingCals = Math.max((profile?.daily_calorie_target || 0) - consumed.calories, 0)
    const remainingProtein = Math.max((profile?.daily_protein_target || 0) - consumed.protein, 0)
    const sessionStr = hasSessionToday
      ? `did train (${todayMuscles.join(', ') || 'general'})`
      : 'did not train'
    const message = `The user has these ingredients: ${ing.trim()}. Generate a recipe. Their remaining targets today are ${Math.round(remainingCals)} calories and ${Math.round(remainingProtein)}g protein. Their dietary preference is ${profile?.dietary_preference || 'none'} and allergies are ${profile?.allergies || 'none'}. Today they ${sessionStr}.`
    const text = await callAgent(user.id, message, 'recipe')
    const parsed = parseAgentJSON(text)
    if (parsed) {
      setCurrentRecipe(parsed)
      showToast('Recipe generated', 'success')
    } else {
      showToast('Could not generate recipe — try again', 'error')
    }
    setGeneratingRecipe(false)
  }

  async function logCurrentRecipe() {
    if (!currentRecipe) return
    setLoggingRecipe(true)
    await supabase.from('meal_history').insert({
      user_id: user.id,
      recipe_name: currentRecipe.recipeName || 'Generated recipe',
      protein_g: currentRecipe.proteinG || 0,
      carbs_g: currentRecipe.carbsG || 0,
      fat_g: currentRecipe.fatG || 0,
      calories: currentRecipe.calories || 0,
    })
    setLoggingRecipe(false)
    loadTodayMeals()
    loadAllMeals()
    showToast('Meal logged', 'success')
  }

  async function generateGroceryList() {
    if (!profile) return
    setGeneratingGrocery(true)
    const message = `Generate a 5-day grocery list for a user with goal ${profile.fitness_goal || 'general fitness'}, dietary preference ${profile.dietary_preference || 'none'}, allergies ${profile.allergies || 'none'}, and daily targets of ${profile.daily_calorie_target || 2000} calories and ${profile.daily_protein_target || 150}g protein. Group by category: Proteins, Carbs, Vegetables, Fats, Other. Return only a JSON object with category names as keys and arrays of items as values.`
    const text = await callAgent(user.id, message, 'grocery')
    const parsed = parseAgentJSON(text)
    if (parsed) setGroceryList(parsed)
    setGeneratingGrocery(false)
  }

  function copyGroceryList() {
    if (!groceryList) return
    const lines = Object.entries(groceryList)
      .filter(([, items]) => Array.isArray(items) && items.length)
      .map(([cat, items]) => `${cat}:\n${items.map(i => `  • ${i}`).join('\n')}`)
      .join('\n\n')
    navigator.clipboard.writeText(lines)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Computed
  const macros = {
    calories: Math.round(todayMeals.reduce((s, m) => s + (m.calories || 0), 0)),
    protein: Math.round(todayMeals.reduce((s, m) => s + (m.protein_g || 0), 0)),
    carbs: Math.round(todayMeals.reduce((s, m) => s + (m.carbs_g || 0), 0)),
    fat: Math.round(todayMeals.reduce((s, m) => s + (m.fat_g || 0), 0)),
  }
  const targets = {
    calories: profile?.daily_calorie_target || 0,
    protein: profile?.daily_protein_target || 0,
    carbs: profile?.daily_calorie_target ? Math.round((profile.daily_calorie_target * 0.45) / 4) : 0,
  }

  const waterTargetL = profile?.weight_kg
    ? Math.round((parseFloat(profile.weight_kg) * 35 + (hasSessionToday ? 500 : 0)) / 250) * 0.25
    : 2.5
  const waterConsumedL = ((hydrationCups.filter(Boolean).length / 10) * waterTargetL).toFixed(1)

  // Meal history grouped by date
  const mealsByDate = {}
  allMeals.forEach(m => {
    const date = (m.created_at || '').split('T')[0] || todayStr()
    if (!mealsByDate[date]) mealsByDate[date] = []
    mealsByDate[date].push(m)
  })
  const mealDates = Object.keys(mealsByDate).sort((a, b) => b.localeCompare(a))
  const mealDateSet = new Set(mealDates)

  useEffect(() => {
    if (!mealDates.length) return
    if (!selectedMealDate || !mealDateSet.has(selectedMealDate)) {
      setSelectedMealDate(mealDates[0])
    }
  }, [mealDates.join(','), selectedMealDate])

  const focusAccent = e => { e.target.style.borderColor = 'var(--accent)' }
  const blurBorder = e => { e.target.style.borderColor = 'var(--border)' }

  return (
    <div style={{ ...s.page, padding: isMobile ? '16px 16px 40px' : '28px 28px 60px' }}>
      <h1 style={s.title}>Nutrition</h1>

      {/* ── SECTION A — Daily macro targets ── */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <span style={s.cardTitle}>Daily macros</span>
          {!targets.calories && <span style={{ fontSize: '11px', color: 'var(--dim)' }}>Set targets in onboarding</span>}
        </div>
        <div style={s.macroRow}>
          <MacroCard label="Calories" current={macros.calories} target={targets.calories} color="var(--amber)" unit="kcal" />
          <MacroCard label="Protein" current={macros.protein} target={targets.protein} color="var(--accent)" unit="g" />
          <MacroCard label="Carbs" current={macros.carbs} target={targets.carbs} color="#60a5fa" unit="g" />
        </div>
      </div>

      {/* ── SECTION B — Hydration tracker ── */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <span style={s.cardTitle}>Hydration</span>
          <span style={s.label}>{waterTargetL.toFixed(1)}L target{hasSessionToday ? ' · +0.5L for session' : ''}</span>
        </div>
        <div style={s.cupsRow}>
          {hydrationCups.map((filled, i) => (
            <button
              key={i}
              style={s.cupBtn}
              onClick={() => toggleCup(i)}
              title={filled ? 'Remove' : 'Add'}
              onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.2)' }}
              onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              <span style={{ opacity: filled ? 1 : 0.2 }}>💧</span>
            </button>
          ))}
        </div>
        <p style={s.waterLabel}>{waterConsumedL}L / {waterTargetL.toFixed(1)}L</p>
      </div>

      {/* ── SECTION C — Today's food log ── */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <span style={s.cardTitle}>Today's food log</span>
          <span style={s.label}>{todayMeals.length} {todayMeals.length === 1 ? 'meal' : 'meals'}</span>
        </div>

        {todayMeals.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--dim)' }}>Nothing logged yet today.</p>
        ) : (
          <>
            {todayMeals.map(m => (
              <div key={m.id} style={s.mealRow}>
                <span style={s.mealName}>{m.recipe_name || 'Meal'}</span>
                <span style={s.mealMacros}>P:{Math.round(m.protein_g || 0)}g · C:{Math.round(m.carbs_g || 0)}g · F:{Math.round(m.fat_g || 0)}g</span>
                <span style={s.mealCals}>{Math.round(m.calories || 0)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0 0', borderTop: '1px solid var(--border)', marginTop: '2px' }}>
              <span style={{ flex: 1, fontSize: '12px', fontWeight: '600', color: 'var(--muted)' }}>Total</span>
              <span style={{ ...s.mealMacros, fontWeight: '600' }}>P:{macros.protein}g · C:{macros.carbs}g · F:{macros.fat}g</span>
              <span style={{ ...s.mealCals, color: 'var(--text)' }}>{macros.calories}</span>
            </div>
          </>
        )}

        <button style={s.btnSm} onClick={() => setShowAddMeal(v => !v)}>
          {showAddMeal ? 'Cancel' : 'Add meal manually'}
        </button>

        {showAddMeal && (
          <div style={s.form}>
            <div style={s.field}>
              <span style={s.fieldLabel}>Meal name</span>
              <input
                placeholder="Chicken & rice"
                value={addForm.name}
                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                style={{ ...s.inputWide, width: isMobile ? '100%' : '180px' }}
                onFocus={focusAccent} onBlur={blurBorder}
              />
            </div>
            {[
              { key: 'protein', label: 'Protein (g)' },
              { key: 'carbs', label: 'Carbs (g)' },
              { key: 'fat', label: 'Fat (g)' },
              { key: 'calories', label: 'Calories' },
            ].map(({ key, label }) => (
              <div key={key} style={s.field}>
                <span style={s.fieldLabel}>{label}</span>
                <input
                  type="number" placeholder="0"
                  value={addForm[key]}
                  onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))}
                  style={s.input}
                  onFocus={focusAccent} onBlur={blurBorder}
                />
              </div>
            ))}
            <button
              style={{ ...s.btnAccent, opacity: savingMeal ? 0.5 : 1 }}
              onClick={saveAddMeal}
              disabled={savingMeal}
            >
              {savingMeal ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* ── SECTION D — Recipe generator ── */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <span style={s.cardTitle}>Recipe generator</span>
        </div>

        {currentRecipe && (
          <div style={s.recipeCard}>
            <div style={s.recipeName}>{currentRecipe.recipeName}</div>
            <div style={s.recipeDesc}>{currentRecipe.steps?.[0] || ''}</div>
            <div style={s.recipeMacroRow}>
              {[
                { label: 'Protein', val: currentRecipe.proteinG, unit: 'g' },
                { label: 'Carbs', val: currentRecipe.carbsG, unit: 'g' },
                { label: 'Fat', val: currentRecipe.fatG, unit: 'g' },
                { label: 'Calories', val: currentRecipe.calories, unit: 'kcal' },
              ].map(item => (
                <div key={item.label} style={s.recipeMacroItem}>
                  {item.label}: <span style={s.recipeMacroVal}>{item.val || 0}{item.unit}</span>
                </div>
              ))}
            </div>
            {currentRecipe.ingredients?.length > 0 && (
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px', lineHeight: 1.6 }}>
                {currentRecipe.ingredients.map(i => `${i.quantity} ${i.item}`).join(' · ')}
              </div>
            )}
            <button
              style={{ ...s.btnAccent, fontSize: '12px', padding: '7px 14px', opacity: loggingRecipe ? 0.5 : 1 }}
              onClick={logCurrentRecipe}
              disabled={loggingRecipe}
            >
              {loggingRecipe ? 'Logging…' : 'Log this meal'}
            </button>
          </div>
        )}

        <div style={{ ...s.label, marginBottom: '8px' }}>What ingredients do you have?</div>
        <input
          placeholder="e.g. chicken breast, rice, broccoli, olive oil"
          value={ingredients}
          onChange={e => setIngredients(e.target.value)}
          style={s.ingredientInput}
          onFocus={focusAccent} onBlur={blurBorder}
        />
        <button
          style={{ ...s.btnAccent, opacity: (generatingRecipe || !ingredients.trim()) ? 0.5 : 1 }}
          onClick={() => generateRecipe()}
          disabled={generatingRecipe || !ingredients.trim()}
        >
          {generatingRecipe ? 'Generating…' : 'Generate recipe →'}
        </button>
      </div>

      {/* ── SECTION E — Meal history ── */}
      {allMeals.length > 0 && (
        <div style={s.card}>
          <div style={s.cardHeader}>
            <span style={s.cardTitle}>Meal history</span>
            <span style={s.label}>{allMeals.length} entries</span>
          </div>
          <div style={s.calNav}>
            <button
              style={s.calNavBtn}
              onClick={() => {
                const d = new Date(mealCalYear, mealCalMonth - 1, 1)
                setMealCalYear(d.getFullYear())
                setMealCalMonth(d.getMonth())
              }}
            >
              ‹
            </button>
            <div style={s.calMonth}>{MONTH_NAMES[mealCalMonth]} {mealCalYear}</div>
            <button
              style={s.calNavBtn}
              onClick={() => {
                const d = new Date(mealCalYear, mealCalMonth + 1, 1)
                setMealCalYear(d.getFullYear())
                setMealCalMonth(d.getMonth())
              }}
            >
              ›
            </button>
          </div>

          <div style={s.calGrid}>
            {DAY_NAMES.map(d => <div key={d} style={s.calDayLabel}>{d}</div>)}
            {(() => {
              const days = getDaysInMonth(mealCalYear, mealCalMonth)
              const first = getFirstDayOfMonth(mealCalYear, mealCalMonth)
              const cells = []
              for (let i = 0; i < first; i++) cells.push(null)
              for (let d = 1; d <= days; d++) cells.push(d)
              return cells.map((d, idx) => {
                if (!d) return <div key={`empty-${idx}`} />
                const dateStr = toDateStr(mealCalYear, mealCalMonth, d)
                const hasMeals = mealDateSet.has(dateStr)
                const isActive = dateStr === selectedMealDate
                return (
                  <div
                    key={dateStr}
                    style={{ ...s.calCell, ...(isActive ? s.calCellActive : {}) }}
                    onClick={() => setSelectedMealDate(dateStr)}
                    title={hasMeals ? 'Meals logged' : 'No meals logged'}
                  >
                    {d}
                    {hasMeals && <span style={s.calDot} />}
                  </div>
                )
              })
            })()}
          </div>

          <div style={s.historyDate}>
            {selectedMealDate
              ? new Date(selectedMealDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
              : 'Select a day'}
          </div>
          {(mealsByDate[selectedMealDate] || []).length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--dim)' }}>No meals logged for this day.</p>
          ) : (
            (mealsByDate[selectedMealDate] || []).map(m => (
              <div key={m.id} style={s.mealDetailRow}>
                <span style={s.historyName}>{m.recipe_name || 'Meal'}</span>
                <span style={s.historyMacros}>
                  P:{Math.round(m.protein_g || 0)}g · C:{Math.round(m.carbs_g || 0)}g · F:{Math.round(m.fat_g || 0)}g · {Math.round(m.calories || 0)}kcal
                </span>
                <button
                  style={s.useAgainBtn}
                  onClick={() => generateRecipe(m.recipe_name || '')}
                  onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
                >
                  Use again
                </button>
                <button
                  style={s.deleteBtn}
                  onClick={() => deleteMeal(m.id)}
                  onMouseOver={e => { e.currentTarget.style.borderColor = '#ff8b8b'; e.currentTarget.style.color = '#ff8b8b' }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = '#ff8b8b' }}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── SECTION F — Grocery list ── */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <span style={s.cardTitle}>Grocery list</span>
          {groceryList && (
            <button style={s.btnDim} onClick={copyGroceryList}>
              {copied ? '✓ Copied' : 'Copy list'}
            </button>
          )}
        </div>
        <button
          style={{ ...s.btnAccent, opacity: generatingGrocery ? 0.5 : 1 }}
          onClick={generateGroceryList}
          disabled={generatingGrocery}
        >
          {generatingGrocery ? 'Generating…' : 'Generate grocery list'}
        </button>

        {groceryList && (
          <div style={{ marginTop: '20px' }}>
            {Object.entries(groceryList).map(([cat, items]) =>
              Array.isArray(items) && items.length > 0 ? (
                <div key={cat} style={s.groceryCategory}>
                  <div style={s.groceryCatTitle}>{cat}</div>
                  {items.map((item, i) => (
                    <div key={i} style={s.groceryItem}>
                      <span style={{ color: 'var(--accent)', flexShrink: 0 }}>·</span>
                      {item}
                    </div>
                  ))}
                </div>
              ) : null
            )}
          </div>
        )}
      </div>
    </div>
  )
}
