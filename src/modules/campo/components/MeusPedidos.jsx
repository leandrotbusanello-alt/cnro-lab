import { useState } from 'react'
import { useCampo } from '../useCampo'
import styles from './MeusPedidos.module.css'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Status do pedido (seção 7 da Referência Técnica)
const STATUS_LABEL = {
  pendente_sync:      { label: 'Aguardando envio',        cls: 'offline'   },
  aguardando_lab:     { label: 'Aguardando laboratório',  cls: 'pending'   },
  em_analise:         { label: 'Em análise',              cls: 'info'      },
  devolvido_campo:    { label: 'Devolvido para correção', cls: 'error'     },
  em_andamento:       { label: 'Em andamento',            cls: 'info'      },
  aguardando_revisao: { label: 'Em revisão',              cls: 'info'      },
  concluido:          { label: 'Concluído',               cls: 'success'   },
  cancelado:          { label: 'Cancelado',               cls: 'cancelled' },
}
const DEVOLVIDO = 'devolvido_campo'

// Bug 3 fix: formatar numero_pe retornado pelo banco
function formatarNumeroPE(pedido) {
  if (pedido.numero_pe && pedido.ano) {
    return `PE-${pedido.ano}-${String(pedido.numero_pe).padStart(4, '0')}`
  }
  if (pedido.numero_os) return `O.S. ${pedido.numero_os}`
  return `Pedido #${String(pedido.id).slice(0, 8)}`
}

export default function MeusPedidos({ onCorrigir, onNovoPedido }) {
  const { pedidos, loading, reenviarPedido } = useCampo()
  const [reenviadoId, setReenviadoId] = useState(null)

  const devolvidos = pedidos.filter(p => p.status === DEVOLVIDO)
  const outros = pedidos.filter(p => p.status !== DEVOLVIDO)

  async function handleReenviar(pedido) {
    setReenviadoId(pedido.id)
    try {
      await reenviarPedido(pedido.id)
    } catch {
      /* continua guardado no aparelho; a fila tenta de novo quando a conexão voltar */
    } finally {
      setReenviadoId(null)
    }
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
          </span>
        </div>
      )}

      <div className={styles.header}>
        <h2 className={styles.title}>Meus Pedidos</h2>
        <button className={styles.btnNovo} onClick={onNovoPedido}>+ Novo Pedido</button>
      </div>

      {pedidos.length === 0 && (
        <div className={styles.empty}>
          <p>Nenhum pedido encontrado.</p>
          <button className={styles.btnNovo} onClick={onNovoPedido}>Criar primeiro pedido</button>
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
  const st = STATUS_LABEL[pedido.status] || { label: pedido.status, cls: 'pending' }
  const data = pedido.created_at
    ? format(new Date(pedido.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    : '—'

  return (
    <div className={`${styles.card} ${destaque ? styles.cardDestaque : ''}`}>
      <div className={styles.cardTop}>
        {/* Bug 3 fix: exibir PE-{ano}-{numero_pe} quando disponível */}
        <span className={styles.numero}>{formatarNumeroPE(pedido)}</span>
        <span className={`${styles.badge} ${styles[st.cls]}`}>{st.label}</span>
      </div>

      <div className={styles.cardInfo}>
        <span>📅 {data}</span>
        {pedido.empresa && <span>🏢 {pedido.empresa}</span>}
        {pedido.lote    && <span>📍 Lote {pedido.lote}</span>}
        {pedido.material && <span>🪨 {pedido.material}</span>}
      </div>

      {pedido.status === DEVOLVIDO && pedido.motivo_devolucao && (
        <div className={styles.motivo}>
          <strong>Motivo:</strong> {pedido.motivo_devolucao}
        </div>
      )}

      {pedido.status === 'pendente_sync' && (
        <div className={styles.offlineTag}>📶 Salvo localmente — aguardando conexão</div>
      )}

      <div className={styles.cardActions}>
        {pedido.status === DEVOLVIDO && (
          <button className={styles.btnCorrigir} onClick={() => onCorrigir?.(pedido)}>
            ✏️ Corrigir e Reenviar
          </button>
        )}
        {pedido.status === 'pendente_sync' && (
          <button
            className={styles.btnReenviar}
            onClick={() => onReenviar(pedido)}
            disabled={reenviadoId === pedido.id}
          >
            {reenviadoId === pedido.id ? 'Enviando...' : '📤 Tentar Enviar Agora'}
          </button>
        )}
      </div>
    </div>
  )
}
