import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLab } from '../useLaboratorio'
import { obterModelo } from '../../fichas/fichasRepo'
import { camposDoPedido } from '../../fichas/camposPedido'
import { estadoDosDados } from '../../fichas/motor/ficha.js'
import { useFicha } from '../../fichas/useFicha'
import { paginasDaFicha, PaginaA4 } from '../../fichas/components/ImpressaoFicha'
import FichaOS from './fichas/FichaOS'
import FichaSolicitacao from './fichas/FichaSolicitacao'
import { valoresOS, valoresSolicitacao, responsaveis } from './fichas/FichaDocumento'
import { obterResumo, ehImagem } from '../../../lib/resumoOS'
import s from '../../fichas/components/Ficha.module.css'
import st from './ArquivosOS.module.css'

/**
 * "Gerar arquivos da O.S." (O.S. finalizada — Laboratório e Gestor): uma única tela de impressão
 * com FR-IMOB-05, FR-IMOB-04, as fichas de todos os ensaios aprovados (com as folhas adicionais)
 * e o resumo para o Campo, cada documento na sua orientação. Imprimir ou "Salvar como PDF".
 */
export default function ArquivosOS({ pedido, ensaiosOs, onFechar }) {
  const lab = useLab()
  const aprovados = useMemo(() => ensaiosOs.filter(e => e.status === 'aprovado'), [ensaiosOs])
  const [prontos, setProntos] = useState({})
  const [resumo, setResumo] = useState(undefined)
  const [comResumo, setComResumo] = useState(true)
  const marcarPronto = useCallback((id, info) => setProntos(p => (p[id] ? p : { ...p, [id]: info || true })), [])

  useEffect(() => {
    let ativo = true
    obterResumo(pedido.id).then(r => ativo && setResumo(r)).catch(() => ativo && setResumo(null))
    return () => { ativo = false }
  }, [pedido.id])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onFechar])

  const vOS = useMemo(() => valoresOS(pedido, lab), [pedido, lab])
  const vSol = useMemo(() => valoresSolicitacao(pedido, lab), [pedido, lab])
  const qtdProntos = aprovados.filter(e => prontos[e.id]).length
  const carregando = qtdProntos < aprovados.length || resumo === undefined
  const falhas = aprovados.filter(e => prontos[e.id]?.erro)
  const resumoImagem = resumo && ehImagem(resumo) && resumo.url

  return createPortal(
    <div className={s.impressao}>
      <style>{'@page retrato { size: A4 portrait; margin: 0; } @page paisagem { size: A4 landscape; margin: 0; }'}</style>
      <div className={s.impressaoBarra}>
        <div className={st.titulos}>
          <strong>Arquivos da O.S. {pedido.numero_os}</strong>
          <span>
            FR-IMOB-05 · FR-IMOB-04 · {aprovados.length} ficha(s) de ensaio aprovada(s)
            {resumo ? ' · resumo para o Campo' : ''}
            {carregando ? ` — preparando ${qtdProntos}/${aprovados.length}…` : ''}
          </span>
        </div>
        <div className={s.impressaoAcoes}>
          {resumo && (
            <label className={st.opcao}>
              <input type="checkbox" checked={comResumo} onChange={e => setComResumo(e.target.checked)} />
              Incluir o resumo
            </label>
          )}
          <button type="button" className={`${s.popBtn} ${s.popPrimario}`} onClick={() => window.print()} disabled={carregando}>
            {carregando ? 'Preparando…' : '🖨 Imprimir / PDF'}
          </button>
          <button type="button" className={s.popBtn} onClick={onFechar}>Fechar</button>
        </div>
      </div>
      {falhas.length > 0 && (
        <div className={st.aviso}>
          Não foi possível carregar a ficha de: {falhas.map(e => e.nome_ensaio).join(', ')}. Verifique a internet e abra de novo.
        </div>
      )}
      <div className={s.impressaoArea}>
        <div className={st.docFR}><FichaSolicitacao v={vSol} set={() => {}} editavel={false} responsaveis={responsaveis(pedido, 'solicitacao')} /></div>
        <div className={st.docFR}><FichaOS v={vOS} set={() => {}} editavel={false} responsaveis={responsaveis(pedido, 'os')} /></div>
        {aprovados.map(eo => (
          <FichaDoEnsaio key={eo.id} eo={eo} pedido={pedido} lab={lab} onPronto={marcarPronto} />
        ))}
        {resumo && comResumo && (
          <div className={`${s.folhaA4} ${st.paginaResumo}`} style={{ width: 210 * 96 / 25.4, height: 297 * 96 / 25.4, page: 'retrato' }}>
            <div className={st.resumoTitulo}>Resumo dos resultados · O.S. {pedido.numero_os}</div>
            {resumoImagem
              ? <img src={resumo.url} alt="Resumo da O.S." className={st.resumoImg} />
              : <div className={st.resumoPdf}>Resumo anexado em PDF ({resumo.nome}). Baixe pelo link do sistema para imprimir junto.</div>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Páginas da ficha de um ensaio aprovado (só leitura, com as assinaturas) */
function FichaDoEnsaio({ eo, pedido, lab, onPronto }) {
  const [modeloReg, setModeloReg] = useState(null)
  const [erro, setErro] = useState(null)
  const [urls, setUrls] = useState({})
  const modeloId = eo.ficha_modelo_id || eo.dados_resultado?.modelo_id || null

  useEffect(() => {
    let ativo = true
    if (!modeloId) { setErro('sem ficha online'); return undefined }
    obterModelo(modeloId)
      .then(m => { if (ativo) { if (m) setModeloReg(m); else setErro('não baixou') } })
      .catch(e => ativo && setErro(e.message))
    return () => { ativo = false }
  }, [modeloId])

  const executor = lab.usuariosPorId[eo.assinatura_executor?.usuario_id || eo.assistente_id]
  const aprovador = lab.usuariosPorId[eo.assinatura_calculista?.usuario_id || eo.aprovado_por_id]
  const [assinaturasProntas, setAssinaturasProntas] = useState(false)
  useEffect(() => {
    let ativo = true
    const pegar = (chave, u) => (u?.assinatura_url
      ? lab.urlAssinatura(u).then(url => { if (ativo && url) setUrls(x => ({ ...x, [chave]: url })) }).catch(() => {})
      : Promise.resolve())
    Promise.all([pegar('executor', executor), pegar('calculista', aprovador)]).then(() => ativo && setAssinaturasProntas(true))
    return () => { ativo = false }
  }, [executor?.id, aprovador?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const estado = useMemo(() => estadoDosDados(eo.dados_resultado), [eo.dados_resultado])
  const pedidoCampos = useMemo(() => camposDoPedido(pedido, { empresasPorId: lab.empresasPorId }), [pedido, lab.empresasPorId])
  const ficha = useFicha(modeloReg, estado, pedidoCampos)
  const paginas = useMemo(
    () => (ficha.indice ? paginasDaFicha({ indice: ficha.indice, motor: ficha.motor, motores: ficha.motores, estado }) : []),
    [ficha.indice, ficha.motor, ficha.motores, estado],
  )
  const pronto = (paginas.length > 0 && assinaturasProntas) || !!erro
  useEffect(() => { if (pronto) onPronto(eo.id, erro ? { erro } : true) }, [pronto, erro, eo.id, onPronto])

  if (erro || !paginas.length) return null
  const assinaturas = {
    executor: eo.assinatura_executor ? { ...eo.assinatura_executor, url: urls.executor } : null,
    calculista: eo.assinatura_calculista ? { ...eo.assinatura_calculista, url: urls.calculista } : null,
  }
  return paginas.map(p => <PaginaA4 key={`${eo.id}-${p.chave}`} p={p} indice={ficha.indice} assinaturas={assinaturas} nomeada />)
}
