import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLab } from '../../useLaboratorio'
import { numeroPE, normalizarAmostras, nomeEmpresa, deepEqual } from '../../utils'
import FichaOS from './FichaOS'
import FichaSolicitacao from './FichaSolicitacao'
import {
  RESPONSAVEIS_DOC, CAMPOS_BOOLEANOS_OS, TIPOS_SOLICITACAO, calcularIndicador,
  sugerirEnsaios, observacaoPadrao, localizacoesDasAmostras, normalizarLocalizacoes,
} from './catalogoFichas'
import s from './fichas.module.css'

/**
 * Abre a ficha (FR-IMOB-04 ou FR-IMOB-05) sobre a tela: editar, salvar e imprimir/PDF.
 *   doc = 'os' | 'solicitacao'
 */
export default function FichaDocumento({ doc, pedido, editavel, ocupado, onSalvar, onFechar }) {
  const lab = useLab()
  const [imprimindo, setImprimindo] = useState(false)

  // Recalcula os valores iniciais só quando a ficha salva muda (não a cada atualização da tela)
  const ficha = doc === 'os' ? pedido.ficha_os : pedido.ficha_sol
  const chave = `${doc}|${pedido.id}|${pedido.numero_os || ''}|${ficha?.updated_at || ''}|${ficha?.id || ''}`
  const inicial = useMemo(
    () => (doc === 'os' ? valoresOS(pedido, lab) : valoresSolicitacao(pedido, lab)),
    [chave], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const [v, setV] = useState(inicial)
  useEffect(() => { setV(inicial) }, [inicial])

  const alterado = !deepEqual(v, inicial)
  const set = (campo, valor) => setV(atual => ({ ...atual, [campo]: valor }))

  // Imprimir: troca os campos por texto, imprime e volta
  useEffect(() => {
    if (!imprimindo) return
    const id = requestAnimationFrame(() => {
      window.print()
      setImprimindo(false)
    })
    return () => cancelAnimationFrame(id)
  }, [imprimindo])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !alterado) onFechar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onFechar, alterado])

  function fechar() {
    if (alterado && !window.confirm('Há alterações não salvas na ficha. Fechar mesmo assim?')) return
    onFechar()
  }

  async function salvar() {
    const dados = { ...v }
    delete dados.numero_os
    if (doc === 'os') dados.indicador = calcularIndicador(v) || null
    if (doc === 'solicitacao') {
      dados.localizacoes = (v.localizacoes || [])
        .map(l => ({ km: (l.km || '').trim(), pista: (l.pista || '').trim(), trilho: (l.trilho || '').trim() }))
        .filter(l => l.km || l.pista || l.trilho)
    }
    await onSalvar(dados)
  }

  const titulo = doc === 'os' ? 'FR-IMOB-04 · Ordem de Serviço' : 'FR-IMOB-05 · Solicitação de Ensaios/Estudos'
  const podeEditar = editavel && !imprimindo
  const Ficha = doc === 'os' ? FichaOS : FichaSolicitacao

  return createPortal(
    <div className={s.overlay}>
      <div className={s.barraFerramentas}>
        <div className={s.barraTitulo}>
          <strong>{titulo}</strong>
          <small>{numeroPE(pedido)}{editavel ? ' · edição liberada' : ' · somente leitura'}</small>
        </div>
        <div className={s.barraAcoes}>
          {editavel && (
            <button className={`${s.btn} ${s.btnSalvar}`} onClick={salvar} disabled={!alterado || ocupado}>
              {ocupado ? 'Salvando…' : alterado ? '💾 Salvar ficha' : 'Salvo'}
            </button>
          )}
          <button className={`${s.btn} ${s.btnImprimir}`} onClick={() => setImprimindo(true)} disabled={ocupado}>
            🖨 Imprimir / PDF
          </button>
          <button className={s.btn} onClick={fechar}>Fechar</button>
        </div>
      </div>
      {editavel && alterado && (
        <div className={s.aviso}>Alterações não salvas. Salve antes de imprimir para que a versão impressa fique registrada.</div>
      )}
      <div className={s.area}>
        <Ficha v={v} set={set} editavel={podeEditar} responsaveis={responsaveis(pedido, doc)} />
      </div>
    </div>,
    document.body,
  )
}

function responsaveis(pedido, doc) {
  const f = (doc === 'os' ? pedido.ficha_os : pedido.ficha_sol) || {}
  return {
    elaborado: f.elaborado_por || RESPONSAVEIS_DOC.elaborado,
    revisado: f.revisado_por || RESPONSAVEIS_DOC.revisado,
    aprovado: f.aprovado_por || RESPONSAVEIS_DOC.aprovado,
  }
}

function dataISO(d) {
  if (!d) return ''
  return String(d).slice(0, 10)
}

// ── Valores iniciais ─────────────────────────────────────────────────────────
// Se a ficha já foi salva (observacao_editada), vale o que está salvo.
// Senão, preenche com os dados do pedido (e sugere os ensaios marcados).

function valoresOS(pedido, lab) {
  const f = pedido.ficha_os || {}
  const salva = !!f.observacao_editada
  const amostras = normalizarAmostras(pedido.dados_amostra)
  const empresa = nomeEmpresa(pedido, lab.empresasPorId)
  const eos = lab.ensaiosOsPorPedido[pedido.id] || []
  const nomesEnsaios = eos.length
    ? eos.map(e => e.nome_ensaio || lab.ensaiosPorId[e.ensaio_id]?.nome || '')
    : (pedido.ensaios_ids || []).map(id => lab.ensaiosPorId[id]?.nome || '')

  const marcados = salva ? {} : sugerirEnsaios(nomesEnsaios, pedido.material)
  const booleanos = Object.fromEntries(CAMPOS_BOOLEANOS_OS.map(c => [c, salva ? !!f[c] : !!(f[c] || marcados[c])]))

  return {
    numero_os: String(pedido.numero_os || '').replace(/^O\.S\.\s*/, ''),
    data_solicitacao: dataISO(f.data_solicitacao || pedido.created_at),
    inicio_ensaios: dataISO(f.inicio_ensaios),
    fim_ensaios: dataISO(f.fim_ensaios),
    previsao_entrega: dataISO(f.previsao_entrega),
    analise_ensaios: dataISO(f.analise_ensaios),
    repactuacao_data: dataISO(f.repactuacao_data),
    entrega_solicitacao: dataISO(f.entrega_solicitacao),
    motivo_repactuacao: f.motivo_repactuacao || '',
    obra: f.obra || empresa,
    lote: f.lote || pedido.lote || '',
    solicitante: f.solicitante || (lab.usuariosPorId[pedido.solicitante_id]?.nome || '').toUpperCase(),
    contato: f.contato || '',
    ...booleanos,
    observacao: f.observacao || observacaoPadrao(pedido, amostras, empresa),
  }
}

function valoresSolicitacao(pedido, lab) {
  const f = pedido.ficha_sol || {}
  const amostras = normalizarAmostras(pedido.dados_amostra)
  const empresa = nomeEmpresa(pedido, lab.empresasPorId)
  const salvas = normalizarLocalizacoes(f.localizacoes).filter(l => l.km || l.pista || l.trilho)
  const tipos = Object.fromEntries(TIPOS_SOLICITACAO.map(t => [
    t.campo, f.observacao_editada ? !!f[t.campo] : !!(f[t.campo] || pedido.tipo_solicitacao === t.valor),
  ]))
  return {
    obra: f.obra || empresa,
    lote: f.lote || pedido.lote || '',
    solicitante: f.solicitante || (lab.usuariosPorId[pedido.solicitante_id]?.nome || '').toUpperCase(),
    contato: f.contato || '',
    ...tipos,
    localizacoes: salvas.length ? salvas : localizacoesDasAmostras(amostras),
    observacao: f.observacao || observacaoPadrao(pedido, amostras, empresa),
  }
}
