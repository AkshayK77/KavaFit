import { supabase } from './supabase'

// Must match keys in VOLUME_THRESHOLDS / mapToVolumeGroup in volumeTracker.js
const ALLOWED_GROUPS = ['chest', 'shoulders', 'triceps', 'lats', 'mid_back', 'biceps', 'quads', 'hamstrings', 'glutes', 'calves', 'forearms']

/**
 * Uses the LLM to map a free-text exercise name to muscle groups the app understands.
 * Returns an array of strings from ALLOWED_GROUPS (1-3 items), or [] on failure.
 */
export async function classifyExercise(exerciseName: string): Promise<string[]> {
  const prompt = `Which primary muscle groups does the exercise "${exerciseName}" train?
Return a JSON array using ONLY values from this exact list: ${ALLOWED_GROUPS.join(', ')}.
Pick 1 to 3 most relevant groups. Return only the JSON array, nothing else.`

  try {
    const { data, error } = await supabase.functions.invoke('ai-proxy', {
      body: {
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.2,
      },
    })

    if (error || !data?.content) return []

    const text: string = data.content.trim()
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(cleaned)

    if (!Array.isArray(parsed)) return []
    return parsed.filter((g: unknown) => typeof g === 'string' && ALLOWED_GROUPS.includes(g))
  } catch {
    return []
  }
}
