const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

// Must match keys in VOLUME_THRESHOLDS / mapToVolumeGroup in volumeTracker.js
const ALLOWED_GROUPS = ['chest', 'shoulders', 'triceps', 'lats', 'mid_back', 'biceps', 'quads', 'hamstrings', 'glutes', 'calves', 'forearms']

/**
 * Uses the LLM to map a free-text exercise name to muscle groups the app understands.
 * Returns an array of strings from ALLOWED_GROUPS (1-3 items), or [] on failure.
 */
export async function classifyExercise(exerciseName) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY
  if (!apiKey) return []

  const prompt = `Which primary muscle groups does the exercise "${exerciseName}" train?
Return a JSON array using ONLY values from this exact list: ${ALLOWED_GROUPS.join(', ')}.
Pick 1 to 3 most relevant groups. Return only the JSON array, nothing else.`

  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      }),
    })

    if (!res.ok) return []

    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content?.trim() || ''
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(cleaned)

    if (!Array.isArray(parsed)) return []
    return parsed.filter(g => ALLOWED_GROUPS.includes(g))
  } catch {
    return []
  }
}
