// ─────────────────────────────────────────────────────────────────────────────
// Pré-preenchimento do corpo da ficha com os dados do pedido (FR-IMOB-50 Rev01 — 28/10/2026).
// Acontece uma vez, quando o ensaio é iniciado; só preenche células vazias e tudo continua editável.
// Configuração no modelo (spec "preenchimento"):
//   { tipo: 'concreto', fck, slump, tolerancia, tipo_cp,
//     moldagens: { linhas: [20, 22, …], colunas: { data, slump, cps, peca } } }
// Concreto: uma linha de moldagem por caminhão/romaneio (sem caminhão: por data de moldagem).
// ─────────────────────────────────────────────────────────────────────────────
import { normalizarAmostras } from '../laboratorio/utils'

const EPOCA = Date.UTC(1899, 11, 30)

/** 'AAAA-MM-DD' (ou 'DD/MM/AAAA') → número de série do Excel (como o motor guarda as datas). */
export function serialDaData(txt) {
  const s = String(txt || '').trim()
  let a, m, d
  let r = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (r) [, a, m, d] = r.map(Number)
  else if ((r = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) { d = +r[1]; m = +r[2]; a = +r[3] }
  else return null
  return Math.round((Date.UTC(a, m - 1, d) - EPOCA) / 864e5)
}

const num = v => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Dimensão do CP do pedido → opção da ficha (5×10 = argamassa; 10×20 = concreto). */
export function tipoCpDaDimensao(dim) {
  const d = String(dim || '').replace(/\s/g, '').toLowerCase()
  if (d === '5x10') return 'Argamassa 5x10'
  if (d === '10x20') return 'Concreto 10x20'
  return null
}

/** Moldagens do pedido de concreto: uma por caminhão (ordem do pedido). */
export function moldagensDoPedido(amostras) {
  const grupos = []
  const porChave = new Map()
  for (const a of amostras) {
    const cam = String(a.identificacao_caminhao || '').trim()
    const chave = cam ? `cam:${cam.toLowerCase()}` : `data:${a.data_moldagem || ''}`
    if (!porChave.has(chave)) { const g = { amostras: [] }; porChave.set(chave, g); grupos.push(g) }
    porChave.get(chave).amostras.push(a)
  }
  return grupos.map(g => {
    const p = g.amostras[0] || {}
    return {
      data: serialDaData(p.data_moldagem),
      slump: num(g.amostras.map(a => a.slump_obtido).find(v => num(v) !== null)),
      cps: g.amostras.length,
      peca: p.elemento || p.estrutura || null,
    }
  })
}

/** Entradas que o pedido preenche na ficha (só as que têm valor). */
export function entradasDoPedido(indice, pedido) {
  const cfg = indice?.preenchimento
  if (!cfg || !pedido) return {}
  const amostras = normalizarAmostras(pedido.dados_amostra)
  if (!amostras.length) return {}
  const a0 = amostras[0]
  const out = {}
  const por = (celula, v) => { if (celula && v !== null && v !== undefined && v !== '') out[celula] = v }
  if (cfg.tipo === 'concreto') {
    por(cfg.fck, num(a0.fck_projeto))
    por(cfg.slump, num(a0.slump_projeto))
    const tol = num(a0.slump_tolerancia)
    if (tol !== null) por(cfg.tolerancia, ` ± ${String(tol).replace('.', ',')}`)
    por(cfg.tipo_cp, tipoCpDaDimensao(a0.dimensoes_cp))
    const m = cfg.moldagens
    if (m) {
      moldagensDoPedido(amostras).slice(0, m.linhas.length).forEach((g, i) => {
        const r = m.linhas[i]
        por(m.colunas.data && `${m.colunas.data}${r}`, g.data)
        por(m.colunas.slump && `${m.colunas.slump}${r}`, g.slump)
        por(m.colunas.cps && `${m.colunas.cps}${r}`, g.cps)
        por(m.colunas.peca && `${m.colunas.peca}${r}`, g.peca)
      })
    }
  }
  return out
}

/** Estado com o pré-preenchimento aplicado nas células vazias (marca `preenchido_em` para não repetir). */
export function aplicarPreenchimento(indice, estado, pedido) {
  const novos = entradasDoPedido(indice, pedido)
  const entradas = { ...(estado?.entradas || {}) }
  for (const [a, v] of Object.entries(novos)) {
    const atual = entradas[a]
    if (atual === null || atual === undefined || atual === '') entradas[a] = v
  }
  return { ...estado, entradas, preenchido_em: new Date().toISOString() }
}
