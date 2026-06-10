import React, { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'


interface FoodNutrient {
  nutrientNumber: string | number
  value: number
}

interface FoodItem {
  id?: string | number
  food_code?: string
  food_name: string
  energy_kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g?: number
  serving_unit?: string | null
  serving_size_g?: number | null
  serving_energy_kcal?: number | null
  serving_protein_g?: number | null
  serving_carbs_g?: number | null
  serving_fat_g?: number | null
  source: 'indian' | 'usda'
}

function getNutrient(nutrients: FoodNutrient[], number: string | number): number {
  const n = (nutrients || []).find(x => String(x.nutrientNumber) === String(number))
  return n?.value ?? 0
}

async function searchIndian(q: string): Promise<FoodItem[]> {
  const terms = q.trim().split(/\s+/).join(' & ')
  const { data: fts } = await supabase
    .from('indian_foods')
    .select('*')
    .textSearch('name_search', terms)
    .limit(6)
  if (fts && fts.length > 0) return fts.map(r => ({ ...(r as object), source: 'indian' as const })) as FoodItem[]

  const { data: ilike } = await supabase
    .from('indian_foods')
    .select('*')
    .ilike('food_name', `%${q}%`)
    .limit(6)
  return ((ilike || []) as object[]).map(r => ({ ...r, source: 'indian' as const })) as FoodItem[]
}

async function searchUSDA(q: string): Promise<FoodItem[]> {
  try {
    const { data, error } = await supabase.functions.invoke('usda-proxy', {
      body: { query: q, pageSize: 6 },
    })
    if (error || !data) return []
    const typed = data as { foods?: Array<{ fdcId: number; description: string; servingSizeUnit?: string; servingSize?: number; foodNutrients: FoodNutrient[] }> }
    return (typed.foods || []).map(f => ({
      id: f.fdcId,
      food_code: `usda_${f.fdcId}`,
      food_name: f.description,
      energy_kcal: getNutrient(f.foodNutrients, 208),
      protein_g: getNutrient(f.foodNutrients, 203),
      carbs_g: getNutrient(f.foodNutrients, 205),
      fat_g: getNutrient(f.foodNutrients, 204),
      fiber_g: getNutrient(f.foodNutrients, 291),
      serving_unit: f.servingSizeUnit || null,
      serving_size_g: f.servingSize || null,
      serving_energy_kcal: f.servingSize ? getNutrient(f.foodNutrients, 208) * f.servingSize / 100 : null,
      serving_protein_g: f.servingSize ? getNutrient(f.foodNutrients, 203) * f.servingSize / 100 : null,
      serving_carbs_g: f.servingSize ? getNutrient(f.foodNutrients, 205) * f.servingSize / 100 : null,
      serving_fat_g: f.servingSize ? getNutrient(f.foodNutrients, 204) * f.servingSize / 100 : null,
      source: 'usda' as const,
    }))
  } catch {
    return []
  }
}

function getMacros(food: FoodItem, grams: number) {
  const f = grams / 100
  return {
    calories: Math.round((food.energy_kcal || 0) * f),
    protein: Math.round((food.protein_g || 0) * f * 10) / 10,
    carbs: Math.round((food.carbs_g || 0) * f * 10) / 10,
    fat: Math.round((food.fat_g || 0) * f * 10) / 10,
  }
}

export default function FoodSearch({ onLogged }: { onLogged?: () => void }) {
  const { user } = useAuth()
  const { showToast } = useToast()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoodItem[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<FoodItem | null>(null)
  const [qty, setQty] = useState(100)
  const [useServing, setUseServing] = useState(false)
  const [mealName, setMealName] = useState('')
  const [logging, setLogging] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function runSearch(q: string) {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    const [indianRes, usdaRes] = await Promise.allSettled([searchIndian(q), searchUSDA(q)])
    const indian = indianRes.status === 'fulfilled' ? indianRes.value : []
    const usda = usdaRes.status === 'fulfilled' ? usdaRes.value : []
    const seen = new Set<string>()
    const merged: FoodItem[] = []
    for (const item of [...indian, ...usda]) {
      const key = item.food_name.toLowerCase().trim()
      if (!seen.has(key)) { seen.add(key); merged.push(item) }
    }
    setResults(merged.slice(0, 12))
    setSearching(false)
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(q), 350)
  }

  function selectFood(item: FoodItem) {
    setSelected(item)
    setMealName(item.food_name)
    setQty(item.serving_size_g || 100)
    setUseServing(!!item.serving_size_g)
  }

  async function addToLog() {
    if (!selected || !user) return
    setLogging(true)
    const servingG = selected.serving_size_g
    const grams = useServing && servingG ? servingG * qty : qty
    const m = getMacros(selected, grams)
    const { error } = await (supabase.from('meal_history') as any).insert({
      user_id: user.id,
      recipe_name: mealName.trim() || selected.food_name,
      protein_g: m.protein,
      carbs_g: m.carbs,
      fat_g: m.fat,
      calories: m.calories,
    })
    if (error) {
      showToast('Failed to log meal', 'error')
    } else {
      showToast('Meal logged', 'success')
      window.dispatchEvent(new CustomEvent('foodLogUpdated'))
      onLogged?.()
      setSelected(null)
      setQuery('')
      setResults([])
      setMealName('')
      setQty(100)
      setUseServing(false)
    }
    setLogging(false)
  }

  const servingG = selected?.serving_size_g || null
  const displayGrams = useServing && servingG ? servingG * qty : qty
  const macros = selected ? getMacros(selected, displayGrams) : null

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: '8px', color: 'var(--text)', fontSize: '13px',
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div>
      <input
        placeholder="Search foods — dal makhani, chicken, oats…"
        value={query}
        onChange={handleInput}
        style={{ ...inputStyle, marginBottom: (results.length || searching) ? '8px' : 0 }}
        onFocus={e => { e.target.style.borderColor = 'var(--accent)' }}
        onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
      />

      {searching && (
        <div style={{ fontSize: '12px', color: 'var(--dim)', marginBottom: '8px' }}>Searching…</div>
      )}

      {results.length > 0 && !selected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '12px' }}>
          {results.map((r, i) => (
            <div
              key={r.food_code || i}
              onClick={() => selectFood(r)}
              style={{
                display: 'flex', alignItems: 'center', padding: '9px 12px',
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: '7px', cursor: 'pointer', gap: '10px',
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <span style={{ flex: 1, fontSize: '13px', fontWeight: '500' }}>{r.food_name}</span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                {Math.round(r.energy_kcal || 0)} kcal · P:{Math.round(r.protein_g || 0)}g
              </span>
              <span style={{
                fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: '600',
                background: r.source === 'indian' ? 'rgba(200,245,90,0.12)' : 'rgba(96,165,250,0.12)',
                color: r.source === 'indian' ? 'var(--accent)' : '#60a5fa',
              }}>
                {r.source === 'indian' ? 'IN' : 'USDA'}
              </span>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div style={{
          background: 'var(--surface2)', border: '1px solid var(--border2)',
          borderRadius: '10px', padding: '14px', marginTop: '4px',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '2px' }}>{selected.food_name}</div>
              {selected.serving_unit && (
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  Serving: {selected.serving_unit}{servingG ? ` · ${servingG}g` : ''}
                </div>
              )}
            </div>
            <button
              onClick={() => { setSelected(null); setQuery('') }}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '0 0 0 8px', flexShrink: 0 }}
            >
              ×
            </button>
          </div>

          {/* Qty + serving toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="number" min="1"
                value={qty}
                onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))}
                style={{ width: '72px', padding: '6px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
              />
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                {useServing && servingG ? `× ${selected.serving_unit || 'serving'}` : 'grams'}
              </span>
            </div>
            {servingG && (
              <button
                onClick={() => { setUseServing(v => !v); setQty(1) }}
                style={{
                  fontSize: '11px', padding: '4px 10px', background: 'none', cursor: 'pointer',
                  border: `1px solid ${useServing ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: '5px', color: useServing ? 'var(--accent)' : 'var(--muted)',
                }}
              >
                {useServing ? '· per serving' : 'switch to servings'}
              </button>
            )}
            {useServing && servingG && (
              <span style={{ fontSize: '11px', color: 'var(--dim)' }}>{displayGrams}g total</span>
            )}
          </div>

          {/* Macro badges */}
          {macros && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {[
                { label: 'Calories', val: macros.calories, unit: 'kcal', color: 'var(--amber)' },
                { label: 'Protein', val: macros.protein, unit: 'g', color: 'var(--accent)' },
                { label: 'Carbs', val: macros.carbs, unit: 'g', color: '#60a5fa' },
                { label: 'Fat', val: macros.fat, unit: 'g', color: '#f87171' },
              ].map(b => (
                <div key={b.label} style={{ padding: '6px 12px', background: 'var(--surface)', borderRadius: '7px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '9px', color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }}>{b.label}</div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: b.color, lineHeight: 1 }}>
                    {b.val}
                    <span style={{ fontSize: '10px', fontWeight: '400', color: 'var(--muted)', marginLeft: '2px' }}>{b.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Meal name + add */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              placeholder="Meal name (optional)"
              value={mealName}
              onChange={e => setMealName(e.target.value)}
              style={{ flex: 1, minWidth: '140px', padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '7px', color: 'var(--text)', fontSize: '13px', outline: 'none' }}
              onFocus={e => { e.target.style.borderColor = 'var(--accent)' }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
            />
            <button
              onClick={addToLog}
              disabled={logging}
              style={{
                padding: '8px 18px', background: 'var(--accent)', border: 'none',
                borderRadius: '7px', color: '#0a0a0a', fontSize: '13px', fontWeight: '600',
                cursor: logging ? 'not-allowed' : 'pointer', opacity: logging ? 0.6 : 1,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {logging ? 'Logging…' : 'Add to log'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
