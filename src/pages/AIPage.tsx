import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useWorkout } from '../context/WorkoutContext'
import { callAgent, parseAgentJSON } from '../lib/geminiAgent'
import { buildAgentContext } from '../lib/agentContext'

interface ChatMessage {
  id: number
  role: 'user' | 'agent'
  text: string | null
  showApplyBtn?: boolean
  originalUserMsg?: string
}

const QUICK_PROMPTS = [
  "Adjust today's workout",
  "What should I eat for recovery?",
  "Am I overtraining?",
  "How close am I to my goal?",
  "Generate a warm-up",
  "What's my weakest muscle group this week?",
  "Should I take a rest day?",
  "Give me a high-protein meal idea",
]

function TypingDots() {
  const [count, setCount] = useState(1)
  useEffect(() => {
    const id = setInterval(() => setCount(c => c >= 3 ? 1 : c + 1), 400)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', padding: '2px 0' }}>
      {[1, 2, 3].map(i => (
        <span key={i} style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: i <= count ? 'var(--muted)' : 'var(--dim)',
          transition: 'background 0.2s',
        }} />
      ))}
    </span>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header: {
    padding: '20px 28px 16px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  titleRow: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' },
  pulse: {
    width: '10px', height: '10px', borderRadius: '50%',
    background: 'var(--accent)', boxShadow: '0 0 8px rgba(200,245,90,0.8)',
    animation: 'pulse 2s infinite',
  },
  title: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '26px', letterSpacing: '0.04em' },
  chipsLabel: { fontSize: '9px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '6px' },
  contextRow: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' },
  chip: {
    fontSize: '11px', fontWeight: '500', padding: '4px 10px',
    background: 'var(--accent-dim)', border: '1px solid rgba(200,245,90,0.2)',
    borderRadius: '20px', color: 'var(--accent)',
  },
  quickRow: {
    display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px',
    scrollbarWidth: 'none',
  },
  quickChip: {
    fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: '20px', color: 'var(--muted)', cursor: 'pointer',
    flexShrink: 0, transition: 'border-color 0.15s, color 0.15s',
  },
  messages: {
    flex: 1, overflowY: 'auto',
    padding: '20px 28px',
    display: 'flex', flexDirection: 'column', gap: '14px',
  },
  msgUser: {
    alignSelf: 'flex-end', maxWidth: '70%',
    background: 'var(--accent)', color: '#0a0a0a',
    borderRadius: '14px 14px 2px 14px',
    padding: '10px 14px', fontSize: '14px', fontWeight: '500', lineHeight: '1.5',
  },
  msgAgent: {
    alignSelf: 'flex-start', maxWidth: '80%',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: '2px 14px 14px 14px',
    padding: '12px 16px', fontSize: '14px', color: 'var(--text)',
    lineHeight: '1.7', whiteSpace: 'pre-wrap',
  },
  msgTyping: {
    alignSelf: 'flex-start',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: '2px 14px 14px 14px',
    padding: '14px 18px',
  },
  applyBtn: {
    marginTop: '8px', fontSize: '12px', fontWeight: '600',
    padding: '6px 12px', background: 'var(--accent-dim)',
    border: '1px solid rgba(200,245,90,0.3)', borderRadius: '6px',
    color: 'var(--accent)', cursor: 'pointer', display: 'inline-block',
  },
  inputArea: {
    padding: '16px 28px',
    borderTop: '1px solid var(--border)',
    display: 'flex', gap: '10px', alignItems: 'flex-end',
    flexShrink: 0,
  },
  input: {
    flex: 1, padding: '10px 14px',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: '10px', color: 'var(--text)', fontSize: '14px',
    outline: 'none', resize: 'none', lineHeight: '1.5',
    fontFamily: 'inherit', transition: 'border-color 0.15s',
    maxHeight: '100px',
  },
  sendBtn: {
    width: '40px', height: '40px', borderRadius: '10px',
    background: 'var(--accent)', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, transition: 'opacity 0.15s',
  },
}

export default function AIPage() {
  const { user } = useAuth()
  const { activeSessionExercises, setWorkoutUpdate } = useWorkout()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [contextChips, setContextChips] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (user) loadContextChips()
  }, [user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  async function loadContextChips() {
    try {
      const ctx = await buildAgentContext(user!.id)
      const chips: string[] = []
      if (ctx.todayDay?.dayName) chips.push(ctx.todayDay.dayName)
      if (ctx.todayNutrition.protein > 0) chips.push(`Protein: ${ctx.todayNutrition.protein}g today`)
      const now = new Date()
      const start = new Date(now.getFullYear(), 0, 1)
      const weekNum = Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)
      chips.push(`Week ${weekNum}`)
      if (ctx.profile?.injuries && ctx.profile.injuries !== 'None' && ctx.profile.injuries) {
        chips.push(`Injury: ${ctx.profile.injuries}`)
      }
      setContextChips(chips)
    } catch { /* non-critical */ }
  }

  async function sendMessage(text: string) {
    const msg = text.trim()
    if (!msg || isTyping) return
    setInput('')
    const userMsg: ChatMessage = { id: Date.now(), role: 'user', text: msg }
    setMessages(prev => [...prev, userMsg])
    setIsTyping(true)

    const responseText = await callAgent(user!.id, msg, null, [...messages, userMsg])
    setIsTyping(false)

    const exerciseNames = activeSessionExercises.map(e => e.name.toLowerCase())
    const mentionsCurrentSession = exerciseNames.length > 0 &&
      exerciseNames.some(name => (responseText ?? '').toLowerCase().includes(name))

    setMessages(prev => [...prev, {
      id: Date.now() + 1,
      role: 'agent',
      text: responseText,
      showApplyBtn: mentionsCurrentSession,
      originalUserMsg: msg,
    }])
  }

  async function applyWorkoutChanges(originalMsg: string) {
    setIsTyping(true)
    const text = await callAgent(user!.id, originalMsg, 'workout')
    setIsTyping(false)
    const parsed = parseAgentJSON(text)
    if (parsed) {
      setWorkoutUpdate(parsed as Record<string, unknown>)
      setMessages(prev => [...prev, { id: Date.now(), role: 'agent', text: 'Workout updated. Head to the Workout page to see the changes.' }])
    } else {
      setMessages(prev => [...prev, { id: Date.now(), role: 'agent', text: 'Could not parse the workout update. Try rephrasing your request.' }])
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
      <div style={s.page}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.titleRow}>
            <div style={s.pulse} />
            <h1 style={s.title}>KavaFit AI Coach</h1>
          </div>

          {contextChips.length > 0 && (
            <>
              <div style={s.chipsLabel}>Active context</div>
              <div style={s.contextRow}>
                {contextChips.map(chip => (
                  <span key={chip} style={s.chip}>{chip}</span>
                ))}
              </div>
            </>
          )}

          <div style={{ ...s.chipsLabel, marginTop: '4px' }}>Quick prompts</div>
          <div style={s.quickRow}>
            {QUICK_PROMPTS.map(p => (
              <button
                key={p}
                style={s.quickChip}
                onClick={() => sendMessage(p)}
                onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div style={s.messages}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: '40px', color: 'var(--muted)' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏋️</div>
              <p style={{ fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>Your AI fitness coach</p>
              <p style={{ fontSize: '13px', color: 'var(--dim)' }}>Powered by your real training data. Ask anything.</p>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id}>
              <div style={msg.role === 'user' ? s.msgUser : s.msgAgent}>{msg.text}</div>
              {msg.showApplyBtn && (
                <button style={s.applyBtn} onClick={() => applyWorkoutChanges(msg.originalUserMsg ?? '')}>
                  Apply these changes →
                </button>
              )}
            </div>
          ))}
          {isTyping && (
            <div style={s.msgTyping}><TypingDots /></div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div style={s.inputArea}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your coach…"
            rows={1}
            style={s.input}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <button
            style={{ ...s.sendBtn, ...(isTyping ? { opacity: 0.4, pointerEvents: 'none' } : {}) }}
            onClick={() => sendMessage(input)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="#0a0a0a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </>
  )
}
