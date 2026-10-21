import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { obterModelo } from '../../fichas/fichasRepo'
import { camposDoPedido } from '../../fichas/camposPedido'
import { estadoDosDados } from '../../fichas/motor/ficha.js'
import { useFicha } from '../../fichas/useFicha'
import FichaComFolhas from '../../fichas/components/FichaComFolhas'
import ImpressaoFicha from '../../fichas/components/ImpressaoFicha'
import ResultadoView from '../../laboratorio/components/ResultadoView'
import { urlAssinatura } from '../../laboratorio/labRepo'
import { dataHora } from '../../laboratorio/utils'
import { situacaoEnsaioCampo } from '../resultadosCampo'
import styles from './MeusPedidos.module.css'

/**
 * Ensaios de um pedido na visão do Campo (migração 32): status de cada um; os liberados
 * mostram o resumo (conformidade, aprovação, observação e os resultados) e a ficha completa.
 */
export default function EnsaiosDoPedido({ pedido, status, liberados, resultados, usuarios, empresasPorId }) {
  const [aberto, setAberto] = useState(null)       // id do ensaio com o resumo aberto
  const [ficha, setFicha] = useState(null)         // id do ensaio com a ficha aberta
  if (!status?.length) return null

  const parar = e => e.stopPropagation()
  return (
    <div className={styles.ensaios} onClick={parar} onKeyDown={parar} role="presentation">
      <div className={styles.ensaiosTitulo}>Ensaios</div>
      {status.map(s => {
        const sit = situacaoEnsaioCampo(s)
        const eo = liberados[s.id]
        const res = resultados[s.id]
        return (
          <div key={s.id} className={styles.ensaioLinha}>
            <div className={styles.ensaioTopo}>
              <span className={styles.ensaioNome}>{s.nome_ensaio}</span>
              <span className={`${styles.badge} ${styles[sit.cls]}`}>{sit.label}</span>
            </div>
            {s.liberado && eo && (
              <>
                <div className={styles.ensaioResumo}>
                  {res?.conformidade && <span className={classeConf(res.conformidade)}>{res.conformidade}</span>}
                  {s.aprovado_em && <span>Aprovado em {dataHora(s.aprovado_em)}</span>}
                </div>
                {res?.observacoes && <div className={styles.ensaioObs}>💬 {res.observacoes}</div>}
                <div className={styles.ensaioAcoes}>
                  <button type="button" className={styles.btnLink} onClick={() => setAberto(a => (a === s.id ? null : s.id))}>
                    {aberto === s.id ? '▾ Ocultar resultados' : '▸ Ver resultados'}
                  </button>
                  <button type="button" className={styles.btnFicha} onClick={() => setFicha(s.id)}>📄 Ver ficha</button>
                </div>
                {aberto === s.id && <ResumoResultados eo={eo} pedido={pedido} empresasPorId={empresasPorId} />}
              </>
            )}
          </div>
        )
      })}
      {ficha && liberados[ficha] && (
        <FichaCampo
          eo={liberados[ficha]} pedido={pedido} usuarios={usuarios} empresasPorId={empresasPorId}
          onFechar={() => setFicha(null)}
        />
      )}
    </div>
  )
}

function classeConf(c) {
  const v = String(c).toLowerCase()
  if (v.startsWith('não') || v.startsWith('nao')) return styles.confNao
  if (v.startsWith('parcial')) return styles.confParcial
  if (v.startsWith('conforme')) return styles.confSim
  return styles.confOutro
}

/** Modelo da ficha + cálculo (todas as folhas) de um ensaio liberado */
function useFichaDoEnsaio(eo, pedido, empresasPorId) {
  const [modeloReg, setModeloReg] = useState(null)
  const [erro, setErro] = useState(null)
  const modeloId = eo.ficha_modelo_id || eo.dados_resultado?.modelo_id || null
  useEffect(() => {
    let ativo = true
    if (!modeloId) { setErro('Este ensaio não tem ficha online.'); return undefined }
    obterModelo(modeloId)
      .then(m => { if (ativo) { setModeloReg(m); if (!m) setErro('A ficha não pôde ser baixada. Verifique a internet.') } })
      .catch(e => { if (ativo) setErro(e.message) })
    return () => { ativo = false }
  }, [modeloId])
  const estado = useMemo(() => estadoDosDados(eo.dados_resultado), [eo.dados_resultado])
  const pedidoCampos = useMemo(() => camposDoPedido(pedido, { empresasPorId }), [pedido, empresasPorId])
  const ficha = useFicha(modeloReg, estado, pedidoCampos)
  return { modeloReg, erro, estado, ficha }
}

function ResumoResultados({ eo, pedido, empresasPorId }) {
  const { modeloReg, erro, ficha } = useFichaDoEnsaio(eo, pedido, empresasPorId)
  if (erro) return <p className={styles.ensaioAviso}>{erro}</p>
  if (!modeloReg || !ficha.indice) return <div className={styles.spinnerPeq} />
  // números com até 3 casas (o cálculo guarda a precisão toda)
  const arred = v => (typeof v === 'number' && !Number.isInteger(v) ? Number(v.toFixed(3)) : v)
  const linhas = ficha.resultados().filter(t => t.linhas.length)
    .map(t => ({ ...t, linhas: t.linhas.map(l => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, arred(v)]))) }))
  if (!linhas.length) return <p className={styles.ensaioAviso}>Os resultados deste ensaio estão na ficha — toque em “Ver ficha”.</p>
  return (
    <div className={styles.ensaioTabelas}>
      {linhas.map(t => <ResultadoView key={t.tabela} dados={t.linhas} />)}
    </div>
  )
}

/** Ficha completa (só leitura), com todas as folhas, assinaturas e impressão */
function FichaCampo({ eo, pedido, usuarios, empresasPorId, onFechar }) {
  const { modeloReg, erro, estado, ficha } = useFichaDoEnsaio(eo, pedido, empresasPorId)
  const [imprimindo, setImprimindo] = useState(false)
  const [urls, setUrls] = useState({})

  useEffect(() => {
    let ativo = true
    const pegar = (chave, id) => {
      const u = usuarios[id]
      if (u?.assinatura_url) urlAssinatura(u).then(url => { if (ativo && url) setUrls(x => ({ ...x, [chave]: url })) })
    }
    pegar('executor', eo.assinatura_executor?.usuario_id || eo.assistente_id)
    pegar('calculista', eo.assinatura_calculista?.usuario_id || eo.aprovado_por_id)
    return () => { ativo = false }
  }, [eo, usuarios])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !imprimindo) onFechar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onFechar, imprimindo])

  const assinaturas = {
    executor: eo.assinatura_executor ? { ...eo.assinatura_executor, url: urls.executor } : null,
    calculista: eo.assinatura_calculista ? { ...eo.assinatura_calculista, url: urls.calculista } : null,
  }
  const titulo = `${eo.nome_ensaio}${modeloReg ? ` · ${modeloReg.codigo} ${modeloReg.versao}` : ''}`

  return createPortal(
    <div className={styles.fichaTela} role="dialog" aria-modal="true" aria-label={`Ficha: ${eo.nome_ensaio}`}>
      <header className={styles.fichaTopo}>
        <button type="button" className={styles.btnVoltar} onClick={onFechar}>← Voltar</button>
        <div className={styles.fichaTitulos}>
          <strong>{titulo}</strong>
          <span>O.S. {pedido.numero_os}</span>
        </div>
        {ficha.indice && <button type="button" className={styles.btnFicha} onClick={() => setImprimindo(true)}>🖨 Imprimir / PDF</button>}
      </header>
      <div className={styles.fichaCorpo}>
        {erro && <p className={styles.ensaioAviso}>{erro}</p>}
        {!erro && (!modeloReg || !ficha.indice) && <div className={styles.spinner} />}
        {modeloReg && ficha.indice && (
          <FichaComFolhas
            indice={ficha.indice}
            motores={ficha.motores}
            estado={estado}
            modo="leitura"
            assinaturas={assinaturas}
            idBase={`campo-${eo.id.slice(0, 8)}`}
          />
        )}
      </div>
      {imprimindo && ficha.indice && (
        <ImpressaoFicha
          indice={ficha.indice} motor={ficha.motor} motores={ficha.motores} estado={estado} assinaturas={assinaturas}
          titulo={`${titulo} · O.S. ${pedido.numero_os}`}
          onFechar={() => setImprimindo(false)}
        />
      )}
    </div>,
    document.body,
  )
}
