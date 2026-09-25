import { useState } from 'react'
import { dataHora } from '../utils'
import styles from './HistoricoTimeline.module.css'
import ui from './ui.module.css'

const LIMITE = 8

/** Linha do tempo do pedido (campo `historico`) — mais recente primeiro */
export default function HistoricoTimeline({ historico }) {
  const [todos, setTodos] = useState(false)
  const eventos = [...(Array.isArray(historico) ? historico : [])].reverse()
  const exibidos = todos ? eventos : eventos.slice(0, LIMITE)

  return (
    <section className={ui.secao}>
      <div className={ui.secaoTitulo}>Histórico</div>
      {eventos.length === 0 ? (
        <p className={ui.vazio}>Nenhum evento registrado.</p>
      ) : (
        <ol className={styles.lista}>
          {exibidos.map((ev, i) => (
            <li key={i} className={styles.item}>
              <span className={styles.ponto} />
              <div className={styles.conteudo}>
                <strong className={styles.acao}>
                  {ev.acao}
                  {ev.offline && <span className={styles.offline}> · offline</span>}
                </strong>
                <span className={styles.meta}>{dataHora(ev.data)}{ev.usuario ? ` · ${ev.usuario}` : ''}</span>
                {detalhes(ev).map((d, j) => <span key={j} className={styles.detalhe}>{d}</span>)}
              </div>
            </li>
          ))}
        </ol>
      )}
      {eventos.length > LIMITE && (
        <button className={ui.btnLink} onClick={() => setTodos(t => !t)}>
          {todos ? 'Mostrar menos' : `Ver todos (${eventos.length})`}
        </button>
      )}
    </section>
  )
}

function detalhes(ev) {
  const d = []
  if (ev.ensaio) d.push(`Ensaio: ${ev.ensaio}`)
  if (ev.assistente) d.push(`Executor: ${ev.assistente}`)
  if (ev.numero_os) d.push(`O.S. ${ev.numero_os}`)
  if (ev.acao === 'Número do PE alterado' && ev.de) d.push(`${ev.de} → ${ev.para}`)
  else if (ev.para) d.push(`Para: ${ev.para}`)
  if (Array.isArray(ev.campos) && ev.campos.length) d.push(`Alterado: ${ev.campos.join(', ')}`)
  if (ev.motivo) d.push(`Motivo: ${ev.motivo}`)
  if (ev.acao === 'O.S. finalizada' && ev.assinatura === false) d.push('Sem assinatura cadastrada')
  if (ev.lancado_por) d.push(`📜 Lançado por ${ev.lancado_por}${ev.lancado_em ? ` em ${dataHora(ev.lancado_em)}` : ''}`)
  return d
}
