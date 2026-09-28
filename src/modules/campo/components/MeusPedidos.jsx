import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCampo } from '../useCampo'
import { TIPOS_AMOSTRA } from '../constants'
import styles from './MeusPedidos.module.css'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatarPE } from '../../../lib/numeracao'

const STATUS_LABEL = {
  pendente_sync:        { label: 'Aguardando envio',           cls: 'offline'   },
  aguardando_lab:       { label: 'Aguardando laboratório',     cls: 'pending'   },
  em_analise:           { label: 'Em análise',                 cls: 'info'      },
  em_andamento:         { label: 'Em andamento',               cls: 'info'      },
  aguardando_revisao:   { label: 'Aguardando revisão',         cls: 'info'      },
  devolvido_campo:      { label: 'Devolvido para correção',    cls: 'error'     },
  concluido:            { label: 'Concluído',                  cls: 'success'   },
  cancelado:            { label: 'Cancelado',                  cls: 'cancelled' },
}

function isDevolvido(status) {
  return status === 'devolvido_campo'
}

function formatarNumeroPE(pedido) {
  if (pedido.numero_pe && pedido.ano) {
    return formatarPE(pedido.ano, pedido.numero_pe)
  }
  if (pedido.numero_os) return `O.S. ${pedido.numero_os}`
  return `Pedido #${String(pedido.id).slice(0, 8)}`
}

export default function MeusPedidos({ onCorrigir, onNovoPedido }) {
  const { pedidos, loading, reenviarPedido } = useCampo()
  const [reenviadoId, setReenviadoId] = useState(null)

  // Vindo de um número do Painel (ex.: "em_andamento,aguardando_revisao")
  const [params, setParams] = useSearchParams()
  const statusFiltro = params.get('status') || ''
  const listaStatus = statusFiltro ? statusFiltro.split(',') : null
  const visiveis = listaStatus ? pedidos.filter(p => listaStatus.includes(p.status)) : pedidos

  const devolvidos = visiveis.filter(p => isDevolvido(p.status))
  const outros     = visiveis.filter(p => !isDevolvido(p.status))

  // Reenvio pela fila oficial de sincronização (evita pedido duplicado)
  async function handleReenviar(pedido, e) {
    e.stopPropagation()
    setReenviadoId(pedido.id)
    try { await reenviarPedido(pedido.id) }
    catch { /* continua guardado no aparelho; a fila tenta de novo quando a conexão voltar */ }
    finally { setReenviadoId(null) }
  }

  if (loading) {
    return <div className={styles.loading}><div className={styles.spinner} /></div>
  }

  return (
    <div className={styles.container}>
      {devolvidos.length > 0 && (
        <div className={styles.banner}>
          <span className={styles.bannerIcon}>⚠️</span>
          <span>
            Você tem <strong>{devolvidos.length}</strong> pedido(s) devolvido(s) para correção.
            Clique no pedido para corrigir e reenviar.
          </span>
        </div>
      )}

      <div className={styles.header}>
        <h2 className={styles.title}>Meus Pedidos</h2>
        <button className={styles.btnNovo} onClick={onNovoPedido}>+ Novo Pedido</button>
      </div>

      {listaStatus && (
        <div className={styles.bannerFiltro}>
          <span>🔎 Filtrado pelo Painel: {listaStatus.map(s => STATUS_LABEL[s]?.label || s).join(', ')}</span>
          <button className={styles.btnLimparFiltro} onClick={() => setParams({}, { replace: true })}>
            Ver todos
          </button>
        </div>
      )}

      {visiveis.length === 0 && (
        <div className={styles.empty}>
          <p>{listaStatus ? 'Nenhum pedido nessa situação.' : 'Nenhum pedido encontrado.'}</p>
          {!listaStatus && <button className={styles.btnNovo} onClick={onNovoPedido}>Criar primeiro pedido</button>}
        </div>
      )}

      {devolvidos.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>🔴 Devolvidos para Correção</h3>
          {devolvidos.map(p => (
            <PedidoCard
              key={p.id}
              pedido={p}
              onCorrigir={onCorrigir}
              onReenviar={handleReenviar}
              reenviadoId={reenviadoId}
              destaque
            />
          ))}
        </section>
      )}

      {outros.length > 0 && (
        <section className={styles.section}>
          {devolvidos.length > 0 && <h3 className={styles.sectionTitle}>Outros pedidos</h3>}
          {outros.map(p => (
            <PedidoCard
              key={p.id}
              pedido={p}
              onCorrigir={onCorrigir}
              onReenviar={handleReenviar}
              reenviadoId={reenviadoId}
            />
          ))}
        </section>
      )}
    </div>
  )
}

function PedidoCard({ pedido, onCorrigir, onReenviar, reenviadoId, destaque }) {
  const st   = STATUS_LABEL[pedido.status] || { label: pedido.status, cls: 'pending' }
  const data = pedido.created_at
    ? format(new Date(pedido.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    : '—'
  const podeCorrigir = isDevolvido(pedido.status)
  // `empresa` é o nome gravado pelo banco (texto)
  const nomeEmpresa = typeof pedido.empresa === 'string' ? pedido.empresa : pedido.empresa?.nome
  const tipo = TIPOS_AMOSTRA.find(t => t.value === pedido.material)

  return (
    <div
      className={`${styles.card} ${destaque ? styles.cardDestaque : ''} ${podeCorrigir ? styles.cardClicavel : ''}`}
      onClick={podeCorrigir ? () => onCorrigir?.(pedido) : undefined}
      role={podeCorrigir ? 'button' : undefined}
      tabIndex={podeCorrigir ? 0 : undefined}
      onKeyDown={podeCorrigir ? (e) => e.key === 'Enter' && onCorrigir?.(pedido) : undefined}
      title={podeCorrigir ? 'Clique para corrigir e reenviar' : undefined}
    >
      <div className={styles.cardTop}>
        <span className={styles.numero}>{formatarNumeroPE(pedido)}</span>
        <div className={styles.cardTopRight}>
          {podeCorrigir && (
            <span className={styles.editHint}>✏️ Toque para corrigir</span>
          )}
          <span className={`${styles.badge} ${styles[st.cls]}`}>{st.label}</span>
        </div>
      </div>

      <div className={styles.cardInfo}>
        <span>📅 {data}</span>
        {nomeEmpresa && <span>🏢 {nomeEmpresa}</span>}
        {pedido.lote     && <span>📍 {/^lote/i.test(String(pedido.lote).trim()) ? pedido.lote : `Lote ${pedido.lote}`}</span>}
        {tipo && <span>{tipo.icone} {tipo.label}</span>}
      </div>

      {isDevolvido(pedido.status) && pedido.motivo_devolucao && (
        <div className={styles.motivo}>
          <strong>Motivo:</strong> {pedido.motivo_devolucao}
        </div>
      )}

      {pedido.status === 'pendente_sync' && (
        <div className={styles.offlineTag}>📶 Salvo localmente — aguardando conexão</div>
      )}

      {pedido.status === 'pendente_sync' && (
        <div className={styles.cardActions}>
          <button
            className={styles.btnReenviar}
            onClick={(e) => onReenviar(pedido, e)}
            disabled={reenviadoId === pedido.id}
          >
            {reenviadoId === pedido.id ? 'Enviando...' : '📤 Tentar Enviar Agora'}
          </button>
        </div>
      )}
    </div>
  )
}
