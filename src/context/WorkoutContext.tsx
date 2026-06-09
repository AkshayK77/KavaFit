import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface WorkoutContextValue {
  workoutUpdate: Record<string, unknown> | null
  setWorkoutUpdate: React.Dispatch<React.SetStateAction<Record<string, unknown> | null>>
  activeSessionExercises: { name: string }[]
  setActiveSessionExercises: React.Dispatch<React.SetStateAction<{ name: string }[]>>
  heatmapRefreshKey: number
  triggerHeatmapRefresh: () => void
}

const WorkoutContext = createContext<WorkoutContextValue | null>(null)

export function WorkoutProvider({ children }: { children: ReactNode }) {
  const [workoutUpdate, setWorkoutUpdate] = useState<Record<string, unknown> | null>(null)
  const [activeSessionExercises, setActiveSessionExercises] = useState<{ name: string }[]>([])
  const [heatmapRefreshKey, setHeatmapRefreshKey] = useState(0)
  const triggerHeatmapRefresh = useCallback(() => setHeatmapRefreshKey(k => k + 1), [])

  return (
    <WorkoutContext.Provider value={{
      workoutUpdate, setWorkoutUpdate,
      activeSessionExercises, setActiveSessionExercises,
      heatmapRefreshKey, triggerHeatmapRefresh,
    }}>
      {children}
    </WorkoutContext.Provider>
  )
}

export function useWorkout(): WorkoutContextValue {
  const ctx = useContext(WorkoutContext)
  if (!ctx) throw new Error('useWorkout must be used within WorkoutProvider')
  return ctx
}
