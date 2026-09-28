import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { LabContext, useLaboratorio } from './useLaboratorio'
import FilaView from './components/FilaView'
import PedidoDetalhe from './components/PedidoDetalhe'
import SyncBanner from './components/SyncBanner'
import styles from './LaboratorioPage.module.css'

const QuadrosView = lazy(() => import('../quadros/QuadrosView'))   // carregado só ao abrir os quadros

/**
 * Shell do Módulo Laboratório.
 *   /laboratorio            → fila / minhas O.S.
 *   /laboratorio/:pedidoId  → detalhe do pedido / O.S.
 *   /laboratorio/quadros    → quadros de controle (FR-IMOB-39 a 43)
 */
export default function LaboratorioPage() {
  const lab = useLaboratorio()

  return (
    <LabContext.Provider value={lab}>
      <div className={styles.container}>
        <SyncBanner />
        <Routes>
          <Route index element={<FilaView />} />
          <Route path="quadros" element={<Suspense fallback={<p>Carregando…</p>}><QuadrosView /></Suspense>} />
          <Route path=":pedidoId" element={<PedidoDetalhe />} />
        </Routes>
      </div>
    </LabContext.Provider>
  )
}
