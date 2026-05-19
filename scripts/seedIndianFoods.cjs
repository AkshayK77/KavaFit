const fs = require('fs')
const path = require('path')
const xlsx = require('xlsx')
const { createClient } = require('@supabase/supabase-js')

// Parse .env manually (no dotenv dependency needed)
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env')
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  const env = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

async function main() {
  const env = loadEnv()
  const SUPABASE_URL = env.VITE_SUPABASE_URL
  const SERVICE_KEY = env.VITE_SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  })

  const EXCEL_PATH = path.join(__dirname, '..', 'Anuvaad_INDB_2024.11.xlsx')
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error('Excel file not found:', EXCEL_PATH)
    process.exit(1)
  }

  const wb = xlsx.readFile(EXCEL_PATH)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = xlsx.utils.sheet_to_json(ws)

  console.log(`Read ${rows.length} rows from Excel`)

  const records = rows.map(r => ({
    food_code:           r.food_code ? String(r.food_code) : null,
    food_name:           r.food_name ? String(r.food_name).trim() : null,
    energy_kcal:         r.energy_kcal ?? null,
    protein_g:           r.protein_g ?? null,
    carbs_g:             r.carb_g ?? null,
    fat_g:               r.fat_g ?? null,
    fiber_g:             r.fibre_g ?? null,
    serving_unit:        r.servings_unit ? String(r.servings_unit) : null,
    serving_energy_kcal: r.unit_serving_energy_kcal ?? null,
    serving_protein_g:   r.unit_serving_protein_g ?? null,
    serving_carbs_g:     r.unit_serving_carb_g ?? null,
    serving_fat_g:       r.unit_serving_fat_g ?? null,
    serving_fiber_g:     r.unit_serving_fibre_g ?? null,
  })).filter(r => r.food_name)

  console.log(`Mapped ${records.length} valid records`)

  const BATCH = 50
  let inserted = 0
  let errors = 0

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH)
    const { error } = await supabase
      .from('indian_foods')
      .upsert(batch, { onConflict: 'food_code' })

    if (error) {
      console.error(`\nBatch ${i}–${i + batch.length} error:`, error.message)
      errors++
    } else {
      inserted += batch.length
      process.stdout.write(`\rInserted ${inserted}/${records.length}...`)
    }
  }

  console.log(`\nDone. ${inserted} inserted, ${errors} batch errors.`)

  if (records.length > 0) {
    console.log('\nSample food names:')
    records.slice(0, 5).forEach(r => console.log(' -', r.food_name))
  }
}

main().catch(err => { console.error(err); process.exit(1) })
