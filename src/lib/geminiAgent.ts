import { supabase } from './supabase'
import { buildAgentContext } from './agentContext'
import { track } from './analytics'
import { showGlobalToast } from './globalToast'
import type { AgentSpecialMode } from '../types/app'

interface HistoryMessage {
  role: string
  text: string | null
}

function buildSystemPrompt(ctx: Awaited<ReturnType<typeof buildAgentContext>>, specialMode: AgentSpecialMode | null): string {
  const { profile, recentSessions, weeklyVolume, todayNutrition, todayDay } = ctx

  let prompt = `You are Forge, an expert AI fitness coach built into the Forge fitness app. You have complete knowledge of this user's data shown below. Always respond specifically using their data — never give generic advice. Be direct, practical, and concise. Do not repeat information the user already knows.

USER PROFILE:
${JSON.stringify(profile, null, 2)}

THIS WEEK'S TRAINING VOLUME:
${JSON.stringify(weeklyVolume, null, 2)}

RECENT SESSIONS (last 10):
${JSON.stringify(recentSessions, null, 2)}

TODAY'S NUTRITION:
Calories consumed: ${todayNutrition.calories}${todayNutrition.calorieTarget ? ' / ' + todayNutrition.calorieTarget + ' target' : ''}
Protein consumed: ${todayNutrition.protein}g${todayNutrition.proteinTarget ? ' / ' + todayNutrition.proteinTarget + 'g target' : ''}

TODAY'S SCHEDULED WORKOUT:
${todayDay ? `${todayDay.dayName}: ${todayDay.exercises.join(', ') || 'No exercises listed'}` : 'Rest day'}`

  if (specialMode === 'flags') {
    prompt += '\n\nReturn a JSON array of 1-3 flag objects: [{message: string, severity: "info"|"warning"|"success"}]. Return only the JSON array, no other text.'
  } else if (specialMode === 'recipe') {
    prompt += '\n\nReturn only a JSON object with fields: recipeName, ingredients (array of {item, quantity}), steps (array of strings), proteinG, carbsG, fatG, calories. No other text.'
  } else if (specialMode === 'workout') {
    prompt += '\n\nReturn only a JSON object: {"sessionName": "string", "exercises": [{"exerciseName": "string", "sets": 3, "repRange": "8-12"}]}. No other text.'
  } else if (specialMode === 'warmup') {
    prompt += '\n\nReturn only a JSON array of exactly 5 warm-up exercises: [{"exercise": "string", "sets": number, "reps": "string", "notes": "string"}]. No other text.'
  } else if (specialMode === 'grocery') {
    prompt += '\n\nReturn only a JSON object with exactly these keys: Proteins, Carbs, Vegetables, Fats, Other — each an array of item strings. No other text.'
  }

  return prompt
}

export function parseAgentJSON(text: string | null): unknown {
  if (!text) return null
  try {
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

export async function callAgent(
  userId: string,
  userMessage: string | null,
  specialMode: AgentSpecialMode | null = null,
  history: HistoryMessage[] = []
): Promise<string | null> {
  try {
    const ctx = await buildAgentContext(userId)
    const systemPrompt = buildSystemPrompt(ctx, specialMode)

    const prompt = userMessage || 'Analyse my current training and provide key insights.'
    const historyMessages: Array<{ role: 'user' | 'assistant'; content: string }> = history
      .filter(m => m.text != null)
      .map(m => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text as string,
      }))

    const messages = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: prompt },
    ]

    track('ai_message_sent', { mode: specialMode || 'chat' })

    const { data, error } = await supabase.functions.invoke('ai-proxy', {
      body: { messages, model: 'llama-3.3-70b-versatile', temperature: 0.7 },
    })

    if (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (error as any)?.context?.status
      if (status === 429) {
        showGlobalToast("You're sending messages too fast. Please wait a moment.", 'warning')
        if (specialMode) return null
        return "You're sending messages too quickly. Please wait a moment before trying again."
      }
      throw error
    }

    return data?.content || ''
  } catch (err) {
    console.error('AI agent error:', err)
    if (specialMode) return null
    return "I couldn't connect right now. Please try again."
  }
}
