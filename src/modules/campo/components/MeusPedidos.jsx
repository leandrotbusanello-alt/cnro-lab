import { useEffect, useState } from 'react'
import { useCampo } from '../useCampo'
import styles from './MeusPedidos.module.css'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const STATUS_LABEL = {
  pendente_sync: { label: 'Aguardando envio', cls: 'offline' },
  aguardando_analise: { label: 'Aguardando análise', cls: 'pending' },
  em_analise: { label: 'Em análise', cls: 'info' },
  aprovado: { label: 'Aprovado', cls: 'success' },
  devolvido: { label: 'Devolvido para correção', cls: 'error' },
  cancelado: { label: 'Cancelado', cls: 'cancelled' },
}

export default function MeusPedidos({ onCorrigir, onNovoPedido }) {
  const { pedidos, loading, reenviarPedido } = useCampo()
  const [reenviadoId, setReenviadoId] = useState(null)

  const devolvidos = pedidos.filter(p => p.status === 'devolvido')
  const outros = pedidos.filter(p => p.status !== 'devolvido')

  async function handleReenviar(pedido) {
    setReenviadoId(pedido.id)
    await reenviarPedido(pedido.id)
    setReenviadoId(null)
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
        <span className={styles.numero}>
          {pedido.numero_os ? `O.S. ${pedido.numero_os}` : `Pedido #${String(pedido.id).slice(0, 8)}`}
        </span>
        <span className={`${styles.badge} ${styles[st.cls]}`}>{st.label}</span>
      </div>

      <div className={styles.cardInfo}>
        <span>📅 {data}</span>
        {pedido.empresa?.nome_fantasia && <span>🏢 {pedido.empresa.nome_fantasia}</span>}
        {pedido.material && <span>🪨 {pedido.material}</span>}
        {pedido.lote && <span>📍 {pedido.lote}</span>}
      </div>

      {pedido.status === 'devolvido' && pedido.motivo_devolucao && (
        <div className={styles.motivo}>
          <strong>Motivo:</strong> {pedido.motivo_devolucao}
        </div>
      )}

      {pedido.status === 'pendente_sync' && (
        <div className={styles.offlineTag}>📶 Salvo localmente — aguardando conexão</div>
      )}

      <div className={styles.cardActions}>
        {pedido.status === 'devolvido' && (
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
