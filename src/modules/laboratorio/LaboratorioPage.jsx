import { Routes, Route } from 'react-router-dom'
import { LabContext, useLaboratorio } from './useLaboratorio'
import FilaView from './components/FilaView'
import PedidoDetalhe from './components/PedidoDetalhe'
import SyncBanner from './components/SyncBanner'
import styles from './LaboratorioPage.module.css'

/**
 * Shell do Módulo Laboratório.
 *   /laboratorio            → fila / minhas O.S.
 *   /laboratorio/:pedidoId  → detalhe do pedido / O.S.
 */
export default function LaboratorioPage() {
  const lab = useLaboratorio()

  return (
    <LabContext.Provider value={lab}>
      <div className={styles.container}>
        <SyncBanner />
        <Routes>
          <Route index element={<FilaView />} />
          <Route path=":pedidoId" element={<PedidoDetalhe />} />
        </Routes>
      </div>
    </LabContext.Provider>
  )
}
