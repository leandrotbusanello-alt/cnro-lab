// ─────────────────────────────────────────────────────────────────────────────
// Formatação dos valores das fichas (pt-BR), a partir do formato numérico do Excel
// ('0.00', '0.0%', '#,##0', 'mm-dd-yy', '0.00;[Black]0.00' …)
// ─────────────────────────────────────────────────────────────────────────────
import { ehErro } from './formulas.js'

const CACHE = new Map()
const EPOCA = Date.UTC(1899, 11, 30)

function plano(nf) {
  if (CACHE.has(nf)) return CACHE.get(nf)
  const secoes = nf.split(';').map(s => {
    let x = s.replace(/\[[^\]]*\]/g, '').replace(/\\(.)/g, '"$1"')
    const literais = []
    x = x.replace(/"([^"]*)"/g, (_, q) => { literais.push(q); return '\u0001' })
    const ehData = /[dmyhs]/i.test(x) && !/[0#]/.test(x)
    const pct = x.includes('%')
    const nucleo = (x.match(/[#0,.]+/) || [''])[0]
    const dec = nucleo.includes('.') ? nucleo.split('.')[1] : ''
    const minF = (dec.match(/0/g) || []).length
    const maxF = (dec.match(/[0#]/g) || []).length
    const milhar = /[#0],[#0]/.test(nucleo)
    const [antes, depois] = nucleo ? x.split(nucleo) : [x, '']
    const limpar = t => (t || '').replace(/\u0001/g, () => literais.shift() || '').replace(/[_*]./g, ' ')
    const temHora = /h|s/i.test(x)
    const soHora = ehData && temHora && !/[dy]/i.test(x)   // 'h:mm', 'hh:mm;@'
    return { ehData, temHora, soHora, pct, minF, maxF, milhar, antes: limpar(antes), depois: limpar(depois), temNucleo: !!nucleo }
  })
  CACHE.set(nf, secoes)
  return secoes
}

export function formatarGeral(v) {
  if (Number.isInteger(v)) return String(v)
  const a = Math.abs(v)
  const s = a !== 0 && (a < 1e-9 || a >= 1e11) ? v.toExponential(5) : String(+v.toPrecision(10))
  return s.replace('.', ',')
}

export function serialParaData(v) {
  return new Date(EPOCA + Math.round(v * 864e5))
}

export function dataParaSerial(d) {
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCA) / 864e5)
}

/** Fração do dia (Excel) → "13:44" */
export function formatarHora(v) {
  const min = Math.round((((v % 1) + 1) % 1) * 1440) % 1440
  const p = x => String(x).padStart(2, '0')
  return `${p(Math.floor(min / 60))}:${p(min % 60)}`
}

export function formatarData(v, comHora = false) {
  const d = serialParaData(v)
  const p = x => String(x).padStart(2, '0')
  const s = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
  return comHora ? `${s} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : s
}

/** Texto exibido na célula para um valor com o formato numérico do Excel. */
export function formatar(v, nf) {
  if (v === null || v === undefined) return ''
  if (ehErro(v)) return v.err
  if (typeof v === 'boolean') return v ? 'VERDADEIRO' : 'FALSO'
  if (typeof v === 'string') return v
  if (!nf || nf === 'General' || nf === '@') return formatarGeral(v)
  const secoes = plano(nf)
  let sec = secoes[0]
  let x = v
  if (v < 0 && secoes[1]) { sec = secoes[1]; x = -v } else if (v === 0 && secoes[2]) sec = secoes[2]
  if (sec.soHora) return formatarHora(x)
  if (sec.ehData) return formatarData(x, sec.temHora && x % 1 !== 0)
  if (!sec.temNucleo) return (sec.antes + sec.depois) || formatarGeral(v)
  if (sec.pct) x *= 100
  const s = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: sec.minF, maximumFractionDigits: sec.maxF, useGrouping: sec.milhar,
  }).format(+x.toPrecision(15))
  return sec.antes + s + sec.depois
}

/**
 * Converte o que o usuário digitou.
 *   numero: "65,13" · "1.198,01" · "65.13"   data: "13/03/2026"   hora: "13:44"   texto: livre
 * Retorna o valor, null (vazio) ou { invalido: texto }.
 */
export function interpretarEntrada(texto, tipo) {
  const s = String(texto ?? '').trim()
  if (s === '') return null
  if (tipo === 'texto') return s
  if (tipo === 'hora') {
    // "13:44" · "13h44" · "1344" · "13"
    const m = /^(\d{1,2})(?:[:hH.]?(\d{2}))?$/.exec(s.replace(/\s/g, ''))
    if (!m) return { invalido: s }
    const h = +m[1], mi = +(m[2] || 0)
    if (h > 23 || mi > 59) return { invalido: s }
    return +((h * 60 + mi) / 1440).toPrecision(15)
  }
  if (tipo === 'data') {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s)
    if (!m) return { invalido: s }
    let ano = +m[3]
    if (ano < 100) ano += 2000
    const d = new Date(Date.UTC(ano, +m[2] - 1, +m[1]))
    if (d.getUTCDate() !== +m[1] || d.getUTCMonth() !== +m[2] - 1) return { invalido: s }
    return Math.round((d.getTime() - EPOCA) / 864e5)
  }
  let t = s.replace(/\s/g, '')
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) && t !== '' ? n : { invalido: s }
}

/** Texto para edição (o que aparece no campo ao focar). */
export function textoParaEdicao(v, tipo) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && 'invalido' in v) return v.invalido
  if (tipo === 'data' && typeof v === 'number') return formatarData(v)
  if (tipo === 'hora' && typeof v === 'number') return formatarHora(v)
  if (typeof v === 'number') return String(+v.toPrecision(15)).replace('.', ',')
  return String(v)
}
