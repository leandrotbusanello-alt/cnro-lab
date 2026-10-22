import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { lazyComRecarga as lazy } from './lib/lazyComRecarga'

import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'

// Cada módulo é baixado só quando a pessoa abre a tela (antes ia tudo num arquivo só de ~870 kB)
const TELAS = {
  dashboard:         () => import('./modules/dashboard/DashboardPage'),
  campo:             () => import('./modules/campo/CampoPage'),
  laboratorio:       () => import('./modules/laboratorio/LaboratorioPage'),
  assistente:        () => import('./modules/assistente/AssistentePage'),
  gestor:            () => import('./modules/gestor/GestorPage'),
  cadastros:         () => import('./modules/cadastros/CadastrosPage'),
  'trocar-senha':    () => import('./pages/TrocarSenhaPage'),
  'redefinir-senha': () => import('./pages/RedefinirSenhaPage'),
}
const DashboardPage      = lazy(TELAS.dashboard)
const CampoPage          = lazy(TELAS.campo)
const LaboratorioPage    = lazy(TELAS.laboratorio)
const AssistentePage     = lazy(TELAS.assistente)
const GestorPage         = lazy(TELAS.gestor)
const CadastrosPage      = lazy(TELAS.cadastros)
const TrocarSenhaPage    = lazy(TELAS['trocar-senha'])
const RedefinirSenhaPage = lazy(TELAS['redefinir-senha'])

// A tela que vai abrir começa a baixar já, junto com a verificação do login
// (sem esperar o React montar). Na tela de login, adianta o Painel, que vem em seguida.
const telaInicial = window.location.pathname.split('/')[1]
;(TELAS[telaInicial] || TELAS.dashboard)().catch(() => { /* tratado ao abrir a tela */ })

function Carregando() {
  return <div style={{ display:'flex',justifyContent:'center',padding:'80px' }}><span>Carregando...</span></div>
}

function RequireAuth({ children }) {
  const perfil = useAuthStore(s => s.perfil)
  const carregando = useAuthStore(s => s.carregando)
  if (carregando) return <Carregando />
  if (!perfil) return <Navigate to="/login" replace />
  // Senha provisória (primeiro acesso ou reset pelo Gestor): troca obrigatória
  if (perfil.trocar_senha && navigator.onLine) return <Navigate to="/trocar-senha" replace />
  return children
}

export default function App() {
  const init = useAuthStore(s => s.init)

  useEffect(() => { init() }, [init])

  return (
    <BrowserRouter>
      <Suspense fallback={<Carregando />}>
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
          <Route path="cadastros" element={<CadastrosPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
