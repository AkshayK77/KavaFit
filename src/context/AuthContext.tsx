import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { identifyUser } from '../lib/analytics'
import type { Session, User } from '@supabase/supabase-js'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  drawerOpen: boolean
  setDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>
  drawerInitMessage: string
  setDrawerInitMessage: React.Dispatch<React.SetStateAction<string>>
  openDrawerWithMessage: (msg: string) => void
  workoutUpdate: Record<string, unknown> | null
  setWorkoutUpdate: React.Dispatch<React.SetStateAction<Record<string, unknown> | null>>
  activeSessionExercises: { name: string }[]
  setActiveSessionExercises: React.Dispatch<React.SetStateAction<{ name: string }[]>>
  avatarUrl: string | null
  setAvatarUrl: React.Dispatch<React.SetStateAction<string | null>>
  heatmapRefreshKey: number
  triggerHeatmapRefresh: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerInitMessage, setDrawerInitMessage] = useState('')

  const [workoutUpdate, setWorkoutUpdate] = useState<Record<string, unknown> | null>(null)
  const [activeSessionExercises, setActiveSessionExercises] = useState<{ name: string }[]>([])
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [heatmapRefreshKey, setHeatmapRefreshKey] = useState(0)
  const triggerHeatmapRefresh = useCallback(() => setHeatmapRefreshKey(k => k + 1), [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
      if (session?.user) {
        identifyUser(session.user.id)
        supabase.from('profiles').select('avatar_url').eq('id', session.user.id).single()
          .then(({ data }) => {
            const d = data as { avatar_url: string | null } | null
            if (d?.avatar_url) setAvatarUrl(d.avatar_url)
          })
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) identifyUser(session.user.id)
      if (!session?.user) setAvatarUrl(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const openDrawerWithMessage = useCallback((msg: string) => {
    setDrawerInitMessage(msg)
    setDrawerOpen(true)
  }, [])

  return (
    <AuthContext.Provider value={{
      user, session, loading,
      drawerOpen, setDrawerOpen,
      drawerInitMessage, setDrawerInitMessage,
      openDrawerWithMessage,
      workoutUpdate, setWorkoutUpdate,
      activeSessionExercises, setActiveSessionExercises,
      avatarUrl, setAvatarUrl,
      heatmapRefreshKey, triggerHeatmapRefresh,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
