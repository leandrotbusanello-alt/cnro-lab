import { useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { isoParaData } from '../../../lib/historico'
import { hojeISO } from '../utils'
import ui from './ui.module.css'

/** Nova data mantendo a hora original (Cuiabá, -04:00); sem hora original, meio-dia. */
function comHora(original, dia, tipo) {
  if (!dia) return null
  if (tipo === 'data') return dia
  if (original && isoParaData(original) === dia) return original
  const d = original ? new Date(original) : null
  const hhmm = d && !isNaN(d) ? d.toLocaleTimeString('pt-BR', { timeZone: 'America/Cuiaba', hour12: false }) : '12:00:00'
  return `${dia}T${hhmm}-04:00`
}

/**
 * Correção de datas (O.S. reaberta — migração 30).
 *   campos: [{ chave, rotulo, valor (ISO ou 'AAAA-MM-DD'), tipo: 'data'|'momento', obrigatorio, ajuda }]
 *   onConfirmar({ chave: valor }) — 'momento' volta como ISO (mantém a hora original), 'data' como 'AAAA-MM-DD'.
 */
export default function ModalDatas({ titulo, subtitulo, aviso, campos, ocupado, onFechar, onConfirmar }) {
  const [dias, setDias] = useState(() => Object.fromEntries(campos.map(c => [c.chave, isoParaData(c.valor)])))
  const faltando = campos.some(c => c.obrigatorio && !dias[c.chave])

  function confirmar() {
    onConfirmar(Object.fromEntries(campos.map(c => [c.chave, comHora(c.valor, dias[c.chave], c.tipo)])))
  }

  return (
    <Modal
      titulo={titulo}
      subtitulo={subtitulo}
      onFechar={onFechar}
      rodape={(
        <>
          <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={onFechar} disabled={ocupado}>Cancelar</button>
          <button className={`${ui.btn} ${ui.btnPrimario}`} onClick={confirmar} disabled={ocupado || faltando}>
            {ocupado ? 'Salvando…' : '💾 Salvar datas'}
          </button>
        </>
      )}
    >
      <div className={ui.pilha}>
        {aviso && <p className={ui.ajuda}>{aviso}</p>}
        {campos.map(c => (
          <label key={c.chave} className={ui.campo}>
            <span className={ui.rotulo}>{c.rotulo}{c.obrigatorio && <span className={ui.obrigatorio}> *</span>}</span>
            <input
              type="date"
              className={ui.input}
              value={dias[c.chave] || ''}
              max={hojeISO()}
              disabled={c.desabilitado}
              onChange={e => setDias(d => ({ ...d, [c.chave]: e.target.value }))}
            />
            {c.ajuda && <span className={ui.ajuda}>{c.ajuda}</span>}
          </label>
        ))}
        <p className={ui.ajuda}>A alteração fica registrada no histórico da O.S. (data anterior e nova).</p>
      </div>
    </Modal>
  )
}
