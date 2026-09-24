import { STATUS_PEDIDO, STATUS_ENSAIO } from '../constants'
import ui from './ui.module.css'

export function StatusPedido({ status }) {
  const s = STATUS_PEDIDO[status] || { label: status || '—', tom: 'neutro' }
  return <span className={`${ui.badge} ${ui[s.tom]}`}>{s.label}</span>
}

export function StatusEnsaio({ status }) {
  const s = STATUS_ENSAIO[status] || { label: status || '—', tom: 'neutro' }
  return <span className={`${ui.badge} ${ui[s.tom]}`}>{s.label}</span>
}

export function Selo({ tom = 'neutro', children, title }) {
  return <span className={`${ui.badge} ${ui[tom]}`} title={title}>{children}</span>
}
