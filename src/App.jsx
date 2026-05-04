import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login     from './pages/Login'
import Dashboard from './pages/Dashboard'
import Hunter    from './pages/Hunter'

// ── Spinner while Firebase resolves auth ──────────────────
function LoadingScreen() {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0b0b' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 48, height: 48, margin: '0 auto 20px',
          border: '3px solid rgba(125,3,255,.2)',
          borderTopColor: '#7d03ff',
          borderRadius: '50%',
          animation: 'spin .9s linear infinite',
        }} />
        <div style={{ fontFamily: 'Unbounded,sans-serif', fontSize: 10, color: 'rgba(255,255,255,.4)', letterSpacing: 3 }}>
          CARGANDO
        </div>
      </div>
    </div>
  )
}

// ── Inner app (authenticated) ─────────────────────────────
function Inner() {
  const { user, loading } = useAuth()
  const [view, setView]           = useState('dashboard') // 'dashboard' | 'hunter'
  const [currentProject, setCurrentProject] = useState(null)

  if (loading) return <LoadingScreen />
  if (!user)   return <Login />

  const goToDashboard = () => {
    setView('dashboard')
    setCurrentProject(null)
  }

  const openProject = (project) => {
    setCurrentProject(project)
    setView('hunter')
  }

  const startNew = () => {
    setCurrentProject(null)
    setView('hunter')
  }

  return view === 'dashboard'
    ? <Dashboard onNew={startNew} onOpen={openProject} />
    : <Hunter project={currentProject} onBack={goToDashboard} />
}

// ── Root ──────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <Inner />
    </AuthProvider>
  )
}
