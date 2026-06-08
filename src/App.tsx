import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider, useToast } from './components/Toast'
import ProtectedRoute from './components/ProtectedRoute'
import AppShell from './components/AppShell'
import PageErrorBoundary from './components/PageErrorBoundary'
import { registerGlobalToast } from './lib/globalToast'
import Homepage from './pages/Homepage'
import LoginPage from './pages/LoginPage'
import OnboardingPage from './pages/OnboardingPage'
import DashboardPage from './pages/DashboardPage'
import WorkoutPage from './pages/WorkoutPage'
import BodyLabPage from './pages/BodyLabPage'
import ProgressPage from './pages/ProgressPage'
import NutritionPage from './pages/NutritionPage'
import AIPage from './pages/AIPage'
import SettingsPage from './pages/SettingsPage'
import GymsPage from './pages/GymsPage'

function GlobalToastRegistrar() {
  const { showToast } = useToast()
  useEffect(() => { registerGlobalToast(showToast) }, [showToast])
  return null
}

function AppLayout() {
  return (
    <ProtectedRoute>
      <AppShell>
        <Outlet />
      </AppShell>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <GlobalToastRegistrar />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<PageErrorBoundary><Homepage /></PageErrorBoundary>} />
            <Route path="/login" element={<PageErrorBoundary><LoginPage /></PageErrorBoundary>} />
            <Route path="/onboarding" element={
              <ProtectedRoute><PageErrorBoundary><OnboardingPage /></PageErrorBoundary></ProtectedRoute>
            } />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<PageErrorBoundary><DashboardPage /></PageErrorBoundary>} />
              <Route path="/workout" element={<PageErrorBoundary><WorkoutPage /></PageErrorBoundary>} />
              <Route path="/anatomy" element={<PageErrorBoundary><BodyLabPage /></PageErrorBoundary>} />
              <Route path="/progress" element={<PageErrorBoundary><ProgressPage /></PageErrorBoundary>} />
              <Route path="/nutrition" element={<PageErrorBoundary><NutritionPage /></PageErrorBoundary>} />
              <Route path="/ai" element={<PageErrorBoundary><AIPage /></PageErrorBoundary>} />
              <Route path="/settings" element={<PageErrorBoundary><SettingsPage /></PageErrorBoundary>} />
              <Route path="/gyms" element={<PageErrorBoundary><GymsPage /></PageErrorBoundary>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
