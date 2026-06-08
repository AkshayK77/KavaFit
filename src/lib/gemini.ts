import { supabase } from './supabase'

export async function callGemini(prompt: string): Promise<Record<string, unknown>> {
  const jsonOnlySuffix = 'Return only valid JSON. No markdown, no backticks, no explanation, no text before or after the JSON object.'
  const finalPrompt = `${prompt.trim()}\n\n${jsonOnlySuffix}`

  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: {
      messages: [{ role: 'user', content: finalPrompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
    },
  })

  if (error) throw new Error(error.message)

  const text = data?.content
  if (!text) throw new Error('AI returned no content')

  const cleaned = text
    .trim()
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    console.error('AI returned non-JSON:', text)
    throw new Error('AI response was not valid JSON. Check the console for the raw response.')
  }
}
