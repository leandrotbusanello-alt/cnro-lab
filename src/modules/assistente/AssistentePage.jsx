import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { AssistenteContext, useAssistente } from './useAssistente'
import SyncBanner from '../laboratorio/components/SyncBanner'
import FilaAssistente from './components/FilaAssistente'
import EnviadosAssistente from './components/EnviadosAssistente'
import ExecucaoEnsaio from './components/ExecucaoEnsaio'
import styles from './AssistentePage.module.css'

/**
 * Shell do Módulo Assistente.
 *   /assistente               → fila de ensaios atribuídos a mim
 *   /assistente/enviados      → consulta dos ensaios já enviados (painel interno)
 *   /assistente/:ensaioOsId   → execução do ensaio (ficha online)
 */
export default function AssistentePage() {
  const assist = useAssistente()
  const location = useLocation()
  // Não mostra as abas dentro da execução de um ensaio (tela cheia)
  const naFilaOuEnviados = /^\/assistente\/?(enviados)?$/.test(location.pathname)

  return (
    <AssistenteContext.Provider value={assist}>
      <div className={styles.container}>
        <SyncBanner
          ctx={{ fonte: assist.fonte, pedidosPorId: assist.pedidosPorId, recarregar: assist.recarregar }}
          avisoOffline="O que você preencher fica salvo neste aparelho e é enviado quando a internet voltar."
        />
        {naFilaOuEnviados && (
          <nav className={styles.abas}>
            <NavLink to="/assistente" end className={({ isActive }) => `${styles.aba} ${isActive ? styles.abaAtiva : ''}`}>
              Minha fila
            </NavLink>
            <NavLink to="/assistente/enviados" className={({ isActive }) => `${styles.aba} ${isActive ? styles.abaAtiva : ''}`}>
              Enviados
            </NavLink>
          </nav>
        )}
        <Routes>
          <Route index element={<FilaAssistente />} />
          <Route path="enviados" element={<EnviadosAssistente />} />
          <Route path=":ensaioOsId" element={<ExecucaoEnsaio />} />
        </Routes>
      </div>
    </AssistenteContext.Provider>
  )
}
