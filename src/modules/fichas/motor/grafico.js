// ─────────────────────────────────────────────────────────────────────────────
// Gráficos das fichas (dispersão XY do Excel: curvas granulométricas, viscosidade × temperatura…)
//
// O conversor lê o gráfico do .xlsx (tools/fichas/converter.py → ler_grafico) e grava em
// folha.graficos = [{ x, y, w, h (px na folha), fonte, fundo, borda, titulo, area, areaFundo, areaBorda,
//                     eixos: { x: {...}, y: {...} }, series: [{ nome, x:'C21:C29', y:'L21:L29', linha, marcador, suave }],
//                     legenda: { pos, ocultos, area, fonte }, vazios }]
// Aqui ficam só as contas (escalas, marcas dos eixos, pontos das séries); o desenho é o componente Grafico.jsx.
// ─────────────────────────────────────────────────────────────────────────────
import { colStr, ehErro, separarEndereco } from './formulas.js'

const PT = 96 / 72
export const pt = v => (v || 0) * PT

const limpo = v => +(+v).toPrecision(12)

/** 'C21:C29' → ['C21', 'C22', …] (linha a linha). */
export function expandirIntervalo(ref) {
  if (!ref) return []
  const [a, b = a] = ref.split(':')
  const p = separarEndereco(a), q = separarEndereco(b)
  const out = []
  for (let r = Math.min(p.r, q.r); r <= Math.max(p.r, q.r); r++) {
    for (let c = Math.min(p.c, q.c); c <= Math.max(p.c, q.c); c++) out.push(colStr(c) + r)
  }
  return out
}

function valor(motor, endereco) {
  const v = motor?.valores?.get(endereco)
  return v === undefined ? null : v
}

/** Nome da série: texto fixo ou o conteúdo das células (várias células → juntas com espaço). */
export function nomeDaSerie(serie, motor, cells, prefixo, i) {
  if (serie.nome?.txt) return serie.nome.txt
  if (serie.nome?.ref) {
    const partes = expandirIntervalo(serie.nome.ref).map(a => {
      const v = valor(motor, prefixo + a)
      if (v !== null && v !== '' && typeof v !== 'object') return String(v)
      const d = cells?.[prefixo + a]
      if (d?.rt) return d.rt.map(t => t.t).join('')
      if (d?.v !== undefined && d.v !== null) return String(d.v)
      return ''
    }).map(t => t.trim()).filter(Boolean)
    return partes.join(' ')   // células vazias: série sem nome (o Excel mostra só o traço na legenda)
  }
  return `Série${(serie.idx ?? i) + 1}`
}

/**
 * Pontos da série. Ponto vazio ou com texto interrompe a linha ('gap'); erro (#N/D) é pulado; com
 * vazios = 'zero', a célula vazia vale 0 (como no Excel). Em eixo log, valores ≤ 0 também interrompem.
 * Retorna trechos contínuos: [[{x,y}, …], …].
 */
export function pontosDaSerie(serie, motor, prefixo, { logX, logY, vazios } = {}) {
  const ys = expandirIntervalo(serie.y)
  const xs = serie.x ? expandirIntervalo(serie.x) : null
  const trechos = []
  let atual = []
  const quebrar = () => { if (atual.length) trechos.push(atual); atual = [] }
  ys.forEach((ay, i) => {
    let y = valor(motor, prefixo + ay)
    let x = xs ? valor(motor, prefixo + xs[i]) : i + 1
    if (y === null && vazios === 'zero') y = 0
    const ok = typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y) &&
      !(logX && x <= 0) && !(logY && y <= 0)
    if (ok) atual.push({ x, y })
    // como no Excel: erro (#N/D) só omite o ponto — a linha liga os vizinhos; vazio interrompe
    // (a não ser que o gráfico diga "ligar pontos": vazios = 'span')
    else if (ehErro(y) || ehErro(x) || (vazios === 'span' && (y === null || x === null))) return
    else quebrar()
  })
  quebrar()
  return trechos
}

function passoBonito(bruto) {
  if (!(bruto > 0)) return 1
  const e = Math.pow(10, Math.floor(Math.log10(bruto)))
  const f = bruto / e
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e
}

/**
 * Escala de um eixo: { min, max, log, marcas:[v], menores:[v], para(v) → 0..1 }.
 * ex: definição do eixo (min, max, log, unidade, unidadeMenor, inverso) · dados: valores das séries
 * · divisoes: nº aproximado de divisões quando a unidade é automática.
 */
export function escalaDoEixo(ex = {}, dados = [], divisoes = 8) {
  const base = ex.log || 0
  const validos = dados.filter(v => Number.isFinite(v) && (!base || v > 0))
  let min = ex.min !== undefined ? limpo(ex.min) : null
  let max = ex.max !== undefined ? limpo(ex.max) : null
  const marcas = [], menores = []

  if (base) {
    const lb = v => Math.log(v) / Math.log(base)
    let dMin = validos.length ? Math.min(...validos) : 1
    let dMax = validos.length ? Math.max(...validos) : base
    if (min === null || min <= 0) min = limpo(Math.pow(base, Math.floor(lb(max !== null ? Math.min(dMin, max) : dMin) + 1e-9)))
    if (max === null) max = limpo(Math.pow(base, Math.ceil(lb(Math.max(dMax, min)) - 1e-9)))
    if (max <= min) max = limpo(min * base)
    const passo = Math.pow(base, ex.unidade > 0 ? ex.unidade : 1)   // no log, a unidade é em potências da base
    for (let v = min, n = 0; v <= max * (1 + 1e-9) && n < 60; v = limpo(v * passo), n++) {
      marcas.push(v)
      for (let k = 2; k < base; k++) {
        const m = limpo(v * k)
        if (m < max * (1 - 1e-9) && m < v * passo * (1 - 1e-9)) menores.push(m)
      }
    }
    const l0 = lb(min), l1 = lb(max)
    const para = v => (lb(v) - l0) / (l1 - l0)
    return { min, max, log: base, marcas, menores, para: ex.inverso ? v => 1 - para(v) : para }
  }

  let dMin = validos.length ? Math.min(...validos) : 0
  let dMax = validos.length ? Math.max(...validos) : 1
  if (min !== null) dMin = Math.min(dMin, min)
  if (max !== null) dMax = Math.max(dMax, max)
  if (dMax === dMin) dMax = dMin + 1
  const passo = ex.unidade || passoBonito(((max ?? dMax) - (min ?? (dMin >= 0 && dMin <= dMax * 0.83 ? 0 : dMin))) / divisoes)
  if (min === null) min = dMin >= 0 && dMin <= dMax * 0.83 ? 0 : limpo(Math.floor(dMin / passo) * passo)
  if (max === null) max = limpo(Math.ceil(dMax / passo - 1e-9) * passo)
  if (max <= min) max = limpo(min + passo)
  for (let n = 0; n < 200; n++) {
    const v = limpo(min + n * passo)
    if (v > max + passo * 1e-9) break
    marcas.push(v)
  }
  if (ex.unidadeMenor && ex.unidadeMenor < passo) {
    for (let n = 1; n < 2000; n++) {
      const v = limpo(min + n * ex.unidadeMenor)
      if (v >= max - ex.unidadeMenor * 1e-9) break
      if (Math.abs((v - min) / passo - Math.round((v - min) / passo)) > 1e-6) menores.push(v)
    }
  }
  const para = v => (v - min) / (max - min)
  return { min, max, log: 0, marcas, menores, para: ex.inverso ? v => 1 - para(v) : para }
}

/** Caminho SVG de um trecho: reto ou suavizado (Catmull-Rom → Bézier, como a "linha suavizada" do Excel). */
export function caminho(pts, suave) {
  if (!pts.length) return ''
  if (!suave || pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('')
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`
  }
  return d
}

const TRACOS = {
  dot: [1, 3], sysDot: [1, 1], dash: [4, 3], sysDash: [3, 1], lgDash: [8, 3],
  dashDot: [4, 3, 1, 3], sysDashDot: [3, 1, 1, 1], lgDashDot: [8, 3, 1, 3],
  lgDashDotDot: [8, 3, 1, 3, 1, 3], sysDashDotDot: [3, 1, 1, 1, 1, 1],
}
/** 'sysDot' + largura (px) → stroke-dasharray */
export function tracejado(tipo, largura) {
  const t = TRACOS[tipo]
  return t ? t.map(k => (k * Math.max(largura, 1)).toFixed(2)).join(' ') : undefined
}

// ── linha de tendência (mínimos quadrados, como o Excel) ────────────────────
function resolver(A, b) {   // eliminação de Gauss (sistemas pequenos: polinomial até ordem 6)
  const n = b.length
  const M = A.map((l, i) => [...l, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    ;[M[c], M[p]] = [M[p], M[c]]
    if (Math.abs(M[c][c]) < 1e-300) return null
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((l, i) => l[n] / l[i])
}

function minimosQuadrados(us, vs, grau) {
  const A = [], b = []
  for (let i = 0; i <= grau; i++) {
    A.push([]); b.push(us.reduce((t, u, k) => t + Math.pow(u, i) * vs[k], 0))
    for (let j = 0; j <= grau; j++) A[i].push(us.reduce((t, u) => t + Math.pow(u, i + j), 0))
  }
  return resolver(A, b)
}

/**
 * Ajuste da linha de tendência sobre os pontos [{x,y}].
 * Retorna { f(x), texto (equação como no Excel), r2 } ou null (poucos pontos / tipo não suportado).
 * R² como o Excel: nos tipos linearizados (potência, exponencial) é calculado no espaço transformado.
 */
export function ajustarTendencia(t, pts) {
  const n = pts.length
  const fmt = v => {
    const s = String(+v.toPrecision(5)).replace('.', ',')
    return s
  }
  const sinal = v => (v < 0 ? ` - ${fmt(-v)}` : ` + ${fmt(v)}`)
  const r2de = (us, vs, g) => {
    const m = vs.reduce((a, v) => a + v, 0) / vs.length
    const sst = vs.reduce((a, v) => a + (v - m) ** 2, 0)
    const sse = vs.reduce((a, v, k) => a + (v - g(us[k])) ** 2, 0)
    return sst > 0 ? 1 - sse / sst : 1
  }
  if (t.tipo === 'power' || t.tipo === 'exp' || t.tipo === 'log' || t.tipo === 'linear') {
    const ok = pts.filter(p => (t.tipo === 'power' ? p.x > 0 && p.y > 0 : t.tipo === 'exp' ? p.y > 0 : t.tipo === 'log' ? p.x > 0 : true))
    if (ok.length < 2) return null
    const us = ok.map(p => (t.tipo === 'power' || t.tipo === 'log' ? Math.log(p.x) : p.x))
    const vs = ok.map(p => (t.tipo === 'power' || t.tipo === 'exp' ? Math.log(p.y) : p.y))
    const c = minimosQuadrados(us, vs, 1)
    if (!c) return null
    const [c0, c1] = c
    const r2 = r2de(us, vs, u => c0 + c1 * u)
    if (t.tipo === 'power') { const a = Math.exp(c0); return { f: x => a * Math.pow(x, c1), texto: `y = ${fmt(a)}x^${fmt(c1)}`, r2 } }
    if (t.tipo === 'exp') { const a = Math.exp(c0); return { f: x => a * Math.exp(c1 * x), texto: `y = ${fmt(a)}e^${fmt(c1)}x`, r2 } }
    if (t.tipo === 'log') return { f: x => c0 + c1 * Math.log(x), texto: `y = ${fmt(c1)}ln(x)${sinal(c0)}`, r2 }
    return { f: x => c0 + c1 * x, texto: `y = ${fmt(c1)}x${sinal(c0)}`, r2 }
  }
  if (t.tipo === 'poly') {
    const grau = Math.min(t.ordem || 2, 6)
    if (n <= grau) return null
    const c = minimosQuadrados(pts.map(p => p.x), pts.map(p => p.y), grau)
    if (!c) return null
    const f = x => c.reduce((s, k, i) => s + k * Math.pow(x, i), 0)
    let texto = 'y = '
    for (let i = grau; i >= 0; i--) {
      const k = c[i]
      const termo = i === 0 ? '' : i === 1 ? 'x' : `x^${i}`
      texto += i === grau ? `${fmt(k)}${termo}` : `${sinal(k)}${termo}`
    }
    return { f, texto, r2: r2de(pts.map(p => p.x), pts.map(p => p.y), f) }
  }
  return null
}
