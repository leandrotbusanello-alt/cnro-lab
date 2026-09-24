import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'

import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import LaboratorioPage from './pages/LaboratorioPage'
import AssistentePage from './pages/AssistentePage'
import GestorPage from './pages/GestorPage'
import NotFoundPage from './pages/NotFoundPage'
import CampoPage from './modules/campo/CampoPage'

function RequireAuth({ children }) {
  const { perfil, carregando } = useAuthStore()
  if (carregando) return <div style={{ display:'flex',justifyContent:'center',padding:'80px' }}><span>Carregando...</span></div>
  if (!perfil) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const { init } = useAuthStore()

  useEffect(() => { init() }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="campo/*" element={<CampoPage />} />
          <Route path="laboratorio" element={<LaboratorioPage />} />
          <Route path="assistente" element={<AssistentePage />} />
          <Route path="gestor" element={<GestorPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
