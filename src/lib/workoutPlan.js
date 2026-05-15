import { supabase } from './supabase'
import { callGemini } from './gemini'

const EQUIPMENT_LABELS = {
  full_gym: 'Full gym (barbells, cables, machines, dumbbells)',
  dumbbells_only: 'Dumbbells only',
  bodyweight: 'Bodyweight only',
  bands_and_dbs: 'Resistance bands and dumbbells',
}

const GOAL_LABELS = {
  build_muscle: 'Build muscle (hypertrophy)',
  lose_fat: 'Lose fat (lean out)',
  improve_fitness: 'Improve general fitness and endurance',
  maintain: 'Maintain current fitness',
}

// Maps modal chip selections → DB muscle_group keys
const MUSCLE_GROUP_KEYS = {
  Push: ['chest_mid', 'chest_upper', 'chest_lower', 'anterior_delt', 'lateral_delt', 'posterior_delt', 'triceps_long', 'triceps_lateral', 'triceps_medial'],
  Pull: ['lats', 'mid_trap', 'upper_trap', 'lower_trap', 'rhomboids', 'erector_spinae', 'teres_major', 'biceps_long', 'biceps_short', 'brachialis'],
  Legs: ['quads_rf', 'quads_vl', 'quads_vmo', 'hamstrings_bf', 'hamstrings_semi', 'glute_max', 'glute_med', 'glute_min', 'gastrocnemius', 'soleus'],
  'Upper Body': ['chest_mid', 'chest_upper', 'chest_lower', 'anterior_delt', 'lateral_delt', 'posterior_delt', 'triceps_long', 'triceps_lateral', 'triceps_medial', 'lats', 'mid_trap', 'upper_trap', 'lower_trap', 'rhomboids', 'erector_spinae', 'teres_major', 'biceps_long', 'biceps_short', 'brachialis'],
  'Full Body': [],
  Chest: ['chest_mid', 'chest_upper', 'chest_lower'],
  Back: ['lats', 'mid_trap', 'upper_trap', 'lower_trap', 'rhomboids', 'erector_spinae', 'teres_major'],
  Shoulders: ['anterior_delt', 'lateral_delt', 'posterior_delt'],
  Biceps: ['biceps_long', 'biceps_short', 'brachialis'],
  Triceps: ['triceps_long', 'triceps_lateral', 'triceps_medial'],
  Quads: ['quads_rf', 'quads_vl', 'quads_vmo'],
  Hamstrings: ['hamstrings_bf', 'hamstrings_semi'],
  Glutes: ['glute_max', 'glute_med', 'glute_min'],
  Calves: ['gastrocnemius', 'soleus'],
}

function filterByEquipment(exercises, equipment) {
  if (equipment === 'full_gym') return exercises
  return exercises.filter(e =>
    e.equipment_needed === equipment ||
    e.equipment_needed === 'bodyweight' ||
    (equipment === 'bands_and_dbs' && e.equipment_needed === 'dumbbells_only')
  )
}

function filterByMuscleGroups(exercises, selectedGroups) {
  if (!selectedGroups?.length || selectedGroups.includes('Full Body')) return exercises
  const keys = new Set()
  for (const group of selectedGroups) {
    for (const k of (MUSCLE_GROUP_KEYS[group] || [])) keys.add(k)
  }
  if (keys.size === 0) return exercises
  return exercises.filter(e => (e.muscle_groups || []).some(mg => keys.has(mg)))
}

// Three-tier name matching: exact → words-in-db → words-in-returned
function resolveExerciseByName(returnedName, allExercises, exerciseMap) {
  const key = returnedName.toLowerCase().trim()

  // Tier 1: exact match
  if (exerciseMap[key]) return exerciseMap[key]

  // Tier 2: every word in returned name appears in a DB exercise name
  const words = key.split(/\s+/).filter(Boolean)
  let match = allExercises.find(dbEx => {
    const dbKey = dbEx.name.toLowerCase().trim()
    return words.every(w => dbKey.includes(w))
  })
  if (match) return match

  // Tier 3: every word in a DB exercise name appears in the returned name
  match = allExercises.find(dbEx => {
    const dbWords = dbEx.name.toLowerCase().trim().split(/\s+/).filter(Boolean)
    return dbWords.every(w => key.includes(w))
  })
  return match || null
}

function buildPlanPrompt(profile, exercises) {
  const equipLabel = EQUIPMENT_LABELS[profile.equipment_available] ?? profile.equipment_available
  const goalLabel = GOAL_LABELS[profile.fitness_goal] ?? profile.fitness_goal
  const nameList = exercises.map(e => e.name).join('\n')

  return `You are a professional strength and conditioning coach. Generate a personalized weekly workout plan.

User profile:
- Goal: ${goalLabel}
- Experience: ${profile.experience_level}
- Sessions per week: ${profile.sessions_per_week}
- Equipment: ${equipLabel}
- Injuries or limitations: ${profile.injuries || 'None'}
- Age: ${profile.age ?? 'unknown'}, Weight: ${profile.weight_kg ? profile.weight_kg + 'kg' : 'unknown'}

AVAILABLE EXERCISES (use ONLY these exact names, spelled exactly as shown):
${nameList}

Return ONLY valid JSON with no markdown, no code blocks, no backticks. Exact structure:
{"planName":"string","days":[{"dayName":"string","dayOrder":1,"exercises":[{"exerciseName":"string","sets":3,"repRange":"8-12"}]}]}

Rules:
- Include exactly ${profile.sessions_per_week} training days
- dayOrder starts at 1 and increments by 1
- Each training day: 4-7 exercises
- Use only exercises from the provided list
- Avoid exercises that could aggravate the stated injuries
- Match rep ranges to goal: strength 4-6, hypertrophy 6-12, endurance 15-20
- Balance muscle groups across the week`
}

function buildSessionPrompt(profile, exercises, volumeThisWeek) {
  const equipLabel = EQUIPMENT_LABELS[profile.equipment_available] ?? profile.equipment_available
  const goalLabel = GOAL_LABELS[profile.fitness_goal] ?? profile.fitness_goal
  const nameList = exercises.map(e => e.name).join('\n')
  const volumeSummary = Object.entries(volumeThisWeek)
    .map(([mg, sets]) => `${mg}: ${sets} sets`)
    .join(', ') || 'None yet this week'

  return `You are a professional strength and conditioning coach. Generate a single workout session.

User profile:
- Goal: ${goalLabel}
- Experience: ${profile.experience_level}
- Equipment: ${equipLabel}
- Injuries: ${profile.injuries || 'None'}

Training volume logged this week:
${volumeSummary}

AVAILABLE EXERCISES (use ONLY these exact names, spelled exactly as shown):
${nameList}

Return ONLY valid JSON with no markdown, no code blocks, no backticks. Exact structure:
{"sessionName":"string","exercises":[{"exerciseName":"string","sets":3,"repRange":"8-12"}]}

Rules:
- Include 4-6 exercises
- Prioritise muscle groups not yet trained this week
- Avoid exercises that hit already high-volume muscles unless it is their primary training day
- Match rep ranges to goal
- Use only exercises from the provided list
- Avoid exercises that could aggravate injuries`
}

export function calcNutrition(profile) {
  const { age, weight_kg, height_cm, fitness_goal, sessions_per_week } = profile
  if (!weight_kg || !height_cm || !age) return { calories: null, protein: null }

  const bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
  const activityMultiplier =
    sessions_per_week <= 2 ? 1.375 :
      sessions_per_week <= 4 ? 1.55 :
        1.725

  const tdee = bmr * activityMultiplier
  const calorieTarget =
    fitness_goal === 'lose_fat' ? Math.round(tdee * 0.85) :
      fitness_goal === 'build_muscle' ? Math.round(tdee * 1.1) :
        Math.round(tdee)

  const proteinMultiplier =
    fitness_goal === 'build_muscle' ? 2.0 :
      fitness_goal === 'lose_fat' ? 1.8 : 1.6

  return {
    calories: calorieTarget,
    protein: Math.round(weight_kg * proteinMultiplier),
  }
}

export async function generateAndSavePlan(userId, profile) {
  const { data: allExercises, error } = await supabase
    .from('exercises')
    .select('id, name, equipment_needed, muscle_groups, is_compound')
  if (error) {
    console.error('Failed to fetch exercises:', error)
    throw error
  }

  const eligible = filterByEquipment(allExercises, profile.equipment_available)

  const exerciseMap = {}
  eligible.forEach(ex => { exerciseMap[ex.name.toLowerCase().trim()] = ex })

  const prompt = buildPlanPrompt(profile, eligible)
  const plan = await callGemini(prompt)

  const { calories, protein } = calcNutrition(profile)
  if (calories || protein) {
    await supabase
      .from('profiles')
      .update({ daily_calorie_target: calories, daily_protein_target: protein })
      .eq('id', userId)
  }

  const { data: savedPlan, error: planErr } = await supabase
    .from('workout_plans')
    .insert({ user_id: userId, name: plan.planName, created_by_ai: true })
    .select()
    .single()
  if (planErr) throw planErr

  for (const day of plan.days) {
    const exerciseIds = (day.exercises || [])
      .map(e => {
        const match = resolveExerciseByName(e.exerciseName, eligible, exerciseMap)
        if (!match) {
          console.warn('Plan: could not match exercise:', e.exerciseName)
          return null
        }
        return { exerciseId: match.id, sets: e.sets, repRange: e.repRange }
      })
      .filter(Boolean)

    await supabase.from('plan_days').insert({
      plan_id: savedPlan.id,
      day_name: day.dayName,
      day_order: day.dayOrder,
      exercise_ids: exerciseIds,
    })
  }

  return savedPlan
}

export async function generateOneOffSession(userId, profile) {
  const { data: allExercises, error: exErr } = await supabase
    .from('exercises')
    .select('id, name, equipment_needed, muscle_groups, is_compound')
  if (exErr) {
    console.error('Failed to fetch exercises:', exErr)
    throw exErr
  }
  const eligible = filterByEquipment(allExercises, profile.equipment_available)

  const exerciseMap = {}
  eligible.forEach(ex => { exerciseMap[ex.name.toLowerCase().trim()] = ex })

  const weekStart = getWeekStart()
  const { data: volumeRows } = await supabase
    .from('muscle_volume_log')
    .select('muscle_group, total_sets')
    .eq('user_id', userId)
    .eq('week_start', weekStart)

  const volumeThisWeek = {}
  volumeRows?.forEach(r => { volumeThisWeek[r.muscle_group] = r.total_sets })

  const prompt = buildSessionPrompt(profile, eligible, volumeThisWeek)
  const result = await callGemini(prompt)

  const exercises = (result.exercises || [])
    .map(e => {
      const match = resolveExerciseByName(e.exerciseName, eligible, exerciseMap)
      if (!match) {
        console.warn('Session: could not match exercise:', e.exerciseName)
        return null
      }
      return { exercise: match, sets: e.sets, repRange: e.repRange }
    })
    .filter(Boolean)

  const sessionRow = {
    user_id: userId,
    plan_day_id: null,
    date: new Date().toISOString().split('T')[0],
    notes: JSON.stringify({
      sessionName: result.sessionName,
      generatedExerciseIds: exercises.map(e => e.exercise.id),
    }),
  }
  console.log('Inserting session:', JSON.stringify(sessionRow, null, 2))

  const { data: session, error: sessErr } = await supabase
    .from('sessions')
    .insert(sessionRow)
    .select()
    .single()
  if (sessErr) {
    console.error('Session insert failed:', JSON.stringify(sessErr, null, 2))
    throw sessErr
  }

  return { session, exercises, sessionName: result.sessionName }
}

export function getWeekStart() {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const d = new Date(now)
  d.setDate(diff)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export async function generateSessionFromPreferences(userId, profile, preferences) {
  // Fetch exercises, filter by equipment then muscle group
  const { data: allExercises, error: exErr } = await supabase
    .from('exercises')
    .select('id, name, muscle_groups, equipment_needed, is_compound')
  if (exErr) {
    console.error('Failed to fetch exercises:', exErr)
    throw exErr
  }

  const equipFiltered = filterByEquipment(allExercises, profile.equipment_available)
  const eligible = filterByMuscleGroups(equipFiltered, preferences.muscleGroups)

  // Step 1 — Names-only list for Groq
  const nameList = eligible.map(e => e.name).join('\n')

  // Build lookup map for post-Groq resolution
  const exerciseMap = {}
  eligible.forEach(ex => { exerciseMap[ex.name.toLowerCase().trim()] = ex })

  // Last 5 sessions with max weight per exercise
  const { data: sessionRows } = await supabase
    .from('sessions')
    .select('id, date')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(5)

  let recentSessionsSummary = '  No previous sessions.'
  if (sessionRows?.length > 0) {
    const sessionIds = sessionRows.map(s => s.id)
    const { data: sets } = await supabase
      .from('session_sets')
      .select('session_id, exercise_id, weight_kg, reps')
      .in('session_id', sessionIds)
      .eq('completed', true)

    const exIds = [...new Set((sets || []).map(s => s.exercise_id))]
    let exMap = {}
    if (exIds.length > 0) {
      const { data: exs } = await supabase
        .from('exercises')
        .select('id, name')
        .in('id', exIds)
      exs?.forEach(e => { exMap[e.id] = e.name })
    }

    const lines = sessionRows.map(sess => {
      const sessSets = (sets || []).filter(s => s.session_id === sess.id)
      const byEx = {}
      sessSets.forEach(s => {
        if (!byEx[s.exercise_id]) byEx[s.exercise_id] = { name: exMap[s.exercise_id] ?? 'Unknown', max: 0 }
        byEx[s.exercise_id].max = Math.max(byEx[s.exercise_id].max, s.weight_kg || 0)
      })
      const exStr = Object.values(byEx).map(e => `${e.name}: ${e.max}kg`).join(', ')
      return `  ${sess.date}: ${exStr || 'No sets recorded'}`
    })
    recentSessionsSummary = lines.join('\n')
  }

  // This week's volume
  const weekStart = getWeekStart()
  const { data: volRows } = await supabase
    .from('muscle_volume_log')
    .select('muscle_group, total_sets')
    .eq('user_id', userId)
    .eq('week_start', weekStart)

  const volSummary = (volRows || []).length > 0
    ? (volRows || []).map(r => `  ${r.muscle_group}: ${r.total_sets} sets`).join('\n')
    : '  None yet this week'

  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' })
  const dateStr = new Date().toISOString().split('T')[0]
  const muscleGroupsStr = (preferences.muscleGroups || []).join(', ') || 'Full Body'

  // Step 2 — Prompt with names only, exerciseName in response schema
  const prompt = `You are an expert strength and conditioning coach. Generate a complete workout session with specific sets, reps, and starting weights for every exercise. Use the user data below to make every value realistic and appropriate.

USER PROFILE:
- Age: ${profile.age ?? 'unknown'}
- Body weight: ${profile.weight_kg ? profile.weight_kg + 'kg' : 'unknown'}
- Height: ${profile.height_cm ? profile.height_cm + 'cm' : 'unknown'}
- Goal: ${GOAL_LABELS[profile.fitness_goal] ?? profile.fitness_goal}
- Experience: ${profile.experience_level}
- Equipment: ${EQUIPMENT_LABELS[profile.equipment_available] ?? profile.equipment_available}
- Injuries/limitations: ${profile.injuries || 'none'}

SESSION PREFERENCES:
- Muscle groups to train: ${muscleGroupsStr}
- Time available: ${preferences.minutes} minutes
- Energy level today: ${preferences.feeling}

TODAY: ${dayName}, ${dateStr}

RECENT TRAINING HISTORY (last 5 sessions):
${recentSessionsSummary}

THIS WEEK'S VOLUME SO FAR:
${volSummary}

AVAILABLE EXERCISES (use ONLY these exact names, spelled exactly as shown):
${nameList}

RULES FOR GENERATING SETS, REPS, AND RPE:
1. For goal = build_muscle: 3-4 sets of 8-12 reps, RPE 7-8
2. For goal = build_strength: 4-5 sets of 3-6 reps, RPE 8-9
3. For goal = lose_fat: 3-4 sets of 12-15 reps, RPE 6-7
4. For goal = improve_fitness: 3 sets of 10-15 reps, RPE 6-8
5. For feeling = tired: reduce sets by 1, use lower end of rep range, reduce RPE by 1
6. For feeling = fresh: use top of rep range and normal RPE
7. Never include exercises that load the injured area: ${profile.injuries || 'none'}
8. Do not exceed ${preferences.minutes} minutes total. Estimate 3 minutes per set including rest.
9. Do not train muscle groups that already exceed their weekly volume target.
10. targetRPE is a number 1-10 (1=very easy, 10=absolute max effort). Must be between 5 and 10.

Return ONLY a valid JSON object with no markdown, no backticks, no explanation. Exact structure:
{"sessionName":"string","estimatedDuration":number,"exercises":[{"exerciseName":"string","sets":number,"repRange":"string","targetRPE":number,"notes":"string"}]}
Return only valid JSON. No markdown, no backticks, no explanation.`

  const result = await callGemini(prompt)

  // Step 3 — ID lookup after Groq responds using three-tier name matching
  const processedExercises = (result.exercises || [])
    .map(ex => {
      const match = resolveExerciseByName(ex.exerciseName, eligible, exerciseMap)
      if (!match) {
        console.warn('Could not match exercise:', ex.exerciseName)
        return null
      }
      return {
        exercise: match,
        sets: ex.sets || 3,
        repRange: ex.repRange || '8-12',
        targetRPE: ex.targetRPE ?? null,
        notes: ex.notes || null,
      }
    })
    .filter(Boolean)

  // Step 4 — Safety check before inserting
  const allMatched = processedExercises.every(ex => ex.exercise?.id)
  if (!allMatched || processedExercises.length === 0) {
    console.error('Some exercises could not be matched. Aborting session save.')
    throw new Error('Could not match all exercises to the database. Please try generating again.')
  }

  // Step 5 — Sessions insert with explicit fields and logging
  const { data: { user: authUser } } = await supabase.auth.getUser()

  const sessionRow = {
    user_id: authUser.id,
    plan_day_id: null,
    date: dateStr,
    notes: JSON.stringify({
      sessionName: result.sessionName,
      generatedExerciseIds: processedExercises.map(ex => ex.exercise.id),
    }),
  }
  console.log('Inserting session:', JSON.stringify(sessionRow, null, 2))

  const { data: session, error: sessErr } = await supabase
    .from('sessions')
    .insert(sessionRow)
    .select()
    .single()
  if (sessErr) {
    console.error('Session insert failed:', JSON.stringify(sessErr, null, 2))
    throw sessErr
  }

  return { session, exercises: processedExercises, sessionName: result.sessionName }
}
