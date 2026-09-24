import { useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { useLab } from '../useLaboratorio'
import { ehIdTemp } from '../../../lib/syncQueue'
import { hojeISO, numeroPE, previaNumeroOS, normalizarAmostras } from '../utils'
import ui from './ui.module.css'

/** Validar pedido e gerar a O.S. (lote obrigatório) */
export default function ModalGerarOS({ pedido, ocupado, onFechar, onConfirmar }) {
  const { empresasPorId, empresas, ensaiosPorId } = useLab()
  const empresa = empresasPorId[pedido.empresa_id] || empresas.find(e => e.nome === pedido.empresa)
  const [lote, setLote] = useState(pedido.lote || empresa?.lote || '')
  const [dataValidacao, setDataValidacao] = useState(hojeISO())

  const loteValido = /\d/.test(lote)
  const ensaios = pedido.ensaios_ids || []
  const offline = !navigator.onLine || ehIdTemp(pedido.id) || !pedido.sequencial
  const previa = !offline && previaNumeroOS({ data: dataValidacao, lote, sequencial: pedido.sequencial })
  const pode = loteValido && ensaios.length > 0 && !!dataValidacao

  return (
    <Modal
      titulo="Validar pedido e gerar O.S."
      subtitulo={numeroPE(pedido)}
      onFechar={onFechar}
      rodape={(
        <>
          <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={onFechar} disabled={ocupado}>Cancelar</button>
          <button
            className={`${ui.btn} ${ui.btnAcao}`}
            disabled={!pode || ocupado}
            onClick={() => onConfirmar({ lote: lote.trim(), dataValidacao })}
          >
            {ocupado ? 'Gerando…' : '✓ Gerar O.S.'}
          </button>
        </>
      )}
    >
      <div className={ui.pilha}>
        <div className={ui.grade2}>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Lote <span className={ui.obrigatorio}>*</span></span>
            <input className={ui.input} value={lote} onChange={e => setLote(e.target.value)} placeholder="Ex.: 03" autoFocus />
            {!loteValido && <span className={ui.ajuda} style={{ color: '#b91c1c' }}>Informe o lote (precisa conter o número).</span>}
          </label>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Data da validação</span>
            <input type="date" className={ui.input} value={dataValidacao} max={hojeISO()}
              onChange={e => setDataValidacao(e.target.value)} />
          </label>
        </div>

        {offline ? (
          <div className={`${ui.aviso} ${ui.avisoAlerta}`}>
            📶 Sem conexão (ou pedido ainda não sincronizado): a O.S. será criada com <strong>número provisório</strong>.
            O número definitivo é atribuído automaticamente na sincronização.
          </div>
        ) : previa && (
          <div className={`${ui.aviso} ${ui.avisoInfo}`}>
            Número da O.S.: <strong>O.S. {previa}</strong>
          </div>
        )}

        <div>
          <span className={ui.rotulo}>Resumo</span>
          <ul style={{ margin: '6px 0 0 18px', fontSize: 14, lineHeight: 1.6 }}>
            <li>{normalizarAmostras(pedido.dados_amostra).length} amostra(s)</li>
            <li>{ensaios.length} ensaio(s): {ensaios.map(id => ensaiosPorId[id]?.nome || '?').join(', ') || '—'}</li>
          </ul>
        </div>

        <p className={ui.ajuda}>
          Serão criadas as fichas FR-IMOB-04 (O.S.) e FR-IMOB-05 (Solicitação). Depois, atribua um executor para cada ensaio.
        </p>
      </div>
    </Modal>
  )
}
