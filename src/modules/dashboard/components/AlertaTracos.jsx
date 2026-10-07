import { Link } from 'react-router-dom'
import { useCadastros, statusTraco, DIAS_ALERTA_TRACO } from '../../../lib/cadastros'
import ui from '../../laboratorio/components/ui.module.css'

/** Aviso de validade dos traços aprovados (Laboratório e Gestor) — migração 17 */
export default function AlertaTracos() {
  const { tracos } = useCadastros()
  const ativos = (tracos || []).filter(t => t.ativo !== false)
  const vencidos = ativos.filter(t => statusTraco(t).codigo === 'vencido')
  const vencendo = ativos.filter(t => statusTraco(t).codigo === 'vence')
  if (!vencidos.length && !vencendo.length) return null
  const nomes = lista => lista.slice(0, 3).map(t => t.nome_traco).join('; ') + (lista.length > 3 ? '…' : '')
  return (
    <div className={`${ui.aviso} ${vencidos.length ? ui.avisoErro : ui.avisoAlerta}`}>
      <span>
        ⚠️ <strong>Traços aprovados:</strong>{' '}
        {vencidos.length > 0 && <><strong>{vencidos.length} vencido(s)</strong> ({nomes(vencidos)}){vencendo.length ? ' · ' : ''}</>}
        {vencendo.length > 0 && <><strong>{vencendo.length} vencem em até {DIAS_ALERTA_TRACO} dias</strong> ({nomes(vencendo)})</>}
        {' '}<Link to={`/cadastros?filtro=${vencidos.length ? 'vencido' : 'vence'}`}>Revalidar →</Link>
      </span>
    </div>
  )
}
