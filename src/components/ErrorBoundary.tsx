import { Component, type ReactNode, type ErrorInfo } from 'react'
import * as Sentry from '@sentry/react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
    Sentry.captureException(error)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <>
          <style>{`
            .kavafit-error-detail { display: none; }
            @media (min-width: 768px) { .kavafit-error-detail { display: block; } }
          `}</style>
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
                Something went wrong
              </h1>
              <p style={{
                fontFamily: '"DM Sans", sans-serif',
                color: 'var(--text, #ffffff)',
                opacity: 0.65,
                margin: '0 0 1.5rem',
                lineHeight: 1.5,
              }}>
                An unexpected error occurred. Reload the app to continue.
              </p>
              {this.state.error?.message && (
                <p className="kavafit-error-detail" style={{
                  fontFamily: 'monospace',
                  fontSize: '0.7rem',
                  color: 'var(--text, #ffffff)',
                  opacity: 0.35,
                  margin: '0 0 1.25rem',
                  wordBreak: 'break-word',
                  textAlign: 'left',
                }}>
                  {this.state.error.message}
                </p>
              )}
              <button
                onClick={() => window.location.reload()}
                style={{
                  backgroundColor: 'var(--accent, #e8ff47)',
                  color: '#000000',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1.75rem',
                  fontFamily: '"DM Sans", sans-serif',
                  fontWeight: 600,
                  fontSize: '1rem',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                Reload App
              </button>
            </div>
          </div>
        </>
      )
    }

    return this.props.children
  }
}
