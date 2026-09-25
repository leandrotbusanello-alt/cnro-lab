import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLab } from '../useLaboratorio'
import { dataHora, numeroOS, numeroPE } from '../utils'
import { StatusEnsaio } from './StatusBadge'
import { modulosDoUsuario } from '../../../lib/modulos'
import { obterModelo } from '../../fichas/fichasRepo'
import { camposDoPedido } from '../../fichas/camposPedido'
import { estadoDosDados } from '../../fichas/motor/ficha.js'
import { useFicha } from '../../fichas/useFicha'
import { CONFORMIDADES, MODULOS_QUE_IMPRIMEM } from '../../fichas/constants'
import FichaEnsaio from '../../fichas/components/FichaEnsaio'
import ImpressaoFicha from '../../fichas/components/ImpressaoFicha'
import styles from './RevisaoFicha.module.css'
import ui from './ui.module.css'

/**
 * Revisão de uma ficha online pelo laboratorista (tela cheia):
 * corrige qualquer campo, preenche os parâmetros, informa a conformidade,
 * assina como "Responsável calculista" e aprova — ou devolve ao assistente.
 * Ao aprovar, os resultados vão para `resultados` + `resultado_*` (Painel).
 */
export default function RevisaoFicha({ pedido, ensaioOs: eo, podeRevisar, ocupado, rodar, onFechar, onDevolver }) {
  const lab = useLab()
  const aguardando = eo.status === 'aguardando_revisao'
  const podeAprovar = podeRevisar && aguardando
  const podeDevolver = podeRevisar && ['aguardando_revisao', 'aprovado'].includes(eo.status)
  const modo = podeAprovar ? 'revisao' : 'leitura'

  const assistente = lab.usuariosPorId[eo.assistente_id]
  const eu = lab.usuariosPorId[lab.perfil?.id] || lab.perfil
  const aprovador = lab.usuariosPorId[eo.aprovado_por_id]
  const podeImprimir = modulosDoUsuario(lab.perfil).some(m => MODULOS_QUE_IMPRIMEM.includes(m))

  // ── Modelo da ficha (congelado quando o assistente iniciou) ──────────────
  const modeloId = eo.ficha_modelo_id || eo.dados_resultado?.modelo_id || null
  const [modeloReg, setModeloReg] = useState(null)
  const [erroModelo, setErroModelo] = useState(null)
  useEffect(() => {
    let ativo = true
    obterModelo(modeloId)
      .then(m => {
        if (!ativo) return
        setModeloReg(m)
        if (!m) setErroModelo('A ficha ainda não foi baixada neste aparelho. Conecte-se à internet para abri-la.')
      })
      .catch(e => { if (ativo) setErroModelo(e.message) })
    return () => { ativo = false }
  }, [modeloId])

  // ── Estado ───────────────────────────────────────────────────────────────
  const [estado, setEstado] = useState(() => estadoDosDados(eo.dados_resultado))
  const [alterado, setAlterado] = useState(false)
  const [assinaturaCalc, setAssinaturaCalc] = useState(null)   // { nome, em } — só nesta revisão
  const [conformidade, setConformidade] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [liberar, setLiberar] = useState(!!eo.visivel_campo)
  const [aviso, setAviso] = useState(null)
  const [imprimindo, setImprimindo] = useState(false)

  // recarrega se o registro mudar no servidor (ex.: outra aba salvou) e não houver edição local
  useEffect(() => {
    if (!alterado) setEstado(estadoDosDados(eo.dados_resultado))
  }, [eo.dados_resultado]) // eslint-disable-line react-hooks/exhaustive-deps

  const pedidoCampos = useMemo(() => camposDoPedido(pedido, { empresasPorId: lab.empresasPorId }), [pedido, lab.empresasPorId])
  const ficha = useFicha(modeloReg, estado, pedidoCampos)

  // ── Imagens das assinaturas ──────────────────────────────────────────────
  const [urls, setUrls] = useState({})
  useEffect(() => {
    let ativo = true
    const pegar = (chave, u) => { if (u?.assinatura_url) lab.urlAssinatura(u).then(url => { if (ativo) setUrls(x => ({ ...x, [chave]: url })) }) }
    pegar('executor', assistente)
    pegar('eu', eu)
    pegar('aprovador', aprovador)
    return () => { ativo = false }
  }, [assistente?.id, eu?.id, aprovador?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const assinaturas = {
    executor: eo.assinatura_executor
      ? { ...eo.assinatura_executor, url: urls.executor }
      : null,
    calculista: podeAprovar
      ? (assinaturaCalc ? { ...assinaturaCalc, url: urls.eu } : null)
      : (eo.assinatura_calculista ? { ...eo.assinatura_calculista, url: urls.aprovador } : null),
  }

  // ── Ações ────────────────────────────────────────────────────────────────
  function alterar(novo) {
    setEstado(novo)
    setAlterado(true)
  }

  async function salvar() {
    setAviso(null)
    const ok = await rodar(() => lab.acoes.salvarRevisaoFicha(pedido, eo, ficha.dados()), 'Correções salvas.')
    if (ok) setAlterado(false)
  }

  async function aprovar() {
    setAviso(null)
    const sit = ficha.situacao
    if (sit?.invalidos?.length) {
      setAviso(`Corrija ${sit.invalidos.length} campo(s) marcados em vermelho (${sit.invalidos.slice(0, 5).join(', ')}).`)
      return
    }
    if (!conformidade) { setAviso('Informe a conformidade do resultado.'); return }
    if (!eu?.assinatura_url) { setAviso('Você ainda não tem assinatura cadastrada. Peça ao Gestor para cadastrar antes de aprovar.'); return }
    if (!assinaturaCalc) { setAviso('Assine a ficha no campo “Responsável calculista” antes de aprovar.'); return }
    const ok = await rodar(() => lab.acoes.aprovarEnsaioFicha(pedido, eo, {
      dados: ficha.dados(),
      resultados: ficha.resultados(),
      conformidade,
      observacoes: observacoes.trim() || null,
      visivelCampo: liberar,
      assinadoEm: assinaturaCalc.em,
    }), 'Ensaio aprovado. Resultados enviados ao Painel.')
    if (ok) onFechar()
  }

  function fechar() {
    if (alterado && podeAprovar && !window.confirm('Há correções não salvas. Fechar mesmo assim?')) return
    onFechar()
  }

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !imprimindo) fechar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const titulo = `${eo.nome_ensaio}${modeloReg ? ` · ${modeloReg.codigo} ${modeloReg.versao}` : ''}`

  return createPortal(
    <div className={styles.tela} role="dialog" aria-modal="true" aria-label={`Revisão: ${eo.nome_ensaio}`}>
      <header className={styles.topo}>
        <button type="button" className={styles.voltar} onClick={fechar}>← Voltar</button>
        <div className={styles.titulos}>
          <h2>{podeAprovar ? 'Revisar: ' : ''}{titulo}</h2>
          <span>{numeroOS(pedido) || numeroPE(pedido)} · executor {assistente?.nome || '—'}
            {eo.enviado_em || eo.data_conclusao ? ` · enviado em ${dataHora(eo.enviado_em || eo.data_conclusao)}` : ''}</span>
        </div>
        <StatusEnsaio status={eo.status} />
        {podeImprimir && ficha.indice && (
          <button type="button" className={`${ui.btn} ${ui.btnSecundario}`} onClick={() => setImprimindo(true)}>🖨 Imprimir</button>
        )}
      </header>

      <div className={styles.corpo}>
        <div className={styles.principal}>
          {eo.devolvido_motivo && eo.status !== 'aprovado' && (
            <div className={`${ui.aviso} ${ui.avisoAlerta}`}>
              ↩ Devolvido anteriormente{eo.devolvido_em ? ` em ${dataHora(eo.devolvido_em)}` : ''}: {eo.devolvido_motivo}
            </div>
          )}
          {erroModelo && <div className={`${ui.aviso} ${ui.avisoAlerta}`}>{erroModelo}</div>}
          {aviso && <div className={`${ui.aviso} ${ui.avisoErro}`} role="status">{aviso}</div>}
          {!modeloReg && !erroModelo && <div className={styles.carregando}><div className="spinner" /></div>}
          {modeloReg && ficha.indice && (
            <FichaEnsaio
              indice={ficha.indice}
              motor={ficha.motor}
              estado={estado}
              onEstado={alterar}
              modo={modo}
              assinaturas={assinaturas}
              podeAssinar={{ calculista: podeAprovar && !!eu?.assinatura_url }}
              motivoSemAssinatura={podeAprovar && !eu?.assinatura_url
                ? 'Você ainda não tem assinatura cadastrada. Peça ao Gestor para cadastrar.'
                : undefined}
              usuarioNome={eu?.nome}
              onAssinar={quem => { if (quem === 'calculista') setAssinaturaCalc({ nome: eu?.nome, em: new Date().toISOString() }) }}
              onRemoverAssinatura={quem => { if (quem === 'calculista') setAssinaturaCalc(null) }}
              idBase={`rev-${eo.id.slice(0, 8)}`}
            />
          )}
        </div>

        <aside className={styles.lateral}>
          <section className={styles.cartao}>
            <h3>Execução</h3>
            <dl className={styles.kv}>
              <dt>Executor</dt><dd>{assistente?.nome || '—'}</dd>
              <dt>Assinada em</dt><dd>{eo.assinatura_executor?.em ? dataHora(eo.assinatura_executor.em) : '—'}</dd>
              <dt>Campos</dt><dd>{ficha.situacao ? `${ficha.situacao.preenchidos} de ${ficha.situacao.total}` : '—'}</dd>
            </dl>
          </section>

          {podeAprovar ? (
            <section className={styles.cartao}>
              <h3>Aprovação</h3>
              <label className={styles.campo} htmlFor={`conf-${eo.id}`}>
                <span>Conformidade</span>
                <select id={`conf-${eo.id}`} value={conformidade} onChange={e => setConformidade(e.target.value)}>
                  <option value="">Selecione…</option>
                  {CONFORMIDADES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className={styles.campo} htmlFor={`obs-${eo.id}`}>
                <span>Observações (opcional)</span>
                <textarea id={`obs-${eo.id}`} rows={3} value={observacoes} onChange={e => setObservacoes(e.target.value)} />
              </label>
              <label className={styles.liberar}>
                <input type="checkbox" checked={liberar} onChange={e => setLiberar(e.target.checked)} />
                <span>Liberar este resultado para o campo ao aprovar</span>
              </label>
              <p className={styles.ajuda}>
                Para aprovar: confira a ficha, preencha os parâmetros (em amarelo), assine em
                “Responsável calculista” e clique em Aprovar.
              </p>
            </section>
          ) : (
            eo.status === 'aprovado' && (
              <section className={styles.cartao}>
                <h3>Aprovação</h3>
                <dl className={styles.kv}>
                  <dt>Aprovado por</dt><dd>{aprovador?.nome || eo.assinatura_calculista?.nome || '—'}</dd>
                  <dt>Em</dt><dd>{dataHora(eo.aprovado_em)}</dd>
                  <dt>Campo</dt><dd>{eo.visivel_campo ? 'Liberado' : 'Não liberado'}</dd>
                </dl>
              </section>
            )
          )}
        </aside>
      </div>

      {(podeAprovar || podeDevolver) && (
        <footer className={styles.rodape}>
          <span className={styles.situacao}>
            {alterado ? 'Correções não salvas' : ''}
            {podeAprovar && (assinaturaCalc ? ' ✍️ Assinada' : ' Sem assinatura do calculista')}
          </span>
          <div className={styles.botoes}>
            {podeDevolver && (
              <button type="button" className={`${ui.btn} ${ui.btnPerigo}`} onClick={onDevolver} disabled={ocupado}>
                ↩ Devolver ao assistente
              </button>
            )}
            {podeAprovar && (
              <button type="button" className={`${ui.btn} ${ui.btnSecundario}`} onClick={salvar} disabled={ocupado || !alterado}>
                Salvar correções
              </button>
            )}
            {podeAprovar && (
              <button type="button" className={`${ui.btn} ${ui.btnAcao}`} onClick={aprovar} disabled={ocupado || !ficha.indice}>
                ✓ Aprovar
              </button>
            )}
          </div>
        </footer>
      )}

      {imprimindo && ficha.indice && (
        <ImpressaoFicha
          indice={ficha.indice}
          motor={ficha.motor}
          estado={estado}
          assinaturas={assinaturas}
          titulo={`${titulo} · ${numeroOS(pedido) || numeroPE(pedido)}`}
          onFechar={() => setImprimindo(false)}
        />
      )}
    </div>,
    document.body,
  )
}
