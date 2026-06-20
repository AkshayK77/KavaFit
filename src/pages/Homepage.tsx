import React from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `linear-gradient(rgba(200,245,90,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(200,245,90,0.04) 1px, transparent 1px)`,
    backgroundSize: '48px 48px',
    pointerEvents: 'none',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    padding: '24px 40px',
    position: 'relative',
    zIndex: 1,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  brandName: {
    fontFamily: '"DM Sans", sans-serif',
    fontWeight: 800,
    fontSize: '22px',
    letterSpacing: '0.05em',
    color: 'var(--text)',
  },
  hero: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '60px 24px',
    position: 'relative',
    zIndex: 1,
  },
  headline: {
    fontFamily: 'Bebas Neue, sans-serif',
    fontSize: 'clamp(56px, 9vw, 108px)',
    lineHeight: '0.92',
    letterSpacing: '0.02em',
    color: 'var(--text)',
    marginBottom: '24px',
  },
  accentLine: {
    color: 'var(--accent)',
  },
  subtitle: {
    fontSize: 'clamp(15px, 2vw, 18px)',
    color: 'var(--muted)',
    maxWidth: '520px',
    lineHeight: '1.6',
    marginBottom: '40px',
  },
  btnRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  btnPrimary: {
    padding: '14px 32px',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: '10px',
    color: '#0a0a0a',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block',
    transition: 'opacity 0.15s',
  },
  btnSecondary: {
    padding: '14px 32px',
    background: 'transparent',
    border: '1px solid var(--border2)',
    borderRadius: '10px',
    color: 'var(--text)',
    fontSize: '15px',
    fontWeight: '500',
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block',
    transition: 'border-color 0.15s',
  },
}

export default function Homepage() {
  const { user, loading } = useAuth()

  if (loading) return null
  if (user) return <Navigate to="/dashboard" replace />

  return (
    <div style={s.page}>
      <div style={s.grid} />

      <nav style={s.nav}>
        <div style={s.brand}>
          <BrandMark />
          <span style={s.brandName}>KavaFit</span>
        </div>
      </nav>

      <main style={s.hero}>
        <h1 style={s.headline}>
          Train smarter.<br />
          <span style={s.accentLine}>Progress faster.</span>
        </h1>
        <p style={s.subtitle}>
          The AI fitness coach that knows your body, your history, and your goals.
        </p>
        <div style={s.btnRow}>
          <Link
            to="/login?tab=signup"
            style={s.btnPrimary}
            onMouseOver={e => e.currentTarget.style.opacity = '0.85'}
            onMouseOut={e => e.currentTarget.style.opacity = '1'}
          >
            Get started
          </Link>
          <Link
            to="/login"
            style={s.btnSecondary}
            onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border2)'}
          >
            Sign in
          </Link>
        </div>
      </main>
    </div>
  )
}

function BrandMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon
        points="16,2 28,9 28,23 16,30 4,23 4,9"
        stroke="#C8F55A"
        strokeWidth="1.5"
        fill="none"
      />
      <circle cx="16" cy="16" r="2.5" fill="#C8F55A" />
    </svg>
  )
}
