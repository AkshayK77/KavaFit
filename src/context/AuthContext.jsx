import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerInitMessage, setDrawerInitMessage] = useState('')

  const [workoutUpdate, setWorkoutUpdate] = useState(null)
  const [activeSessionExercises, setActiveSessionExercises] = useState([])
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [heatmapRefreshKey, setHeatmapRefreshKey] = useState(0)
  const triggerHeatmapRefresh = useCallback(() => setHeatmapRefreshKey(k => k + 1), [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
      if (session?.user) {
        supabase.from('profiles').select('avatar_url').eq('id', session.user.id).single()
          .then(({ data }) => { if (data?.avatar_url) setAvatarUrl(data.avatar_url) })
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (!session?.user) setAvatarUrl(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const openDrawerWithMessage = useCallback((msg) => {
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

export function useAuth() {
  return useContext(AuthContext)
}
