import { useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { numeroOS, dataHora } from '../utils'
import ui from './ui.module.css'

/**
 * Reabrir O.S. finalizada (Gestor; DEV nos lançamentos históricos — migração 30).
 * Com pedido do laboratorista, o motivo vem preenchido com o dele (pode ser complementado).
 */
export default function ModalReabrir({ pedido, solicitante, ocupado, onFechar, onConfirmar }) {
  const pedida = !!pedido.reabertura_solicitada_em
  const [motivo, setMotivo] = useState(pedido.reabertura_motivo || '')
  const valido = motivo.trim().length >= 5

  return (
    <Modal
      titulo={pedida ? 'Autorizar reabertura' : 'Reabrir O.S.'}
      subtitulo={numeroOS(pedido)}
      onFechar={onFechar}
      rodape={(
        <>
          <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={onFechar} disabled={ocupado}>Cancelar</button>
          <button className={`${ui.btn} ${ui.btnAcao}`} onClick={() => onConfirmar(motivo.trim())} disabled={!valido || ocupado}>
            {ocupado ? 'Reabrindo…' : '🔓 Reabrir O.S.'}
          </button>
        </>
      )}
    >
      <div className={ui.pilha}>
        {pedida && (
          <div className={`${ui.aviso} ${ui.avisoInfo}`}>
            Pedido de <strong>{solicitante?.nome || 'laboratorista'}</strong> em {dataHora(pedido.reabertura_solicitada_em)}.
          </div>
        )}
        <p>Ao reabrir:</p>
        <ul className={ui.ajuda} style={{ margin: 0, paddingLeft: 18 }}>
          <li>a O.S. volta para o laboratorista responsável, com o selo “Reaberta”;</li>
          <li>a finalização anterior é desconsiderada — será preciso finalizar e assinar de novo;</li>
          <li>os ensaios aprovados continuam aprovados e os resultados continuam visíveis ao campo;</li>
          <li>o pedido e todas as datas (O.S. e ensaios) ficam editáveis até a nova finalização.</li>
        </ul>
        <label className={ui.campo}>
          <span className={ui.rotulo}>Motivo da reabertura <span className={ui.obrigatorio}>*</span></span>
          <textarea className={`${ui.input} ${ui.textarea}`} value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus />
          <span className={ui.ajuda}>Fica visível na O.S. e no histórico.</span>
        </label>
      </div>
    </Modal>
  )
}
