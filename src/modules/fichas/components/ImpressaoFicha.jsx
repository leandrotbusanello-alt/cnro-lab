import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import FichaGrade from './FichaGrade'
import { linhasOcultas } from '../motor/ficha.js'
import { qtdFolhas, estadoDaFolha } from '../motor/folhas.js'
import s from './Ficha.module.css'

const MM_PX = 96 / 25.4

/**
 * Com "altura automática" no Excel (ajuste 0), a folha que passa só um pouco da página é reduzida para
 * caber numa página (a ficha física é uma página por aba). Acima deste limite (folha mais alta que
 * 1,25 página na escala da largura), ela é impressa em várias páginas, como faz o Excel (FR-IMOB-37).
 */
const LIMITE_REDUZIR = 1.25

/** Posição, escala e páginas de uma folha na folha A4 ("ajustar à página" do Excel). */
export function paginaDa(folha) {
  const pag = folha.modelo.pagina || {}
  const paisagem = pag.orient === 'landscape'
  const PW = (paisagem ? 297 : 210) * MM_PX
  const PH = (paisagem ? 210 : 297) * MM_PX
  const [mt, mr, mb, ml] = (pag.margens || [0.75, 0.7, 0.75, 0.7]).map(pol => pol * 96)
  const [aw, ah] = pag.ajuste || [1, 1]
  const util = PH - mt - mb
  let escala = 1
  if (aw) escala = Math.min(escala, (PW - ml - mr) / folha.larguraImpressao)
  let trechos = [[0, folha.altura]]
  if (pag.quebras?.length) {
    // quebras fixas (última linha de cada página, contada a partir da 1ª linha da folha): todas as páginas na mesma escala
    trechos = trechosDasQuebras(folha, pag.quebras)
    escala = Math.min(escala, util / Math.max(...trechos.map(([a, b]) => b - a)))
  } else if (!ah && folha.altura * escala > util * LIMITE_REDUZIR) trechos = cortarEmPaginas(folha, util / escala)
  else if (ah || folha.altura * escala > util) escala = Math.min(escala, util / folha.altura)
  const esquerda = pag.centralizar ? ml + ((PW - ml - mr) - folha.larguraImpressao * escala) / 2 : ml
  return { paisagem, PW, PH, escala, esquerda, topo: mt, trechos }
}

/** Trechos (px da folha) cortados depois das linhas de `quebras` (1 = 1ª linha da folha). */
function trechosDasQuebras(folha, quebras) {
  const rows = folha.modelo.rows
  const topos = [0]
  for (const h of rows) topos.push(topos[topos.length - 1] + h)
  const cortes = [...new Set(quebras.filter(q => q > 0 && q < rows.length))].sort((a, b) => a - b)
  const trechos = []
  let ini = 0
  for (const q of [...cortes, rows.length]) { trechos.push([topos[ini], topos[q]]); ini = q }
  return trechos
}

/**
 * Cortes de página entre linhas (px da folha): cada página leva as linhas que cabem em `alturaMax`.
 * O corte não cai no meio de uma mescla vertical (sobe para o início dela), a não ser que a mescla
 * sozinha não caiba numa página (aí ela é cortada, como no Excel).
 */
function cortarEmPaginas(folha, alturaMax) {
  const rows = folha.modelo.rows
  const topos = [0]
  for (const h of rows) topos.push(topos[topos.length - 1] + h)
  // presa[i] = a divisa antes da linha i (0-based) atravessa uma mescla vertical
  const presa = new Array(rows.length + 1).fill(false)
  for (const [a, d] of Object.entries(folha.modelo.cells)) {
    if (!(d.rs > 1)) continue
    const i = +/\d+/.exec(a)[0] - folha.r1
    // mescla mais alta que a página (p.ex. coluna de margem M14:M119 da FR-IMOB-37) não segura o corte
    if (topos[Math.min(i + d.rs, rows.length)] - topos[i] > alturaMax) continue
    for (let k = i + 1; k < i + d.rs && k < presa.length; k++) presa[k] = true
  }
  const trechos = []
  let ini = 0
  while (ini < rows.length) {
    let fim = ini + 1
    while (fim < rows.length && topos[fim + 1] - topos[ini] <= alturaMax) fim++
    if (fim < rows.length) {
      let k = fim
      while (k > ini + 1 && presa[k]) k--
      if (k > ini + 1 || !presa[k]) fim = k
    }
    trechos.push([topos[ini], topos[fim]])
    ini = fim
  }
  return trechos
}

/** Páginas de um conjunto (folha da ficha: motor + estado), sem as páginas ocultas pela opção escolhida. */
function paginasDoConjunto(indice, { k, motor, estado }) {
  const folhas = indice.folhas || [indice]
  // páginas que somem com a opção escolhida (FR-IMOB-55 "Simples": só a página 1)
  const ocultas = linhasOcultas(indice, estado)
  const paginaOculta = (f, y0, y1) => {
    const faixas = ocultas[f.prefixo || ''] || []
    if (!faixas.length) return false
    const topos = [0]
    for (const h of f.modelo.rows) topos.push(topos[topos.length - 1] + h)
    return faixas.some(([de, ate]) => topos[Math.max(0, de - f.r1)] <= y0 + 0.5 && topos[Math.min(topos.length - 1, ate - f.r1 + 1)] >= y1 - 0.5)
  }
  return folhas.flatMap(f => {
    const p = paginaDa(f)
    return p.trechos
      .map(([y0, y1], i) => ({ folha: f, ...p, y0, y1, motor, estado, chave: `${k}-${f.id || 'principal'}-${i}` }))
      .filter(pg => !paginaOculta(f, pg.y0, pg.y1))
  })
}

/**
 * Pré-visualização A4 e impressão/PDF da ficha, na escala da planilha
 * ("ajustar à página" do Excel). Fichas com frente e verso saem com uma página por aba.
 * Folhas adicionais da mesma ficha (motores + estado.extras — 20/10/2026) saem em sequência,
 * cada uma como a ficha é, com as mesmas assinaturas.
 * Só para quem tem permissão de imprimir.
 */
/** Páginas A4 de uma ficha (todas as folhas adicionais incluídas) */
export function paginasDaFicha({ indice, motor, motores, estado }) {
  const n = motores?.length ? qtdFolhas(estado) : 1
  const conjuntos = Array.from({ length: n }, (_, k) => ({
    k, motor: k ? motores[k] : (motores?.[0] || motor), estado: n > 1 ? estadoDaFolha(estado, k) : estado,
  }))
  return conjuntos.flatMap(c => paginasDoConjunto(indice, c))
}

/**
 * Uma página A4 da ficha. `nomeada`: usa as páginas nomeadas "retrato"/"paisagem" (impressão de
 * vários documentos juntos, cada um na sua orientação — Gerar arquivos da O.S.).
 */
export function PaginaA4({ p, indice, assinaturas, nomeada = false }) {
  return (
    <div className={s.folhaA4} style={{ width: p.PW, height: p.PH, ...(nomeada ? { page: p.paisagem ? 'paisagem' : 'retrato' } : {}) }}>
      <div style={p.trechos.length > 1
        ? { position: 'absolute', left: p.esquerda, top: p.topo, height: (p.y1 - p.y0) * p.escala, overflow: 'hidden' }
        : { position: 'absolute', left: p.esquerda, top: p.topo }}
      >
        <div style={p.y0 ? { marginTop: -p.y0 * p.escala } : undefined}>
          <FichaGrade indice={indice} folha={p.folha} motor={p.motor} estado={p.estado} assinaturas={assinaturas} modo="leitura" escala={p.escala} soImpressao manterLinhas />
        </div>
      </div>
    </div>
  )
}

export default function ImpressaoFicha({ indice, motor, motores, estado, assinaturas, titulo, onFechar }) {
  const paginas = paginasDaFicha({ indice, motor, motores, estado })
  const paisagem = paginas[0].paisagem

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onFechar])

  return createPortal(
    <div className={s.impressao}>
      <style>{`@page { size: A4 ${paisagem ? 'landscape' : 'portrait'}; margin: 0; }`}</style>
      <div className={s.impressaoBarra}>
        <strong>{titulo}</strong>
        <div className={s.impressaoAcoes}>
          <button type="button" className={`${s.popBtn} ${s.popPrimario}`} onClick={() => window.print()}>🖨 Imprimir / PDF</button>
          <button type="button" className={s.popBtn} onClick={onFechar}>Fechar</button>
        </div>
      </div>
      <div className={s.impressaoArea}>
        {paginas.map(p => <PaginaA4 key={p.chave} p={p} indice={indice} assinaturas={assinaturas} />)}
      </div>
    </div>,
    document.body,
  )
}
