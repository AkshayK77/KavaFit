import type { ReactNode } from 'react'
import ErrorBoundary from './ErrorBoundary'

function PageFallback() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg, #0a0a0a)',
      padding: '1.5rem',
    }}>
      <div style={{
        backgroundColor: 'var(--surface, #1a1a1a)',
        borderRadius: '1rem',
        padding: '2rem',
        maxWidth: '420px',
        width: '100%',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontFamily: '"Bebas Neue", sans-serif',
          fontSize: '2.25rem',
          color: 'var(--accent, #e8ff47)',
          margin: '0 0 0.5rem',
        }}>
          Page Error
        </h1>
        <p style={{
          fontFamily: '"DM Sans", sans-serif',
          color: 'var(--text, #ffffff)',
          opacity: 0.65,
          margin: '0 0 1.5rem',
          lineHeight: 1.5,
        }}>
          This page ran into a problem. You can reload or go back to the dashboard.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: 'var(--accent, #e8ff47)',
              color: '#000000',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontFamily: '"DM Sans", sans-serif',
              fontWeight: 600,
              fontSize: '1rem',
              cursor: 'pointer',
              flex: '1 1 0',
              minWidth: '120px',
            }}
          >
            Reload
          </button>
          <button
            onClick={() => { window.location.href = '/dashboard' }}
            style={{
              backgroundColor: 'transparent',
              color: 'var(--accent, #e8ff47)',
              border: '1px solid var(--accent, #e8ff47)',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontFamily: '"DM Sans", sans-serif',
              fontWeight: 600,
              fontSize: '1rem',
              cursor: 'pointer',
              flex: '1 1 0',
              minWidth: '120px',
            }}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}

interface Props {
  children: ReactNode
}

export default function PageErrorBoundary({ children }: Props) {
  return (
    <ErrorBoundary fallback={<PageFallback />}>
      {children}
    </ErrorBoundary>
  )
}
