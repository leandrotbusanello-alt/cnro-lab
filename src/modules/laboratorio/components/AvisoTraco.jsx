import { useCadastros, dataBR } from '../../../lib/cadastros'
import ui from './ui.module.css'

/** Pedido com traço (projeto adotado) vencido na data da solicitação — migração 17 */
export default function AvisoTraco({ pedido }) {
  const { tracos } = useCadastros()
  if (!pedido?.traco_id) return null
  const t = (tracos || []).find(x => x.id === pedido.traco_id)
  if (!t?.valido_ate) return null
  const dataPedido = String(pedido.created_at || '').slice(0, 10)
  if (!dataPedido || t.valido_ate >= dataPedido) return null
  return (
    <div className={`${ui.aviso} ${ui.avisoAlerta}`}>
      ⚠️ O traço informado pelo Campo (<strong>{t.nome_traco}</strong>) estava vencido na data do pedido
      (validade até {dataBR(t.valido_ate)}).
    </div>
  )
}
