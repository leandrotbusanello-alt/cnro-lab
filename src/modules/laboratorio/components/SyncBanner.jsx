import { useCallback, useContext, useEffect, useState } from 'react'
import {
  listarFila, onFilaMudou, processarFila, tentarNovamente, descartarOperacoesDoPedido,
} from '../../../lib/syncQueue'
import { getPedidosPendentes } from '../../../lib/offlineDB'
import { LabContext } from '../useLaboratorio'
import { numeroPE } from '../utils'
import styles from './SyncBanner.module.css'
import ui from './ui.module.css'

/**
 * Faixa de status da sincronização offline:
 *  • offline / quantidade de ações aguardando envio
 *  • erro de sincronização com opções "Tentar novamente" e "Descartar"
 *
 * Dentro do Módulo Laboratório usa o contexto do Lab; outros módulos passam
 * ctx = { fonte, pedidosPorId, recarregar } (ex.: Módulo Assistente).
 */
export default function SyncBanner({ ctx, avisoOffline = 'Números de PE e O.S. gerados agora são provisórios.' }) {
  const lab = useContext(LabContext)
  const { fonte, pedidosPorId = {}, recarregar = () => {} } = ctx || lab || {}
  const [ops, setOps] = useState([])
  const [pedidosCampo, setPedidosCampo] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)
  const [enviando, setEnviando] = useState(false)

  const atualizar = useCallback(async () => {
    try {
      setOps(await listarFila())
      setPedidosCampo((await getPedidosPendentes()).length)
    } catch { /* IndexedDB indisponível */ }
  }, [])

  useEffect(() => {
    atualizar()
    const parar = onFilaMudou(ev => {
      if (ev.tipo === 'inicio') setEnviando(true)
      if (ev.tipo === 'fim') setEnviando(false)
      atualizar()
    })
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { parar(); window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [atualizar])

  const comErro = ops.find(o => o.status === 'erro')
  const total = ops.length + pedidosCampo

  if (online && total === 0 && fonte !== 'cache') return null

  async function enviarAgora() {
    setEnviando(true)
    try { await processarFila() } finally { setEnviando(false); atualizar(); recarregar({ silencioso: true }) }
  }

  async function tentar() {
    setEnviando(true)
    try { await tentarNovamente(comErro.id) } finally { setEnviando(false); atualizar(); recarregar({ silencioso: true }) }
  }

  async function descartar() {
    const pedido = pedidosPorId[comErro.pedidoId]
    const nome = pedido ? numeroPE(pedido) : 'este pedido'
    const ok = window.confirm(
      `Descartar as ações não enviadas de ${nome}?\n\n` +
      'Elas serão perdidas e o pedido voltará a mostrar os dados do servidor.')
    if (!ok) return
    await descartarOperacoesDoPedido(comErro.pedidoId)
    await atualizar()
    await processarFila()
    recarregar({ silencioso: true })
  }

  if (comErro) {
    return (
      <div className={`${styles.banner} ${styles.erro}`}>
        <span className={styles.icone}>⚠️</span>
        <div className={styles.texto}>
          <strong>Falha ao sincronizar: {comErro.descricao}</strong>
          <span>{comErro.erro}</span>
          <span className={styles.sub}>
            {ops.length} ação(ões) aguardando. As seguintes só serão enviadas depois de resolver esta.
          </span>
        </div>
        <div className={styles.acoes}>
          <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={tentar} disabled={enviando || !online}>
            Tentar novamente
          </button>
          <button className={`${ui.btn} ${ui.btnPerigo} ${ui.btnPequeno}`} onClick={descartar} disabled={enviando}>
            Descartar
          </button>
        </div>
      </div>
    )
  }

  if (!online) {
    return (
      <div className={`${styles.banner} ${styles.offline}`}>
        <span className={styles.icone}>📶</span>
        <div className={styles.texto}>
          <strong>Sem conexão — trabalhando offline</strong>
          <span>
            As ações ficam salvas neste aparelho e serão enviadas quando a internet voltar.
            {total > 0 && ` ${total} aguardando envio.`}
          </span>
          {avisoOffline && <span className={styles.sub}>{avisoOffline}</span>}
        </div>
      </div>
    )
  }

  if (total > 0) {
    return (
      <div className={`${styles.banner} ${styles.pendente}`}>
        <span className={styles.icone}>🔄</span>
        <div className={styles.texto}>
          <strong>{enviando ? 'Sincronizando…' : `${total} ação(ões) aguardando envio`}</strong>
        </div>
        <div className={styles.acoes}>
          <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={enviarAgora} disabled={enviando}>
            Enviar agora
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.banner} ${styles.pendente}`}>
      <span className={styles.icone}>ℹ️</span>
      <div className={styles.texto}>
        <strong>Exibindo dados salvos neste aparelho</strong>
        <span>Não foi possível atualizar a partir do servidor.</span>
      </div>
      <div className={styles.acoes}>
        <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={() => recarregar()}>
          Atualizar
        </button>
      </div>
    </div>
  )
}
