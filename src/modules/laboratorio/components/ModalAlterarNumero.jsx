import { useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { numeroPE, numeroOS, ehOSProvisoria } from '../utils'
import ui from './ui.module.css'

/**
 * Corrigir o número do PE (somente DEV — migração 14).
 * O número da O.S. termina com o mesmo sequencial, então também é atualizado.
 */
export default function ModalAlterarNumero({ pedido, ocupado, onFechar, onConfirmar }) {
  const [numero, setNumero] = useState(String(pedido.sequencial || ''))
  const n = Number(numero)
  const valido = /^\d{1,4}$/.test(numero) && n >= 1 && n !== pedido.sequencial
  const novoPE = `PE-${pedido.ano}-${String(numero || '').padStart(4, '0')}`
  const temOS = pedido.numero_os && !ehOSProvisoria(pedido)
  const novaOS = temOS && /^\d{1,4}$/.test(numero)
    ? String(pedido.numero_os).replace(/\d{4}$/, numero.padStart(4, '0')) : null

  return (
    <Modal
      titulo="Alterar número do pedido"
      subtitulo={`${numeroPE(pedido)}${temOS ? ` · ${numeroOS(pedido, { curto: true })}` : ''}`}
      onFechar={onFechar}
      rodape={(
        <>
          <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={onFechar} disabled={ocupado}>Cancelar</button>
          <button className={`${ui.btn} ${ui.btnPrimario}`} disabled={!valido || ocupado} onClick={() => onConfirmar(n)}>
            {ocupado ? 'Salvando…' : 'Alterar número'}
          </button>
        </>
      )}
    >
      <div className={ui.pilha}>
        <label className={ui.campo}>
          <span className={ui.rotulo}>Novo número (1 a 9999)</span>
          <input className={ui.input} inputMode="numeric" value={numero} autoFocus
            onChange={e => setNumero(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        </label>
        {valido && (
          <div className={`${ui.aviso} ${ui.avisoInfo}`}>
            Passa a ser <strong>{novoPE}</strong>{novaOS ? <> e <strong>O.S. {novaOS}</strong></> : ''}.
            A observação das fichas FR-IMOB-04/05 também é ajustada.
          </div>
        )}
        <p className={ui.ajuda}>
          O sistema recusa números que já existem no ano. Se o novo número for maior que o último usado,
          os próximos pedidos do Campo continuam a partir dele.
        </p>
      </div>
    </Modal>
  )
}
