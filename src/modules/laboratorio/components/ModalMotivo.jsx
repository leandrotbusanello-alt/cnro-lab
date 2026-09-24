import { useState } from 'react'
import Modal from '../../../components/ui/Modal'
import ui from './ui.module.css'

/** Modal com motivo obrigatório (devolução ao campo / ao assistente) */
export default function ModalMotivo({
  titulo, subtitulo, rotulo = 'Motivo', placeholder, textoConfirmar = 'Confirmar',
  perigo = false, ocupado, onFechar, onConfirmar, children,
}) {
  const [motivo, setMotivo] = useState('')
  const valido = motivo.trim().length >= 5

  return (
    <Modal
      titulo={titulo}
      subtitulo={subtitulo}
      onFechar={onFechar}
      rodape={(
        <>
          <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={onFechar} disabled={ocupado}>Cancelar</button>
          <button
            className={`${ui.btn} ${perigo ? ui.btnPerigo : ui.btnPrimario}`}
            onClick={() => onConfirmar(motivo.trim())}
            disabled={!valido || ocupado}
          >
            {ocupado ? 'Enviando…' : textoConfirmar}
          </button>
        </>
      )}
    >
      <div className={ui.pilha}>
        {children}
        <label className={ui.campo}>
          <span className={ui.rotulo}>{rotulo} <span className={ui.obrigatorio}>*</span></span>
          <textarea
            className={`${ui.input} ${ui.textarea}`}
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder={placeholder}
            autoFocus
          />
          <span className={ui.ajuda}>O motivo fica visível para quem vai corrigir e no histórico.</span>
        </label>
      </div>
    </Modal>
  )
}
