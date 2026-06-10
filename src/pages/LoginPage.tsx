import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    height: '100vh',
    width: '100%',
    overflow: 'hidden',
    background: 'var(--bg)',
  },
  leftPanel: {
    flex: '1 1 55%',
    background: 'var(--surface)',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    padding: '40px',
    overflow: 'hidden',
  },
  grid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)`,
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    position: 'relative',
    zIndex: 1,
  },
  brandMark: {
    width: '32px',
    height: '32px',
  },
  brandName: {
    fontFamily: 'Bebas Neue, sans-serif',
    fontSize: '22px',
    letterSpacing: '0.1em',
    color: 'var(--text)',
  },
  leftContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 1,
  },
  headline: {
    fontFamily: 'Bebas Neue, sans-serif',
    fontSize: 'clamp(52px, 7vw, 88px)',
    lineHeight: '0.95',
    letterSpacing: '0.02em',
    color: 'var(--text)',
    marginBottom: '20px',
  },
  headlineAccent: {
    color: 'var(--accent)',
  },
  subtitle: {
    fontSize: '16px',
    color: 'var(--muted)',
    maxWidth: '380px',
    lineHeight: '1.6',
  },

  rightPanel: {
    flex: '0 0 420px',
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
  },
  formBox: {
    width: '100%',
    maxWidth: '340px',
  },
  tabRow: {
    display: 'flex',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '4px',
    marginBottom: '28px',
  },
  tab: {
    flex: 1,
    padding: '8px 0',
    background: 'transparent',
    border: 'none',
    borderRadius: '7px',
    color: 'var(--muted)',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  tabActive: {
    background: 'var(--surface2)',
    color: 'var(--text)',
  },
  formTitle: {
    fontFamily: 'Bebas Neue, sans-serif',
    fontSize: '26px',
    letterSpacing: '0.04em',
    marginBottom: '4px',
  },
  formSub: {
    fontSize: '13px',
    color: 'var(--muted)',
    marginBottom: '24px',
  },
  field: {
    marginBottom: '14px',
  },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: '500',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text)',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  inputError: {
    borderColor: 'var(--red)',
  },
  errorMsg: {
    fontSize: '12px',
    color: 'var(--red)',
    marginTop: '5px',
  },
  forgotRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '-6px',
    marginBottom: '14px',
  },
  forgotLink: {
    fontSize: '12px',
    color: 'var(--muted)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    textDecoration: 'underline',
  },
  submitBtn: {
    width: '100%',
    padding: '11px',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: '8px',
    color: '#0a0a0a',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    marginTop: '4px',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '20px 0',
    color: 'var(--dim)',
    fontSize: '12px',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: 'var(--border)',
  },
  googleBtn: {
    width: '100%',
    padding: '11px',
    background: 'var(--surface)',
    border: '1px solid var(--border2)',
    borderRadius: '8px',
    color: 'var(--text)',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    transition: 'border-color 0.15s',
  },
  globalError: {
    background: 'rgba(255,92,92,0.1)',
    border: '1px solid rgba(255,92,92,0.3)',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '13px',
    color: 'var(--red)',
    marginBottom: '16px',
  },
}

export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') === 'signup' ? 'signup' : 'signin'
  const [tab, setTab] = useState(initialTab)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [globalError, setGlobalError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)
  const navigate = useNavigate()
  const { user } = useAuth()
  const isMobile = useIsMobile()

  useEffect(() => {
    if (user) checkAndRedirect(user)
  }, [user])

  async function checkAndRedirect(u: { id: string }) {
    const { data } = await supabase
      .from('profiles')
      .select('onboarding_complete')
      .eq('id', u.id)
      .single()
    const profileData = data as { onboarding_complete: boolean | null } | null
    navigate(profileData?.onboarding_complete ? '/dashboard' : '/onboarding', { replace: true })
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {}
    if (tab === 'signup' && !form.name.trim()) e.name = 'Name is required'
    if (!form.email.trim()) e.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email address'
    if (!form.password) e.password = 'Password is required'
    else if (form.password.length < 6) e.password = 'Password must be at least 6 characters'
    return e
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setGlobalError('')
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })
    setLoading(false)
    if (error) { setGlobalError(error.message); return }
    checkAndRedirect(data.user)
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setGlobalError('')
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.name } },
    })
    setLoading(false)
    if (error) { setGlobalError(error.message); return }
    if (data.session) {
      navigate('/onboarding')
    } else {
      setConfirmationSent(true)
    }
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/login` },
    })
  }

  async function handleForgotPassword() {
    if (!form.email) { setErrors({ email: 'Enter your email above first' }); return }
    const { error } = await supabase.auth.resetPasswordForEmail(form.email)
    if (error) setGlobalError(error.message)
    else { setGlobalError(''); alert('Password reset email sent!') }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    if (errors[k]) setErrors(err => ({ ...err, [k]: '' }))
  }

  const inputStyle = (key: string): React.CSSProperties => ({
    ...styles.input,
    ...(errors[key] ? styles.inputError : {}),
  })

  const mobilePageStyle: React.CSSProperties = isMobile ? {
    ...styles.page,
    flexDirection: 'column',
    overflow: 'auto',
  } : styles.page

  const mobileRightPanelStyle: React.CSSProperties = isMobile ? {
    ...styles.rightPanel,
    flex: '1 1 100%',
    width: '100%',
    padding: '32px 24px 48px',
    justifyContent: 'flex-start',
  } : styles.rightPanel

  return (
    <div style={mobilePageStyle}>
      {/* Left panel — desktop only */}
      {!isMobile && (
        <div style={styles.leftPanel}>
          <div style={styles.grid} />
          <div style={styles.brand}>
            <BrandMark />
            <span style={styles.brandName}>FORGE</span>
          </div>
          <div style={styles.leftContent}>
            <h1 style={styles.headline}>
              Train smarter.<br />
              <span style={styles.headlineAccent}>Progress faster.</span>
            </h1>
            <p style={styles.subtitle}>
              The AI fitness coach that knows your body, your history, and your goals. Built for people who take their training seriously.
            </p>
          </div>
        </div>
      )}

      {/* Right panel */}
      <div style={mobileRightPanelStyle}>
        {/* Mobile logo */}
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '36px' }}>
            <BrandMark />
            <span style={styles.brandName}>FORGE</span>
          </div>
        )}
        <div style={{ ...styles.formBox, maxWidth: isMobile ? '100%' : '340px' }}>
          {confirmationSent ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>✉️</div>
              <h2 style={{ ...styles.formTitle, marginBottom: '12px' }}>Check your email</h2>
              <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: '1.6', marginBottom: '24px' }}>
                We sent a confirmation link to <strong style={{ color: 'var(--text)' }}>{form.email}</strong>. Click it to activate your account, then come back and sign in.
              </p>
              <button
                style={{ ...styles.submitBtn, marginTop: 0 }}
                onClick={() => { setConfirmationSent(false); setTab('signin') }}
              >
                Go to Sign In
              </button>
            </div>
          ) : (
            <>
              <div style={styles.tabRow}>
                <button
                  style={{ ...styles.tab, ...(tab === 'signin' ? styles.tabActive : {}) }}
                  onClick={() => { setTab('signin'); setErrors({}); setGlobalError('') }}
                >
                  Sign In
                </button>
                <button
                  style={{ ...styles.tab, ...(tab === 'signup' ? styles.tabActive : {}) }}
                  onClick={() => { setTab('signup'); setErrors({}); setGlobalError('') }}
                >
                  Create Account
                </button>
              </div>

              {globalError && <div style={styles.globalError}>{globalError}</div>}

              {tab === 'signin' ? (
                <form onSubmit={handleSignIn} noValidate>
                  <h2 style={styles.formTitle}>Welcome back</h2>
                  <p style={styles.formSub}>Sign in to continue your journey.</p>

                  <div style={styles.field}>
                    <label style={styles.label}>Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={set('email')}
                      placeholder="you@example.com"
                      style={inputStyle('email')}
                      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={e => e.target.style.borderColor = errors.email ? 'var(--red)' : 'var(--border)'}
                    />
                    {errors.email && <p style={styles.errorMsg}>{errors.email}</p>}
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>Password</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={set('password')}
                      placeholder="••••••••"
                      style={inputStyle('password')}
                      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={e => e.target.style.borderColor = errors.password ? 'var(--red)' : 'var(--border)'}
                    />
                    {errors.password && <p style={styles.errorMsg}>{errors.password}</p>}
                  </div>

                  <div style={styles.forgotRow}>
                    <button type="button" style={styles.forgotLink} onClick={handleForgotPassword}>
                      Forgot password?
                    </button>
                  </div>

                  <button type="submit" style={styles.submitBtn} disabled={loading}
                    onMouseOver={e => { e.currentTarget.style.opacity = '0.85' }}
                    onMouseOut={e => { e.currentTarget.style.opacity = '1' }}
                  >
                    {loading ? 'Signing in…' : 'Sign In'}
                  </button>

                  <div style={styles.divider}>
                    <div style={styles.dividerLine} />
                    or
                    <div style={styles.dividerLine} />
                  </div>

                  <button type="button" style={styles.googleBtn} onClick={handleGoogle}
                    onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--border2)' }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                  >
                    <GoogleIcon />
                    Continue with Google
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSignUp} noValidate>
                  <h2 style={styles.formTitle}>Create account</h2>
                  <p style={styles.formSub}>Start your Forge journey today.</p>

                  <div style={styles.field}>
                    <label style={styles.label}>Full Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={set('name')}
                      placeholder="Alex Smith"
                      style={inputStyle('name')}
                      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={e => e.target.style.borderColor = errors.name ? 'var(--red)' : 'var(--border)'}
                    />
                    {errors.name && <p style={styles.errorMsg}>{errors.name}</p>}
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={set('email')}
                      placeholder="you@example.com"
                      style={inputStyle('email')}
                      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={e => e.target.style.borderColor = errors.email ? 'var(--red)' : 'var(--border)'}
                    />
                    {errors.email && <p style={styles.errorMsg}>{errors.email}</p>}
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>Password</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={set('password')}
                      placeholder="Min. 6 characters"
                      style={inputStyle('password')}
                      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={e => e.target.style.borderColor = errors.password ? 'var(--red)' : 'var(--border)'}
                    />
                    {errors.password && <p style={styles.errorMsg}>{errors.password}</p>}
                  </div>

                  <button type="submit" style={styles.submitBtn} disabled={loading}
                    onMouseOver={e => { e.currentTarget.style.opacity = '0.85' }}
                    onMouseOut={e => { e.currentTarget.style.opacity = '1' }}
                  >
                    {loading ? 'Creating account…' : 'Create Account'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function BrandMark() {
  return (
    <svg style={styles.brandMark} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
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

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
