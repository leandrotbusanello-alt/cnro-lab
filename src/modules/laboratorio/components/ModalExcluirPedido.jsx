import { useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { numeroPE, numeroOS } from '../utils'
import ui from './ui.module.css'

/**
 * Excluir pedido (somente DEV — migração 14).
 * Apaga o pedido e tudo o que depende dele. Exige digitar o número do PE.
 */
export default function ModalExcluirPedido({ pedido, ensaiosOs, ocupado, onFechar, onConfirmar }) {
  const [texto, setTexto] = useState('')
  const pe = numeroPE(pedido)
  const seq = String(pedido.sequencial || '')
  const t = texto.trim().toUpperCase()
  const confere = !!t && (t === pe.toUpperCase() || t === pedido.numero_pe || t === seq)
  const aprovados = ensaiosOs.filter(e => e.status === 'aprovado').length

  return (
    <Modal
      titulo="Excluir pedido"
      subtitulo={`${pe}${pedido.numero_os ? ` · ${numeroOS(pedido, { curto: true })}` : ''}`}
      onFechar={onFechar}
      rodape={(
        <>
          <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={onFechar} disabled={ocupado}>Cancelar</button>
          <button className={`${ui.btn} ${ui.btnPerigo}`} disabled={!confere || ocupado} onClick={() => onConfirmar(texto.trim())}>
            {ocupado ? 'Excluindo…' : '🗑 Excluir definitivamente'}
          </button>
        </>
      )}
    >
      <div className={ui.pilha}>
        <div className={`${ui.aviso} ${ui.avisoErro}`}>
          Esta ação não pode ser desfeita. Serão apagados o pedido, {ensaiosOs.length} ensaio(s) da O.S.
          {aprovados > 0 ? ` (${aprovados} com resultado aprovado — saem do Painel)` : ''}, os resultados e as
          fichas FR-IMOB-04/05. Usuários, empresas e catálogo não são alterados.
        </div>
        <p className={ui.ajuda}>
          Uma cópia do que foi apagado fica guardada na auditoria. O número {pe} fica livre para ser lançado de novo
          manualmente (o contador automático não volta).
        </p>
        <label className={ui.campo}>
          <span className={ui.rotulo}>Para confirmar, digite o número do pedido: <strong>{pe}</strong></span>
          <input className={ui.input} value={texto} onChange={e => setTexto(e.target.value)} placeholder={pe} autoFocus />
        </label>
      </div>
    </Modal>
  )
}
