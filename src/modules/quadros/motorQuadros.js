// ─────────────────────────────────────────────────────────────────────────────
// Motor dos quadros de controle (funções puras — testadas em tools/fichas/quadros/testar_quadros.mjs)
//
//   linhasDoMaterial(def, dados)            → amostras com ensaios aprovados (todas as datas)
//   montarQuadro(def, dados, filtros)       → { linhas, entradas, n, opcoes, avisos }
//   expandirModelo(modelo, meta, n)         → modelo de layout com n blocos de amostra
//
// dados = { pedidos, ensaios: [{ pedido_id, dados_resultado, resultados: { tabela: [linhas] } }],
//           empresasPorId, obraPorFichaOs }
// filtros = { inicio, fim ('AAAA-MM-DD'), empresaId, lote, procedencia, tipo, fck, obra }
// "Média do período" = amostras do filtro; "Análise global" = todas as amostras desde o início com os
// mesmos filtros, sem o período (decisão de 28/09). Só entram ensaios aprovados.
// ─────────────────────────────────────────────────────────────────────────────
import { numero, media, valoresFicha, valoresTabela } from './definicoes.js'

const EPOCA = Date.UTC(1899, 11, 30)
const TAM_MIN = { linhas: 5, series: 5 }       // linhas vazias mínimas no quadro impresso

// ── datas ────────────────────────────────────────────────────────────────────
export function isoParaSerial(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  if (!m) return null
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - EPOCA) / 864e5)
}
export function serialParaIso(s) {
  if (typeof s !== 'number') return null
  return new Date(EPOCA + Math.round(s) * 864e5).toISOString().slice(0, 10)
}
function dataLocal(ts) {
  if (!ts) return null
  const d = new Date(ts)
  if (Number.isNaN(+d)) return null
  // dia em Cuiabá (UTC−4)
  return new Date(d.getTime() - 4 * 3600e3).toISOString().slice(0, 10)
}

function amostraDe(p) {
  const d = p?.dados_amostra
  if (Array.isArray(d)) return d[0] || {}
  if (d && Array.isArray(d.amostras)) return d.amostras[0] || {}
  if (d && d.cabecario) return d.cabecario
  return d && typeof d === 'object' ? d : {}
}

const texto = v => (v === null || v === undefined ? '' : String(v).trim())

// ── estatística ──────────────────────────────────────────────────────────────
export function desvio(nums) {
  const v = nums.filter(x => typeof x === 'number' && Number.isFinite(x))
  if (v.length < 2) return null
  const m = v.reduce((s, x) => s + x, 0) / v.length
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1))    // amostral (STDEV do Excel)
}
const FN = {
  media: v => media(v),
  max: v => (v.length ? Math.max(...v) : null),
  min: v => (v.length ? Math.min(...v) : null),
  desvio: v => desvio(v),
}

// ── amostras (linhas) ────────────────────────────────────────────────────────
/** Uma linha por pedido do material do quadro com pelo menos um ensaio aprovado. */
export function linhasDoMaterial(def, dados) {
  const porPedido = new Map()
  for (const e of dados.ensaios || []) {
    if (!porPedido.has(e.pedido_id)) porPedido.set(e.pedido_id, [])
    porPedido.get(e.pedido_id).push({ dados: e.dados_resultado || {}, resultados: e.resultados || {} })
  }
  const out = []
  for (const p of dados.pedidos || []) {
    if (p.material !== def.material || p.sub_tipo !== def.subTipo) continue
    const ensaios = porPedido.get(p.id)
    if (!ensaios?.length) continue
    const amostra = amostraDe(p)
    let iso = null
    for (const c of def.camposData || []) if (!iso && /^\d{4}-\d{2}-\d{2}/.test(texto(amostra[c]))) iso = texto(amostra[c]).slice(0, 10)
    iso = iso || dataLocal(p.created_at)
    const empresa = dados.empresasPorId?.[p.empresa_id]
    const n = parseInt(p.numero_pe ?? p.sequencial, 10)
    out.push({
      pedido: p, amostra, ensaios,
      data: iso, dataSerial: isoParaSerial(iso),
      numero: Number.isFinite(n) ? n : null,
      registro: Number.isFinite(n) ? `${String(n).padStart(3, '0')}/${p.ano ?? (iso || '').slice(0, 4)}` : '',
      empresaId: p.empresa_id || null,
      empresaNome: empresa?.nome || p.empresa || '',
      lote: texto(p.lote || empresa?.lote),
      tipo: texto(amostra[def.campoTipo]),
      obra: texto(dados.obraPorFichaOs?.[p.ficha_os_id]),
    })
  }
  return out
}

const procedenciaDe = (def, l) => texto(def.procedencia ? def.procedencia(l) : l.empresaNome)

/** Valores das colunas de uma amostra: { E: 98.4, …, T: 'Pedreira X' } */
export function valoresDaLinha(def, l) {
  const v = {}
  const depois = []
  for (const [col, f] of Object.entries(def.colunas)) {
    let x = null
    if (typeof f === 'function') x = f(l)
    else if (f.tipo === 'ficha') { const m = media(valoresFicha(l, f.codigos, f.celulas)); x = m === null ? null : m * f.fator }
    else if (f.tipo === 'tabela') { const m = media(valoresTabela(l, f.tabelas, f.campo, f.filtro)); x = m === null ? null : m * f.fator }
    else if (f.tipo === 'funcao') { if (f.depois) { depois.push([col, f]); continue } x = f.fn(l, v) }
    if (x !== null && x !== undefined && x !== '') v[col] = x
  }
  for (const [col, f] of depois) {
    const x = f.fn(l, v)
    if (x !== null && x !== undefined && x !== '') v[col] = x
  }
  return v
}

const COLS_ID = new Set(['A', 'B', 'C', 'D'])     // identificação (mês, amostra, data) — não contam como resultado

function passaFiltros(l, f, { comPeriodo }) {
  if (f.empresaId && l.empresaId !== f.empresaId) return false
  if (f.lote && l.lote !== f.lote) return false
  if (f.tipo && l.tipo !== f.tipo) return false
  if (f.procedencia && l.procedencia !== f.procedencia) return false
  if (f.obra && l.obra !== f.obra) return false
  if (comPeriodo) {
    if (f.inicio && (!l.data || l.data < f.inicio)) return false
    if (f.fim && (!l.data || l.data > f.fim)) return false
  }
  return true
}

function opcoesDe(linhas, chave) {
  return [...new Set(linhas.map(l => l[chave]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }))
}

// ── quadro ───────────────────────────────────────────────────────────────────
/**
 * @returns {{ linhas, entradas, n, opcoes, avisos, total }}
 *   entradas: valores por endereço do modelo EXPANDIDO para n blocos (estado.entradas da ficha)
 */
export function montarQuadro(def, dados, filtros, meta) {
  if (def.concreto) return montarConcreto(def, dados, filtros, meta)
  const todas = linhasDoMaterial(def, dados)
  for (const l of todas) {
    l.valores = valoresDaLinha(def, l)
    l.procedencia = procedenciaDe(def, l)
  }
  // só amostras com algum resultado nas colunas do quadro
  const comResultado = todas.filter(l => Object.keys(l.valores).some(c => !COLS_ID.has(c) && typeof l.valores[c] === 'number'))
  const global = comResultado.filter(l => passaFiltros(l, filtros, { comPeriodo: false }))
  const periodo = global.filter(l => passaFiltros(l, filtros, { comPeriodo: true }))
    .sort((a, b) => (a.data || '').localeCompare(b.data || '') || (a.numero ?? 0) - (b.numero ?? 0))

  const n = Math.max(periodo.length, TAM_MIN.linhas)
  const { linha: L0, altura: H } = meta.bloco
  const entradas = {}
  periodo.forEach((l, i) => {
    for (const [col, v] of Object.entries(l.valores)) entradas[`${col}${L0 + i * H}`] = v
  })
  for (const [a, e] of Object.entries(meta.estatisticas || {})) {
    const conj = e.escopo === 'periodo' ? periodo : global
    const nums = conj.map(l => l.valores[e.col]).filter(x => typeof x === 'number')
    const v = FN[e.fn](nums)
    if (v !== null) entradas[deslocar(a, meta, n)] = v
  }
  return {
    linhas: periodo, total: global.length, entradas, n,
    opcoes: {
      empresas: opcoesDe(todas.filter(l => l.empresaId), 'empresaId'),
      lotes: opcoesDe(todas, 'lote'), tipos: opcoesDe(todas, 'tipo'), procedencias: opcoesDe(todas, 'procedencia'),
    },
    avisos: [],
  }
}

/** Endereço de uma célula fora do bloco, depois de expandir o modelo para n blocos. */
export function deslocar(a, meta, n) {
  const m = /^([A-Z]+)(\d+)$/.exec(a)
  const r = +m[2]
  const { linha, altura } = meta.bloco
  return r >= linha + altura ? `${m[1]}${r + (n - 1) * altura}` : a
}

/** Repete o bloco modelo (linhas `linha`…`linha+altura−1`) até ter n blocos; o que vem abaixo desce. */
export function expandirModelo(modelo, meta, n) {
  const { linha, altura } = meta.bloco
  const r1 = modelo.origem.r1
  const extra = Math.max(0, n - 1) * altura
  if (!extra) return modelo
  const cells = {}
  for (const [a, d] of Object.entries(modelo.cells)) {
    const m = /^([A-Z]+)(\d+)$/.exec(a)
    const r = +m[2]
    if (r >= linha + altura) cells[`${m[1]}${r + extra}`] = d
    else if (r >= linha) {
      for (let k = 0; k < n; k++) cells[`${m[1]}${r + k * altura}`] = d
    } else {
      const rs = d.rs || 1
      cells[a] = r + rs - 1 >= linha ? { ...d, rs: rs + extra } : d     // mescla que atravessa o bloco cresce junto
    }
  }
  const alturasBloco = modelo.rows.slice(linha - r1, linha - r1 + altura)
  const rows = [...modelo.rows.slice(0, linha - r1 + altura)]
  for (let k = 1; k < n; k++) rows.push(...alturasBloco)
  rows.push(...modelo.rows.slice(linha - r1 + altura))
  const topoAbaixo = modelo.rows.slice(0, linha - r1 + altura).reduce((s, h) => s + h, 0)
  const pxExtra = alturasBloco.reduce((s, h) => s + h, 0) * (n - 1)
  const mover = o => (o.y >= topoAbaixo ? { ...o, y: o.y + pxExtra } : o)
  return { ...modelo, cells, rows, imgs: (modelo.imgs || []).map(mover), graficos: (modelo.graficos || []).map(mover) }
}

// ── FR-IMOB-43: concreto (ACI 214 / ACI 318, regras transcritas da planilha) ───────────────────
// λ e K por nº de amostras (tabela AK26:AM35 da planilha); n < 6 → critério "fck + 3 / fck − 1";
// n > 15 → λ 1,48 e K 3 (como a planilha).
const TABELA_LK = { 6: [1.87, 3], 7: [1.77, 3], 8: [1.72, 3], 9: [1.67, 3], 10: [1.62, 4], 11: [1.58, 4], 12: [1.55, 4], 13: [1.52, 4], 14: [1.5, 4], 15: [1.48, 4] }
export function lambdaK(n) {
  if (n < 6) return { lambda: 'N<6', K: 1 }
  if (n > 15) return { lambda: 1.48, K: 3 }
  const [lambda, K] = TABELA_LK[n]
  return { lambda, K }
}
function padraoProducao(n, Xn, Sn, Vn) {
  if (n < 30) return 'n < 30 AMOSTRAS'
  if (Xn <= 34.5) return Sn < 2.8 ? 'EXCELENTE' : Sn < 3.4 ? 'MUITO BOM' : Sn < 4.1 ? 'BOM' : Sn < 4.8 ? 'RAZOÁVEL' : 'DEFICIENTE'
  return Vn < 7 ? 'EXCELENTE' : Vn < 9 ? 'MUITO BOM' : Vn < 11 ? 'BOM' : Vn < 14 ? 'RAZOÁVEL' : 'DEFICIENTE'
}
function padraoLaboratorio(n, V1) {
  if (n < 30) return 'n < 30 AMOSTRAS'
  if (V1 === null) return '/28'
  return V1 < 3 ? 'EXCELENTE' : V1 < 4 ? 'MUITO BOM' : V1 < 5 ? 'BOM' : V1 < 6 ? 'RAZOÁVEL' : 'DEFICIENTE'
}
const fmt1 = x => (Math.round(x * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const fmtN = x => x.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

const LINHAS_FR50 = Array.from({ length: 16 }, (_, i) => 20 + 2 * i)     // moldagens da FR-50 (linhas 20, 22, …, 50)

/** Séries (moldagens) das FR-50 aprovadas das amostras. */
export function seriesDoConcreto(l) {
  const out = []
  for (const e of l.ensaios) {
    const d = e.dados
    if (d?.codigo !== 'FR-IMOB-50') continue
    const val = a => d.calculados?.[a] ?? d.entradas?.[a]
    const fckFicha = numero(val('B17'))
    LINHAS_FR50.forEach((r, k) => {
      const data = numero(val(`B${r}`))
      const cps = [`N${r}`, `N${r + 1}`, `P${r}`, `P${r + 1}`].map(a => numero(val(a)))
      if (data === null && cps.every(x => x === null)) return
      out.push({
        dataSerial: data, k: k + 1,
        hora: numero(val(`I${r}`)),
        slumpCm: numero(val(`E${r}`)) !== null ? numero(val(`E${r}`)) / 10 : null,
        peca: texto(val(`S${r}`)),
        lancamento: texto(d.escolhas?.[`lancamento_${k + 1}`]),
        r7: [cps[0], cps[1]], r28: [cps[2], cps[3]],
        fck: fckFicha,
      })
    })
  }
  return out
}

export function montarConcreto(def, dados, filtros, meta) {
  const amostras = linhasDoMaterial(def, dados)
  for (const l of amostras) {
    l.procedencia = procedenciaDe(def, l)
    l.series = seriesDoConcreto(l)
    l.fck = numero(l.amostra.resistencia_fck) ?? l.series.find(s => s.fck !== null)?.fck ?? null
  }
  const comSeries = amostras.filter(l => l.series.length)
  const doGrupo = comSeries.filter(l => passaFiltros(l, filtros, { comPeriodo: false }) && (!filtros.fck || l.fck === +filtros.fck))
  // séries do período (data da moldagem; sem data, vale a data da amostra)
  const series = []
  for (const l of doGrupo) {
    for (const s of l.series) {
      const iso = serialParaIso(s.dataSerial) || l.data
      if (filtros.inicio && (!iso || iso < filtros.inicio)) continue
      if (filtros.fim && (!iso || iso > filtros.fim)) continue
      series.push({ ...s, iso, l })
    }
  }
  series.sort((a, b) => (a.iso || '').localeCompare(b.iso || '') || (a.l.numero ?? 0) - (b.l.numero ?? 0) || a.k - b.k)

  const avisos = []
  const fcks = [...new Set(series.map(s => s.l.fck).filter(x => x !== null))]
  const tiposSel = [...new Set(series.map(s => s.l.tipo).filter(Boolean))]
  if (fcks.length > 1) avisos.push(`As séries têm fck diferentes (${fcks.join(', ')} MPa): escolha um fck — a estatística vale para um traço/fck.`)
  if (tiposSel.length > 1) avisos.push('As séries têm traços diferentes: escolha o traço para a estatística valer.')
  const fck = filtros.fck ? +filtros.fck : fcks.length === 1 ? fcks[0] : null

  // valores por série
  const avg = arr => media(arr.filter(x => x !== null))
  const dados43 = series.map(s => {
    const M = null   // 3 dias: a FR-50 não tem
    const O = avg(s.r7)
    const Q = avg(s.r28)
    const R = s.r28[0] !== null && s.r28[1] !== null ? Math.abs(s.r28[0] - s.r28[1]) : null
    return { s, M, O, Q, R }
  })
  const Qs = dados43.map(x => x.Q).filter(x => x !== null)
  const n = Qs.length
  const { lambda, K } = lambdaK(n)
  dados43.forEach((x, i) => {
    if (x.Q !== null && fck !== null) {
      const ult = dados43.slice(Math.max(0, i - 2), i + 1).map(y => y.Q).filter(y => y !== null)
      const mm = media(ult)
      x.S = `${fmt1(mm)} ${mm >= fck ? '≥' : '<'} ${fmtN(fck)} ${mm >= fck ? 'OK' : 'NC'}`
      x.T = `${fmt1(x.Q)} ${x.Q >= fck - K ? '≥' : '<'} ${fmtN(fck - K)} ${x.Q >= fck - K ? 'OK' : 'NC'}`
    }
  })

  const nSeries = Math.max(series.length, TAM_MIN.series)
  const { linha: L0, altura: H } = meta.bloco
  const e = {}          // cabeçalho (acima do bloco)
  const blocos = {}     // séries (já no endereço final)
  dados43.forEach((x, i) => {
    const r = L0 + i * H
    const s = x.s
    const put = (a, v) => { if (v !== null && v !== undefined && v !== '') blocos[a] = v }
    put(`A${r}`, i + 1)
    put(`B${r}`, s.dataSerial ?? isoParaSerial(s.iso))
    put(`C${r}`, s.l.numero !== null ? `${s.l.numero}-${s.k}` : `M${s.k}`)      // nº da amostra - nº da moldagem na FR-50
    put(`D${r}`, s.hora)
    put(`G${r}`, s.peca || texto(s.l.amostra.estrutura))
    put(`G${r + 1}`, texto(s.l.amostra.local))
    put(`I${r}`, s.slumpCm)
    put(`N${r}`, s.r7[0]); put(`N${r + 1}`, s.r7[1]); put(`O${r}`, x.O)
    put(`P${r}`, s.r28[0]); put(`P${r + 1}`, s.r28[1]); put(`Q${r}`, x.Q)
    put(`R${r}`, x.R); put(`S${r}`, x.S); put(`T${r}`, x.T)
  })

  // estatística do cabeçalho (acima do bloco: endereços não mudam)
  const est = (nums, a) => {
    const v = nums.filter(y => y !== null)
    if (!v.length) return
    const m = media(v), sd = desvio(v)
    e[`${a}11`] = v.length; e[`${a}12`] = m
    if (sd !== null) { e[`${a}13`] = sd; e[`${a}14`] = sd / m * 100 }
  }
  est(series.map(s => s.slumpCm), 'I')
  est(dados43.map(x => x.O), 'N')
  est(dados43.map(x => x.Q), 'P')
  const Xn = media(Qs), Sn = desvio(Qs)
  const Rs = dados43.map(x => x.R).filter(y => y !== null)
  const V1 = Xn !== null && Rs.length ? 0.8865 * media(Rs) / Xn * 100 : null
  if (V1 !== null) e.P15 = V1
  e.C15 = series.length
  e.X13 = '/28'
  if (fck !== null) e.W13 = fck
  if (n) {
    e.S11 = typeof lambda === 'number' ? fmtN(lambda) : lambda
    e.S12 = K
    e.S13 = Xn
    const Xmin = Math.min(...Qs)
    e.S14 = Xmin
    const fckest = n < 6 ? Xn - 3 : Sn !== null ? Xn - lambda * Sn : null
    if (fckest !== null) e.T13 = fckest
    e.E12 = padraoProducao(n, Xn, Sn ?? 0, Sn !== null ? Sn / Xn * 100 : 0)
    e.E13 = padraoLaboratorio(n, V1)
    // Critério escrito na planilha (AC28/AC31): Xn ≥ fck + λ·Sn (n ≥ 6) ou Xn ≥ fck + 3 (n < 6), e Xmín ≥ fck − K.
    // (A fórmula AE19 da planilha comparava Xmín com Xmín − K — ver Observações para a Qualidade.)
    e.E14 = fck === null || fckest === null ? '-' : (fckest >= fck && Xmin >= fck - K ? 'CONFORME' : 'NÃO CONFORME')
  } else {
    e.E12 = 'n < 30 AMOSTRAS'; e.E13 = 'n < 30 AMOSTRAS'; e.E14 = '-'
  }
  // traço e lançamento (as séries do quadro são de um traço quando o filtro é usado)
  const trTipo = filtros.tipo || (tiposSel.length === 1 ? tiposSel[0] : '')
  if (trTipo) e.C9 = trTipo     // o fck vai em W13
  const lanc = [...new Set(series.map(s => s.lancamento || texto(s.l.amostra.lancamento)).filter(Boolean))]
  if (lanc.length) e.G9 = lanc.join(' / ')

  const entradas = { ...blocos }
  for (const [a, v] of Object.entries(e)) entradas[deslocar(a, meta, nSeries)] = v
  return {
    linhas: series, total: doGrupo.reduce((s, l) => s + l.series.length, 0), entradas, n: nSeries, avisos,
    opcoes: {
      empresas: opcoesDe(comSeries.filter(l => l.empresaId), 'empresaId'),
      lotes: opcoesDe(comSeries, 'lote'), tipos: opcoesDe(comSeries, 'tipo'), obras: opcoesDe(comSeries, 'obra'),
      fcks: [...new Set(comSeries.map(l => l.fck).filter(x => x !== null))].sort((a, b) => a - b),
    },
  }
}
