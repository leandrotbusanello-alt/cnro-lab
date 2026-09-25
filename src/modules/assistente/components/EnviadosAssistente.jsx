import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../../store/authStore'
import * as repo from '../assistenteRepo'
import { porId, nomeEmpresa, idade } from '../../laboratorio/utils'
import { Selo } from '../../laboratorio/components/StatusBadge'
import ui from '../../laboratorio/components/ui.module.css'
import styles from './FilaAssistente.module.css'

const ROTULO_STATUS = {
  aguardando_revisao: { label: 'Aguardando revisão', tom: 'alerta' },
  aprovado:            { label: 'Aprovado',           tom: 'ok'     },
}

/**
 * Somente leitura: ensaios que o assistente já enviou (aguardando revisão do
 * laboratorista ou já aprovados). Não abre a ficha para edição — quem envia
 * não corrige depois; se o laboratorista devolver, o ensaio volta para "Meus
 * ensaios" normalmente.
 */
export default function EnviadosAssistente() {
  const { perfil } = useAuthStore()
  const [params, setParams] = useSearchParams()
  const statusFiltro = params.get('status') || ''
  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    repo.buscarEnviados(perfil)
      .then(r => { if (!cancelado) { setDados(r); setErro(null) } })
      .catch(e => { if (!cancelado) setErro(navigator.onLine ? (e.message || 'Erro ao carregar.') : 'Sem conexão. Esta lista precisa de internet.') })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [perfil])

  const indices = useMemo(() => ({
    pedidosPorId: porId(dados?.pedidos || []),
    empresasPorId: porId(dados?.empresas || []),
    fichasPorId: porId(dados?.fichas || []),
  }), [dados])

  const lista = useMemo(() => {
    const l = dados?.ensaiosOs || []
    return statusFiltro ? l.filter(e => e.status === statusFiltro) : l
  }, [dados, statusFiltro])

  return (
    <>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Meus ensaios enviados</h1>
          <p className={styles.sub}>Consulta — não é possível editar um ensaio depois de enviado.</p>
        </div>
      </header>

      {statusFiltro && (
        <div className={`${ui.aviso} ${ui.avisoInfo}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🔎 Filtrado pelo Painel: {ROTULO_STATUS[statusFiltro]?.label || statusFiltro}</span>
          <button type="button" className={ui.btnLink} onClick={() => setParams({}, { replace: true })}>Ver todos</button>
        </div>
      )}

      {erro && <div className={`${ui.aviso} ${ui.avisoErro}`}>{erro}</div>}

      {loading ? (
        <div className={styles.carregando}><div className="spinner" /></div>
      ) : lista.length === 0 ? (
        <div className={styles.vazio}>
          <span className={styles.vazioIcone}>📭</span>
          <strong>Nada por aqui ainda</strong>
          <span>Ensaios enviados para revisão ou já aprovados aparecem nesta lista.</span>
        </div>
      ) : (
        <div className={styles.lista}>
          {lista.map(eo => (
            <div key={eo.id} className={styles.card}>
              <div className={styles.topo}>
                <div className={styles.nomes}>
                  <strong className={styles.ensaio}>{eo.nome_ensaio || 'Ensaio'}</strong>
                  <span className={styles.os}>{indices.pedidosPorId[eo.pedido_id]?.numero_os || indices.pedidosPorId[eo.pedido_id]?.numero_pe || ''}</span>
                </div>
                <Selo tom={(ROTULO_STATUS[eo.status] || {}).tom || 'neutro'}>
                  {(ROTULO_STATUS[eo.status] || {}).label || eo.status}
                </Selo>
              </div>
              <div className={styles.info}>
                <span>🏢 {nomeEmpresa(indices.pedidosPorId[eo.pedido_id], indices.empresasPorId)}</span>
                <span>📄 {indices.fichasPorId[eo.ficha_ensaio_id]?.codigo || 'Ficha não definida'}</span>
              </div>
              <div className={styles.rodape}>
                {eo.status === 'aprovado'
                  ? <span>Aprovado {idade(eo.aprovado_em)}</span>
                  : <span>Enviado {idade(eo.enviado_em || eo.data_conclusao)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
