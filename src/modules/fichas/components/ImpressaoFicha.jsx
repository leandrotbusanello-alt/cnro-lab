import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import FichaGrade from './FichaGrade'
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

/**
 * Pré-visualização A4 e impressão/PDF da ficha, na escala da planilha
 * ("ajustar à página" do Excel). Fichas com frente e verso saem com uma página por aba.
 * Só para quem tem permissão de imprimir.
 */
export default function ImpressaoFicha({ indice, motor, estado, assinaturas, titulo, onFechar }) {
  const folhas = indice.folhas || [indice]
  const paginas = folhas.flatMap(f => {
    const p = paginaDa(f)
    return p.trechos.map(([y0, y1], i) => ({ folha: f, ...p, y0, y1, chave: `${f.id || 'principal'}-${i}` }))
  })
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
        {paginas.map(p => (
          <div key={p.chave} className={s.folhaA4} style={{ width: p.PW, height: p.PH }}>
            <div style={p.trechos.length > 1
              ? { position: 'absolute', left: p.esquerda, top: p.topo, height: (p.y1 - p.y0) * p.escala, overflow: 'hidden' }
              : { position: 'absolute', left: p.esquerda, top: p.topo }}
            >
              <div style={p.y0 ? { marginTop: -p.y0 * p.escala } : undefined}>
                <FichaGrade indice={indice} folha={p.folha} motor={motor} estado={estado} assinaturas={assinaturas} modo="leitura" escala={p.escala} soImpressao />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  )
}
