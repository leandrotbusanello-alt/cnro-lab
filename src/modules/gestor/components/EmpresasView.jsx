import { useMemo, useState } from 'react'
import ModalEmpresa from './ModalEmpresa'
import styles from '../gestor.module.css'

const FILTROS = [
  { id: 'ativas', rotulo: 'Ativas' },
  { id: 'inativas', rotulo: 'Inativas' },
  { id: '', rotulo: 'Todas' },
]

function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export default function EmpresasView({ empresas, usuarios, online, onSalvo, notificar }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('ativas')
  const [modal, setModal] = useState(null) // { empresa } | { nova: true }

  const usuariosPorEmpresa = useMemo(() => {
    const m = {}
    usuarios.forEach(u => { if (u.empresa_id) m[u.empresa_id] = (m[u.empresa_id] || 0) + 1 })
    return m
  }, [usuarios])

  const contagem = useMemo(() => ({
    ativas: empresas.filter(e => e.ativo !== false).length,
    inativas: empresas.filter(e => e.ativo === false).length,
    '': empresas.length,
  }), [empresas])

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim())
    return empresas.filter(e => {
      if (filtro === 'ativas' && e.ativo === false) return false
      if (filtro === 'inativas' && e.ativo !== false) return false
      if (termo && !normalizar([e.nome, e.lote, e.rodovia].join(' ')).includes(termo)) return false
      return true
    })
  }, [empresas, busca, filtro])

  const empresaDoModal = modal?.empresa ? (empresas.find(e => e.id === modal.empresa.id) || modal.empresa) : null

  return (
    <>
      <div className={styles.barra}>
        <input
          className={`${styles.input} ${styles.busca}`} type="search" value={busca}
          onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, lote ou rodovia"
        />
        <button type="button" className={`${styles.btn} ${styles.btnPrimario}`}
          onClick={() => setModal({ nova: true })} disabled={!online}>
          + Nova empresa
        </button>
      </div>

      <div className={styles.chips}>
        {FILTROS.map(f => (
          <button key={f.id || 'todas'} type="button"
            className={`${styles.chip} ${filtro === f.id ? styles.chipAtivo : ''}`}
            onClick={() => setFiltro(f.id)}>
            {f.rotulo} ({contagem[f.id]})
          </button>
        ))}
      </div>

      <div className={styles.lista}>
        <div className={`${styles.cabecalhoLista} ${styles.linhaEmpresa}`}>
          <span>Empresa / consórcio</span>
          <span className={styles.colLote}>Lote</span>
          <span className={styles.colRodovia}>Rodovia</span>
          <span className={styles.colUsuarios}>Usuários</span>
          <span style={{ textAlign: 'right' }}>Situação</span>
        </div>

        {visiveis.length === 0 && (
          <div className={styles.vazio}>
            {empresas.length === 0 ? 'Nenhuma empresa cadastrada.' : 'Nenhuma empresa encontrada com esses filtros.'}
          </div>
        )}

        {visiveis.map(e => (
          <button
            key={e.id} type="button"
            className={`${styles.linha} ${styles.linhaEmpresa} ${e.ativo === false ? styles.linhaInativa : ''}`}
            onClick={() => setModal({ empresa: e })}
          >
            <span className={styles.celula}>
              <div className={styles.nome}>{e.nome}</div>
              <div className={`${styles.sub} ${styles.soMobile}`}>
                {[e.lote && `Lote ${e.lote}`, e.rodovia].filter(Boolean).join(' · ') || '—'}
              </div>
            </span>
            <span className={styles.colLote}>{e.lote || '—'}</span>
            <span className={`${styles.celula} ${styles.colRodovia}`}><div className={styles.sub} style={{ color: 'var(--text)' }}>{e.rodovia || '—'}</div></span>
            <span className={`${styles.sub} ${styles.colUsuarios}`}>{usuariosPorEmpresa[e.id] || 0}</span>
            <span className={styles.selos}>
              {e.ativo === false
                ? <span className={`${styles.badge} ${styles.erro}`}>Inativa</span>
                : <span className={`${styles.badge} ${styles.ok}`}>Ativa</span>}
            </span>
          </button>
        ))}
      </div>

      {modal && (
        <ModalEmpresa
          key={modal.nova ? 'nova' : modal.empresa.id}
          empresa={modal.nova ? null : empresaDoModal}
          empresas={empresas}
          qtdUsuarios={empresaDoModal ? (usuariosPorEmpresa[empresaDoModal.id] || 0) : 0}
          online={online}
          onSalvo={onSalvo} notificar={notificar}
          onFechar={() => setModal(null)}
        />
      )}
    </>
  )
}
