import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'

import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './modules/dashboard/DashboardPage'
import AssistentePage from './modules/assistente/AssistentePage'
import GestorPage from './modules/gestor/GestorPage'
import TrocarSenhaPage from './pages/TrocarSenhaPage'
import RedefinirSenhaPage from './pages/RedefinirSenhaPage'
import NotFoundPage from './pages/NotFoundPage'
import CampoPage from './modules/campo/CampoPage'
import LaboratorioPage from './modules/laboratorio/LaboratorioPage'

function RequireAuth({ children }) {
  const { perfil, carregando } = useAuthStore()
  if (carregando) return <div style={{ display:'flex',justifyContent:'center',padding:'80px' }}><span>Carregando...</span></div>
  if (!perfil) return <Navigate to="/login" replace />
  // Senha provisória (primeiro acesso ou reset pelo Gestor): troca obrigatória
  if (perfil.trocar_senha && navigator.onLine) return <Navigate to="/trocar-senha" replace />
  return children
}

export default function App() {
  const { init } = useAuthStore()

  useEffect(() => { init() }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/trocar-senha" element={<TrocarSenhaPage />} />
        <Route path="/redefinir-senha" element={<RedefinirSenhaPage />} />

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
          <Route path="laboratorio/*" element={<LaboratorioPage />} />
          <Route path="assistente/*" element={<AssistentePage />} />
          <Route path="gestor/*" element={<GestorPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
