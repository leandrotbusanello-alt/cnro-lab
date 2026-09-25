import { Routes, Route } from 'react-router-dom'
import { AssistenteContext, useAssistente } from './useAssistente'
import SyncBanner from '../laboratorio/components/SyncBanner'
import FilaAssistente from './components/FilaAssistente'
import ExecucaoEnsaio from './components/ExecucaoEnsaio'
import styles from './AssistentePage.module.css'

/**
 * Shell do Módulo Assistente.
 *   /assistente               → fila de ensaios atribuídos a mim
 *   /assistente/:ensaioOsId   → execução do ensaio (ficha online)
 */
export default function AssistentePage() {
  const assist = useAssistente()

  return (
    <AssistenteContext.Provider value={assist}>
      <div className={styles.container}>
        <SyncBanner
          ctx={{ fonte: assist.fonte, pedidosPorId: assist.pedidosPorId, recarregar: assist.recarregar }}
          avisoOffline="O que você preencher fica salvo neste aparelho e é enviado quando a internet voltar."
        />
        <Routes>
          <Route index element={<FilaAssistente />} />
          <Route path=":ensaioOsId" element={<ExecucaoEnsaio />} />
        </Routes>
      </div>
    </AssistenteContext.Provider>
  )
}
