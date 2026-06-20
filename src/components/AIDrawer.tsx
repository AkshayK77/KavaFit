import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useWorkout } from '../context/WorkoutContext'
import { useUI } from '../context/UIContext'
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
  "What should I eat?",
  "Am I overtraining?",
  "How close am I to my goal?",
  "Generate a warm-up",
]

function TypingDots() {
  const [count, setCount] = useState(1)
  useEffect(() => {
    const id = setInterval(() => setCount(c => c >= 3 ? 1 : c + 1), 400)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{ display: 'inline-flex', gap: '3px', alignItems: 'center', padding: '2px 0' }}>
      {[1, 2, 3].map(i => (
        <span key={i} style={{
          width: '5px', height: '5px', borderRadius: '50%',
          background: i <= count ? 'var(--muted)' : 'var(--dim)',
          transition: 'background 0.2s',
        }} />
      ))}
    </span>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  drawer: {
    position: 'fixed',
    bottom: '84px',
    right: '24px',
    width: '360px',
    height: '500px',
    background: 'var(--surface)',
    border: '1px solid var(--border2)',
    borderRadius: '16px',
    zIndex: 300,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
    animation: 'drawerSlideUp 0.2s ease',
  },
  header: {
    padding: '14px 16px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '8px' },
  title: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '17px', letterSpacing: '0.06em', color: 'var(--text)' },
  pulse: {
    width: '8px', height: '8px', borderRadius: '50%',
    background: 'var(--accent)',
    boxShadow: '0 0 6px rgba(200,245,90,0.8)',
    animation: 'pulse 2s infinite',
  },
  closeBtn: {
    background: 'none', border: 'none', color: 'var(--muted)',
    fontSize: '14px', cursor: 'pointer', padding: '4px 6px', borderRadius: '4px',
  },
  chipsArea: {
    padding: '10px 14px 0',
    flexShrink: 0,
  },
  chipsLabel: { fontSize: '9px', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '6px' },
  chipsRow: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' },
  chip: {
    fontSize: '10px', fontWeight: '500', padding: '3px 8px',
    background: 'var(--accent-dim)', border: '1px solid rgba(200,245,90,0.2)',
    borderRadius: '20px', color: 'var(--accent)', whiteSpace: 'nowrap',
  },
  quickRow: {
    display: 'flex', gap: '6px',
    overflowX: 'auto', paddingBottom: '8px',
    scrollbarWidth: 'none',
  },
  quickChip: {
    fontSize: '11px', padding: '5px 10px', whiteSpace: 'nowrap',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: '20px', color: 'var(--muted)', cursor: 'pointer',
    flexShrink: 0, transition: 'border-color 0.15s, color 0.15s',
  },
  divider: { height: '1px', background: 'var(--border)', flexShrink: 0 },
  messages: {
    flex: 1, overflowY: 'auto', padding: '12px 14px',
    display: 'flex', flexDirection: 'column', gap: '10px',
  },
  msgUser: {
    alignSelf: 'flex-end', maxWidth: '85%',
    background: 'var(--accent)', color: '#0a0a0a',
    borderRadius: '12px 12px 2px 12px',
    padding: '8px 12px', fontSize: '13px', fontWeight: '500',
    lineHeight: '1.5',
  },
  msgAgent: {
    alignSelf: 'flex-start', maxWidth: '90%',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: '2px 12px 12px 12px',
    padding: '8px 12px', fontSize: '13px', color: 'var(--text)',
    lineHeight: '1.6', whiteSpace: 'pre-wrap',
  },
  msgTyping: {
    alignSelf: 'flex-start',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: '2px 12px 12px 12px',
    padding: '10px 14px',
  },
  applyBtn: {
    marginTop: '6px', fontSize: '11px', fontWeight: '600',
    padding: '5px 10px', background: 'var(--accent-dim)',
    border: '1px solid rgba(200,245,90,0.3)', borderRadius: '6px',
    color: 'var(--accent)', cursor: 'pointer', display: 'block',
  },
  inputArea: {
    padding: '10px 12px',
    borderTop: '1px solid var(--border)',
    display: 'flex', gap: '8px', alignItems: 'flex-end',
    flexShrink: 0,
  },
  input: {
    flex: 1, padding: '8px 12px',
    background: 'var(--surface2)', border: '1px solid var(--border)',
    borderRadius: '8px', color: 'var(--text)', fontSize: '13px',
    outline: 'none', resize: 'none', lineHeight: '1.5',
    fontFamily: 'inherit', transition: 'border-color 0.15s',
    maxHeight: '80px',
  },
  sendBtn: {
    width: '34px', height: '34px', borderRadius: '8px',
    background: 'var(--accent)', border: 'none',
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexShrink: 0,
    transition: 'opacity 0.15s',
  },
}

// ─── component ────────────────────────────────────────────────────────────────

const AIDrawer = React.memo(function AIDrawer({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const { activeSessionExercises, setWorkoutUpdate } = useWorkout()
  const { drawerInitMessage, setDrawerInitMessage } = useUI()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [contextChips, setContextChips] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (user) loadContextChips()
    if (drawerInitMessage) {
      setInput(drawerInitMessage)
      setDrawerInitMessage('')
    }
    inputRef.current?.focus()
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
      const weekNum = getWeekNumber()
      chips.push(`Week ${weekNum}`)
      if (ctx.profile?.injuries && ctx.profile.injuries !== 'None' && ctx.profile.injuries) {
        chips.push(`Injury: ${ctx.profile.injuries}`)
      }
      setContextChips(chips)
    } catch {
      // Non-critical
    }
  }

  function getWeekNumber() {
    const now = new Date()
    const start = new Date(now.getFullYear(), 0, 1)
    return Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)
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
    const responseLC = (responseText ?? '').toLowerCase()
    const mentionsCurrentSession = exerciseNames.length > 0 &&
      exerciseNames.some(name => responseLC.includes(name))

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
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'agent',
        text: 'Workout updated. Head to the Workout page to see the changes.',
      }])
    } else {
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'agent',
        text: 'Could not parse the workout update. Try rephrasing your request.',
      }])
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
        @keyframes drawerSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      {/* Click-outside overlay — transparent, just captures clicks */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 299 }}
        onClick={onClose}
      />

      <div style={s.drawer}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.headerLeft}>
            <div style={s.pulse} />
            <span style={s.title}>KavaFit AI Coach</span>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Context chips */}
        {contextChips.length > 0 && (
          <div style={s.chipsArea}>
            <div style={s.chipsLabel}>Context</div>
            <div style={s.chipsRow}>
              {contextChips.map(chip => (
                <span key={chip} style={s.chip}>{chip}</span>
              ))}
            </div>
          </div>
        )}

        {/* Quick prompt chips */}
        <div style={{ ...s.chipsArea, paddingTop: '0', paddingBottom: '0' }}>
          <div style={s.chipsLabel}>Quick prompts</div>
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

        <div style={s.divider} />

        {/* Messages */}
        <div style={s.messages}>
          {messages.length === 0 && (
            <p style={{ fontSize: '12px', color: 'var(--dim)', textAlign: 'center', marginTop: '20px' }}>
              Ask me anything about your training, nutrition, or recovery.
            </p>
          )}
          {messages.map(msg => (
            <div key={msg.id}>
              <div style={msg.role === 'user' ? s.msgUser : s.msgAgent}>
                {msg.text}
              </div>
              {msg.showApplyBtn && (
                <button style={s.applyBtn} onClick={() => applyWorkoutChanges(msg.originalUserMsg ?? '')}>
                  Apply these changes →
                </button>
              )}
            </div>
          ))}
          {isTyping && (
            <div style={s.msgTyping}>
              <TypingDots />
            </div>
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="#0a0a0a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </>
  )
})

export default AIDrawer
