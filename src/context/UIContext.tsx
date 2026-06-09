import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface UIContextValue {
  drawerOpen: boolean
  setDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>
  drawerInitMessage: string
  setDrawerInitMessage: React.Dispatch<React.SetStateAction<string>>
  openDrawerWithMessage: (msg: string) => void
  openAIDrawer: () => void
  closeAIDrawer: () => void
  toggleAIDrawer: () => void
}

const UIContext = createContext<UIContextValue | null>(null)

export function UIProvider({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerInitMessage, setDrawerInitMessage] = useState('')

  const openDrawerWithMessage = useCallback((msg: string) => {
    setDrawerInitMessage(msg)
    setDrawerOpen(true)
  }, [])

  const openAIDrawer = useCallback(() => setDrawerOpen(true), [])
  const closeAIDrawer = useCallback(() => setDrawerOpen(false), [])
  const toggleAIDrawer = useCallback(() => setDrawerOpen(prev => !prev), [])

  return (
    <UIContext.Provider value={{
      drawerOpen, setDrawerOpen,
      drawerInitMessage, setDrawerInitMessage,
      openDrawerWithMessage,
      openAIDrawer, closeAIDrawer, toggleAIDrawer,
    }}>
      {children}
    </UIContext.Provider>
  )
}

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI must be used within UIProvider')
  return ctx
}
