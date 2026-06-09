import React, { ReactNode } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useUI } from '../context/UIContext'
import AIDrawer from './AIDrawer'
import { useIsMobile } from '../hooks/useIsMobile'

const ACTIVE_SESSION_KEY = 'forge_active_session_v1'

interface ActiveTimer {
  sessionName: string
  elapsed: number
  isPaused: boolean
}

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', icon: GridIcon },
  { label: 'Workout',   path: '/workout',   icon: DumbbellIcon },
  { label: 'Body Lab',  path: '/anatomy',   icon: BodyIcon },
  { label: 'Progress',  path: '/progress',  icon: ChartIcon },
  { label: 'Nutrition', path: '/nutrition', icon: NutritionIcon },
  { label: 'AI Coach',  path: '/ai',        icon: ChatNavIcon },
]

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, avatarUrl } = useAuth()
  const { drawerOpen, setDrawerOpen } = useUI()
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null)

  useEffect(() => {
    const id = setInterval(() => {
      let stored: Record<string, unknown> | null
      try {
        const raw = localStorage.getItem(ACTIVE_SESSION_KEY)
        stored = raw ? JSON.parse(raw) : null
      } catch {
        stored = null
      }

      if (!stored || (user && stored.userId && stored.userId !== user.id)) {
        setActiveTimer(null)
        return
      }

      const startTime = stored.startTime as number | undefined
      if (!startTime) { setActiveTimer(null); return }

      const now = Date.now()
      const pausedTime = (stored.pausedTime as number) || 0
      const isPaused = !!(stored.isPaused)
      const pauseStart = (stored.pauseStart as number) || null
      const livePaused = isPaused && pauseStart ? now - pauseStart : 0
      const elapsed = Math.max(0, Math.floor((now - startTime - pausedTime - livePaused) / 1000))
      const activeSession = stored.activeSession as { name?: string } | undefined

      setActiveTimer({ sessionName: activeSession?.name || 'Active session', elapsed, isPaused })
    }, 1000)

    return () => clearInterval(id)
  }, [user])

  const initials = (() => {
    const name = user?.user_metadata?.full_name as string | undefined
    if (name) return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    return (user?.email?.[0] ?? 'U').toUpperCase()
  })()

  return (
    <div style={{ ...s.shell, paddingBottom: isMobile ? '64px' : 0 }}>
      {/* Top bar */}
      <header style={{ ...s.topbar, padding: isMobile ? '0 14px' : '0 20px' }}>
        <div style={s.brand}>
          <BrandMark />
          <span style={s.brandName}>FORGE</span>
        </div>

        {/* Desktop nav — hidden on mobile */}
        {!isMobile && (
          <nav style={s.navTabs}>
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                style={({ isActive }) => ({ ...s.navBtn, ...(isActive ? s.navBtnActive : {}) })}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}

        <div style={s.topbarRight}>
          {activeTimer && (
            <button
              style={{ ...s.timerPill, ...(activeTimer.isPaused ? s.timerPillPaused : {}), maxWidth: isMobile ? '120px' : 'none' }}
              onClick={() => navigate('/workout')}
              title="Return to workout"
            >
              {!isMobile && <span style={s.timerLabel}>{activeTimer.sessionName}</span>}
              <span style={s.timerValue}>{fmtTime(activeTimer.elapsed)}</span>
            </button>
          )}
          <div
            style={{ ...s.avatar, cursor: 'pointer', overflow: 'hidden', padding: 0 }}
            title="Settings"
            onClick={() => navigate('/settings')}
          >
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }} />
              : initials
            }
          </div>
        </div>
      </header>

      {/* Page content */}
      <main style={s.content}>{children}</main>

      {/* Floating AI button — desktop only (mobile has it in bottom nav) */}
      {!isMobile && (
        <button style={s.floatBtn} onClick={() => setDrawerOpen(prev => !prev)} title="AI Coach">
          <ChatIcon />
        </button>
      )}

      {/* Mobile bottom tab bar */}
      {isMobile && (
        <nav style={s.bottomNav}>
          {NAV_ITEMS.map(item => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <NavLink
                key={item.path}
                to={item.path}
                style={s.bottomTab}
              >
                <span style={{ ...s.bottomTabIcon, color: isActive ? 'var(--accent)' : 'var(--dim)' }}>
                  <Icon size={22} active={isActive} />
                </span>
                <span style={{ ...s.bottomTabLabel, color: isActive ? 'var(--accent)' : 'var(--dim)' }}>
                  {item.label}
                </span>
              </NavLink>
            )
          })}
        </nav>
      )}

      {/* AI Drawer */}
      {drawerOpen && <AIDrawer onClose={() => setDrawerOpen(false)} />}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  shell: { display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden' },
  topbar: {
    height: '52px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexShrink: 0, position: 'relative', zIndex: 10,
  },
  brand: { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 },
  brandName: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '20px', letterSpacing: '0.1em', color: 'var(--text)' },
  navTabs: { display: 'flex', gap: '2px', position: 'absolute', left: '50%', transform: 'translateX(-50%)' },
  navBtn: {
    padding: '6px 14px', background: 'transparent', color: 'var(--muted)',
    fontSize: '13px', fontWeight: '400', borderRadius: '6px',
    textDecoration: 'none', transition: 'all 0.15s', whiteSpace: 'nowrap',
  },
  navBtnActive: { color: 'var(--accent)', background: 'var(--accent-dim)' },
  topbarRight: { display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 },
  timerPill: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '6px 10px', borderRadius: '10px',
    border: '1px solid var(--border)', background: 'var(--surface2)',
    color: 'var(--text)', cursor: 'pointer',
  },
  timerPillPaused: { opacity: 0.6 },
  timerLabel: { fontSize: '11px', color: 'var(--muted)', maxWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  timerValue: { fontFamily: 'Bebas Neue, sans-serif', fontSize: '16px', color: 'var(--accent)', letterSpacing: '0.04em' },
  avatar: {
    width: '30px', height: '30px', borderRadius: '50%',
    background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '11px', fontWeight: '600', color: 'var(--accent)',
    userSelect: 'none',
  },
  content: { flex: 1, overflowY: 'auto', overflowX: 'hidden' },
  floatBtn: {
    position: 'fixed', bottom: '24px', right: '24px',
    width: '52px', height: '52px', borderRadius: '50%',
    background: 'var(--accent)', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 20px rgba(200,245,90,0.35)',
    transition: 'transform 0.15s, opacity 0.15s', zIndex: 100,
  },
  bottomNav: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    height: '64px', background: 'var(--surface)',
    borderTop: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-around',
    zIndex: 200, paddingBottom: 'env(safe-area-inset-bottom)',
  },
  bottomTab: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: '3px',
    flex: 1, height: '100%', textDecoration: 'none',
    transition: 'opacity 0.15s',
  },
  bottomTabIcon: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  bottomTabLabel: { fontSize: '9px', fontWeight: '500', letterSpacing: '0.02em' },
}

// ── Icons ────────────────────────────────────────────────────────────────────

function BrandMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" stroke="#C8F55A" strokeWidth="1.5" fill="none" />
      <circle cx="16" cy="16" r="2.5" fill="#C8F55A" />
    </svg>
  )
}

function GridIcon({ size = 22, active }: { size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill={active ? 'currentColor' : 'none'} fillOpacity="0.15" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill={active ? 'currentColor' : 'none'} fillOpacity="0.15" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill={active ? 'currentColor' : 'none'} fillOpacity="0.15" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill={active ? 'currentColor' : 'none'} fillOpacity="0.15" />
    </svg>
  )
}

function DumbbellIcon({ size = 22, active }: { size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="10" width="3" height="4" rx="1" stroke="currentColor" strokeWidth="1.8" fill={active ? 'currentColor' : 'none'} fillOpacity="0.2" />
      <rect x="5" y="8" width="3" height="8" rx="1" stroke="currentColor" strokeWidth="1.8" fill={active ? 'currentColor' : 'none'} fillOpacity="0.2" />
      <rect x="16" y="8" width="3" height="8" rx="1" stroke="currentColor" strokeWidth="1.8" fill={active ? 'currentColor' : 'none'} fillOpacity="0.2" />
      <rect x="19" y="10" width="3" height="4" rx="1" stroke="currentColor" strokeWidth="1.8" fill={active ? 'currentColor' : 'none'} fillOpacity="0.2" />
      <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function BodyIcon({ size = 22, active }: { size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.8" fill={active ? 'currentColor' : 'none'} fillOpacity="0.2" />
      <path d="M8 9h8l-1 5h-2l-1 6h-4l-1-6H5L4 9h4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill={active ? 'currentColor' : 'none'} fillOpacity="0.1" />
      <path d="M8 14l-2 4M16 14l2 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ChartIcon({ size = 22, active }: { size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <polyline points="4,17 9,11 13,14 20,7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {active && <polyline points="4,17 9,11 13,14 20,7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.2" />}
      <line x1="4" y1="20" x2="20" y2="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function NutritionIcon({ size = 22, active }: { size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2C8 2 5 6 5 10c0 4 2 7 5 8v4h4v-4c3-1 5-4 5-8 0-4-3-8-7-8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill={active ? 'currentColor' : 'none'} fillOpacity="0.1" />
      <line x1="12" y1="10" x2="12" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ChatNavIcon({ size = 22, active }: { size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill={active ? 'currentColor' : 'none'} fillOpacity="0.1" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="#0a0a0a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function fmtTime(secs: number) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0')
  const s = String(secs % 60).padStart(2, '0')
  return `${m}:${s}`
}
