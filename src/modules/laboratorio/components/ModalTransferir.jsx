import { useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { useLab } from '../useLaboratorio'
import { PERFIS_LABORATORISTAS } from '../constants'
import { numeroPE, numeroOS } from '../utils'
import { ehHistorico, laboratoristasHistorico, rotuloUsuario } from '../../../lib/historico'
import ui from './ui.module.css'

/** Transferir a O.S. para outro laboratorista */
export default function ModalTransferir({ pedido, ocupado, onFechar, onConfirmar }) {
  const { usuarios } = useLab()
  const [para, setPara] = useState('')
  const [motivo, setMotivo] = useState('')

  // lançamento histórico: qualquer um com o módulo Laboratório, inclusive inativos
  const opcoes = ehHistorico(pedido)
    ? laboratoristasHistorico(usuarios).filter(u => u.id !== pedido.laboratorista_id)
    : usuarios.filter(u =>
      PERFIS_LABORATORISTAS.includes(String(u.perfil).toUpperCase())
      && (u.status || 'Ativo') === 'Ativo'
      && u.id !== pedido.laboratorista_id)

  return (
    <Modal
      titulo="Transferir O.S."
      subtitulo={`${numeroPE(pedido)}${pedido.numero_os ? ` · ${numeroOS(pedido, { curto: true })}` : ''}`}
      onFechar={onFechar}
      rodape={(
        <>
          <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={onFechar} disabled={ocupado}>Cancelar</button>
          <button className={`${ui.btn} ${ui.btnPrimario}`} disabled={!para || ocupado}
            onClick={() => onConfirmar(para, motivo.trim())}>
            {ocupado ? 'Transferindo…' : 'Transferir'}
          </button>
        </>
      )}
    >
      <div className={ui.pilha}>
        <label className={ui.campo}>
          <span className={ui.rotulo}>Novo responsável <span className={ui.obrigatorio}>*</span></span>
          <select className={ui.input} value={para} onChange={e => setPara(e.target.value)}>
            <option value="">Selecione…</option>
            {opcoes.map(u => <option key={u.id} value={u.id}>{rotuloUsuario(u)}{u.cargo ? ` · ${u.cargo}` : ''}</option>)}
          </select>
        </label>
        <label className={ui.campo}>
          <span className={ui.rotulo}>Motivo (opcional)</span>
          <input className={ui.input} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: férias" />
        </label>
        <div className={`${ui.aviso} ${ui.avisoInfo}`}>
          Após transferir, somente o novo responsável poderá editar esta O.S.
        </div>
      </div>
    </Modal>
  )
}
