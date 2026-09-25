// ─────────────────────────────────────────────────────────────────────────────
// Motor de fórmulas das fichas online
//
// Avalia as fórmulas ORIGINAIS das planilhas (subconjunto do Excel), com as
// mesmas regras do Excel para vazios, texto, erros e arredondamento, para que
// a ficha online calcule exatamente como a planilha.
//
// Valores: number | string | boolean | null (vazio) | {err:'#DIV/0!'}
// Endereços: 'D18' ou, com aba, 'VERSO!D18'.
// ─────────────────────────────────────────────────────────────────────────────

export const E = e => ({ err: e })
export const ehErro = v => v !== null && typeof v === 'object' && 'err' in v

export function colNum(s) {
  let n = 0
  for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64
  return n
}

export function colStr(n) {
  let s = ''
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - 1 - m) / 26 }
  return s
}

export function separarEndereco(a) {
  const m = /^(?:(.+)!)?([A-Z]+)(\d+)$/.exec(a)
  if (!m) return null
  return { aba: m[1] || null, c: colNum(m[2]), r: +m[3] }
}

// ── Tokenização ──────────────────────────────────────────────────────────────

const RE_ERRO = /^#(DIV\/0!|N\/A|VALUE!|REF!|NAME\?|NUM!|NULL!)/
const RE_NUM = /^(\d+\.?\d*(E[+-]?\d+)?|\.\d+(E[+-]?\d+)?)/i
const RE_ABA = /^(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_.]*))!/
const RE_REF = /^\$?([A-Z]{1,3})\$?(\d+)(:\$?([A-Z]{1,3})\$?(\d+))?(?![A-Za-z0-9_(.])/
const RE_FN = /^([A-Z_][A-Z0-9_.]*)\(/i
const RE_BOOL = /^(TRUE|FALSE)(?![A-Za-z0-9_(])/i
const RE_OP = /^(<=|>=|<>|[-+*/^&=<>%(),;])/

function tokenizar(src) {
  const t = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    const resto = src.slice(i)
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') { i++; continue }
    if (ch === '"') {
      let j = i + 1, s = ''
      while (j < src.length) {
        if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue } break }
        s += src[j++]
      }
      t.push({ k: 'str', v: s }); i = j + 1; continue
    }
    let m = RE_ERRO.exec(resto)
    if (m) { t.push({ k: 'err', v: m[0] }); i += m[0].length; continue }
    m = RE_NUM.exec(resto)
    if (m) { t.push({ k: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue }
    let aba = null
    m = RE_ABA.exec(resto)
    if (m && RE_REF.test(resto.slice(m[0].length))) {
      aba = (m[1] ? m[1].replace(/''/g, "'") : m[2])
      i += m[0].length
    }
    m = RE_REF.exec(src.slice(i))
    if (m) {
      t.push(m[3]
        ? { k: 'rng', aba, c1: colNum(m[1]), r1: +m[2], c2: colNum(m[4]), r2: +m[5] }
        : { k: 'ref', aba, c: colNum(m[1]), r: +m[2] })
      i += m[0].length
      continue
    }
    if (aba) throw new Error('Referência inválida após o nome da aba')
    m = RE_FN.exec(resto)
    if (m) { t.push({ k: 'fn', v: m[1].toUpperCase().replace(/^_XLFN\./, '') }); i += m[0].length; continue }
    m = RE_BOOL.exec(resto)
    if (m) { t.push({ k: 'bool', v: m[1].toUpperCase() === 'TRUE' }); i += m[0].length; continue }
    m = RE_OP.exec(resto)
    if (m) { t.push({ k: 'op', v: m[0] === ';' ? ',' : m[0] }); i += m[0].length; continue }
    throw new Error('Trecho não reconhecido: ' + resto.slice(0, 20))
  }
  return t
}

// ── Análise (precedência do Excel) ───────────────────────────────────────────

const BIN = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 }

export function analisar(src) {
  const tk = tokenizar(src)
  let p = 0
  const ver = () => tk[p]
  const prox = () => tk[p++]
  const ehOp = (t, v) => t && t.k === 'op' && t.v === v
  const esperar = v => { const t = prox(); if (!ehOp(t, v)) throw new Error(`Esperado "${v}"`) }

  function primario() {
    const t = prox()
    if (!t) throw new Error('Fórmula incompleta')
    switch (t.k) {
      case 'num': return { t: 'n', v: t.v }
      case 'str': return { t: 's', v: t.v }
      case 'bool': return { t: 'b', v: t.v }
      case 'err': return { t: 'e', v: t.v }
      case 'ref': return { t: 'ref', aba: t.aba, c: t.c, r: t.r }
      case 'rng': return {
        t: 'rng', aba: t.aba,
        c1: Math.min(t.c1, t.c2), r1: Math.min(t.r1, t.r2), c2: Math.max(t.c1, t.c2), r2: Math.max(t.r1, t.r2),
      }
      case 'fn': {
        const args = []
        if (ehOp(ver(), ')')) { prox(); return { t: 'fn', n: t.v, args } }
        for (;;) {
          if (ehOp(ver(), ',') || ehOp(ver(), ')')) args.push({ t: 'vazio' })
          else args.push(expr(0))
          if (ehOp(ver(), ',')) { prox(); continue }
          esperar(')')
          break
        }
        return { t: 'fn', n: t.v, args }
      }
      case 'op':
        if (t.v === '(') { const e = expr(0); esperar(')'); return e }
        break
      default: break
    }
    throw new Error('Símbolo inesperado')
  }
  function unario() {
    const t = ver()
    if (ehOp(t, '-') || ehOp(t, '+')) { prox(); const e = unario(); return t.v === '-' ? { t: 'neg', e } : e }
    let e = primario()
    while (ehOp(ver(), '%')) { prox(); e = { t: 'pct', e } }
    return e
  }
  function expr(min) {
    let esq = unario()
    for (;;) {
      const t = ver()
      if (!t || t.k !== 'op' || !(t.v in BIN)) break
      const pr = BIN[t.v]
      if (pr < min) break
      prox()
      esq = { t: 'bin', op: t.v, a: esq, b: expr(pr + 1) }
    }
    return esq
  }
  const ast = expr(0)
  if (p < tk.length) throw new Error('Sobrou texto na fórmula')
  return ast
}

// ── Coerções (regras do Excel) ───────────────────────────────────────────────

function paraNumero(v) {
  if (ehErro(v)) return v
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    if (v.trim() === '') return E('#VALUE!')
    const n = Number(v)
    return Number.isFinite(n) ? n : E('#VALUE!')
  }
  return E('#VALUE!')
}

function paraLogico(v) {
  if (ehErro(v)) return v
  if (v === null || v === undefined) return false
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  const s = String(v).toUpperCase()
  if (s === 'TRUE' || s === 'VERDADEIRO') return true
  if (s === 'FALSE' || s === 'FALSO') return false
  return E('#VALUE!')
}

function paraTexto(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') return String(+v.toPrecision(15))
  return String(v)
}

function comparar(a, b) {
  if (a === null && b === null) return 0
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0
  if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0
  const rank = v => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2)
  if (rank(a) !== rank(b)) return rank(a) - rank(b)
  if (typeof a === 'string') { a = a.toUpperCase(); b = b.toUpperCase() }
  return a < b ? -1 : a > b ? 1 : 0
}

const media = l => l.reduce((s, x) => s + x, 0) / l.length

/**
 * Ajusta as abas das referências de uma fórmula:
 *   sem aba → a aba da própria fórmula (null = principal);
 *   com o nome do Excel → o id da aba na ficha (apelidos), '' → principal.
 */
function qualificar(ast, abaPadrao, apelidos) {
  if (!ast || typeof ast !== 'object') return ast
  if (ast.t === 'ref' || ast.t === 'rng') {
    let aba = ast.aba
    if (aba === null || aba === undefined) aba = abaPadrao
    else if (Object.prototype.hasOwnProperty.call(apelidos, aba)) aba = apelidos[aba] || null
    return aba === ast.aba ? ast : { ...ast, aba }
  }
  const out = { ...ast }
  for (const k of ['a', 'b', 'e']) if (ast[k]) out[k] = qualificar(ast[k], abaPadrao, apelidos)
  if (ast.args) out.args = ast.args.map(x => qualificar(x, abaPadrao, apelidos))
  return out
}

// ── Motor ────────────────────────────────────────────────────────────────────

export class Motor {
  constructor() {
    this.valores = new Map()   // endereço → valor (entradas, textos fixos e resultados)
    this.formulas = new Map()  // endereço → { src, ast, deps }
    this.ordem = []
  }

  chave(aba, c, r) { return (aba ? `${aba}!` : '') + colStr(c) + r }

  obter(aba, c, r) {
    const v = this.valores.get(this.chave(aba, c, r))
    return v === undefined ? null : v
  }

  definir(endereco, valor) { this.valores.set(endereco, valor === undefined ? null : valor) }

  /**
   * Registra as fórmulas { 'D22': 'IFERROR(AVERAGE(D18:E21),"")', 'VERSO!F9': 'F7*2', ... }
   * e calcula a ordem de avaliação.
   *   apelidos: nome da aba no Excel → id da aba na ficha ('' = aba principal).
   *   Numa fórmula de outra aba ('VERSO!F9'), referência sem aba aponta para a própria aba.
   */
  definirFormulas(mapa, { apelidos = {} } = {}) {
    this.formulas.clear()
    for (const [a, src] of Object.entries(mapa)) {
      try {
        const abaDaFormula = separarEndereco(a)?.aba || null
        const ast = qualificar(analisar(src), abaDaFormula, apelidos)
        this.formulas.set(a, { src, ast, deps: this.dependencias(ast) })
      } catch (e) {
        this.formulas.set(a, { src, ast: { t: 'e', v: '#NAME?' }, deps: [], erroAnalise: e.message })
      }
    }
    const estado = new Map()
    const ordem = []
    const visitar = a => {
      const s = estado.get(a)
      if (s === 2) return true
      if (s === 1) return false
      estado.set(a, 1)
      const f = this.formulas.get(a)
      for (const d of f.deps) if (this.formulas.has(d) && !visitar(d)) f.circular = true
      estado.set(a, 2)
      ordem.push(a)
      return true
    }
    for (const a of this.formulas.keys()) visitar(a)
    this.ordem = ordem
  }

  dependencias(ast, out = new Set()) {
    if (!ast) return out
    if (ast.t === 'ref') out.add(this.chave(ast.aba, ast.c, ast.r))
    else if (ast.t === 'rng') {
      for (let c = ast.c1; c <= ast.c2; c++) for (let r = ast.r1; r <= ast.r2; r++) out.add(this.chave(ast.aba, c, r))
    } else {
      for (const k of ['a', 'b', 'e']) if (ast[k]) this.dependencias(ast[k], out)
      if (ast.args) ast.args.forEach(x => this.dependencias(x, out))
    }
    return [...out]
  }

  /** Recalcula todas as fórmulas (na ordem das dependências). */
  recalcular() {
    for (const a of this.ordem) {
      const f = this.formulas.get(a)
      let v = f.circular ? E('#CIRC!') : this.avaliar(f.ast)
      if (v && v.intervalo) v = E('#VALUE!')
      if (v === null) v = 0                       // fórmula que aponta para vazio mostra 0 (como no Excel)
      if (typeof v === 'number' && !Number.isFinite(v)) v = E('#NUM!')
      this.valores.set(a, v)
    }
  }

  /** Avalia uma expressão avulsa (sem "="), p.ex. para o mapa de resultados. */
  calcular(src) {
    try {
      let v = this.avaliar(analisar(src))
      if (v && v.intervalo) v = E('#VALUE!')
      return v
    } catch {
      return E('#NAME?')
    }
  }

  avaliar(n) {
    switch (n.t) {
      case 'n': case 's': case 'b': return n.v
      case 'e': return E(n.v)
      case 'vazio': return null
      case 'ref': return this.obter(n.aba, n.c, n.r)
      case 'rng': return { intervalo: this.intervalo(n), linhas: n.r2 - n.r1 + 1, colunas: n.c2 - n.c1 + 1 }
      case 'neg': { const v = paraNumero(this.escalar(n.e)); return ehErro(v) ? v : -v }
      case 'pct': { const v = paraNumero(this.escalar(n.e)); return ehErro(v) ? v : v / 100 }
      case 'bin': return this.binario(n)
      case 'fn': return this.funcao(n.n, n.args)
      default: return E('#VALUE!')
    }
  }

  intervalo(n) {
    const out = []
    for (let r = n.r1; r <= n.r2; r++) for (let c = n.c1; c <= n.c2; c++) out.push(this.obter(n.aba, c, r))
    return out
  }

  escalar(n) {
    const v = this.avaliar(n)
    return v && v.intervalo ? E('#VALUE!') : v
  }

  binario(n) {
    const a = this.escalar(n.a); if (ehErro(a)) return a
    const b = this.escalar(n.b); if (ehErro(b)) return b
    if (n.op === '&') return paraTexto(a) + paraTexto(b)
    if (['=', '<>', '<', '>', '<=', '>='].includes(n.op)) {
      const c = comparar(a, b)
      return { '=': c === 0, '<>': c !== 0, '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0 }[n.op]
    }
    const x = paraNumero(a); if (ehErro(x)) return x
    const y = paraNumero(b); if (ehErro(y)) return y
    switch (n.op) {
      case '+': return x + y
      case '-': return x - y
      case '*': return x * y
      case '/': return y === 0 ? E('#DIV/0!') : x / y
      case '^': { const r = Math.pow(x, y); return Number.isNaN(r) ? E('#NUM!') : r }
      default: return E('#VALUE!')
    }
  }

  /** Números dos argumentos, como SUM/AVERAGE: em intervalos/referências ignora texto e vazio. */
  numeros(args, { ignorarErros = false } = {}) {
    const out = []
    for (const a of args) {
      if (a.t === 'rng' || a.t === 'ref') {
        const v = this.avaliar(a)
        const lista = v && v.intervalo ? v.intervalo : [v]
        for (const x of lista) {
          if (ehErro(x)) { if (ignorarErros) continue; return x }
          if (typeof x === 'number') out.push(x)
        }
      } else {
        const v = this.escalar(a)
        if (ehErro(v)) { if (ignorarErros) continue; return v }
        if (v === null) continue
        const x = paraNumero(v)
        if (ehErro(x)) { if (ignorarErros) continue; return x }
        out.push(x)
      }
    }
    return out
  }

  paresNumericos(aArg, bArg) {
    const ys = this.avaliar(aArg), xs = this.avaliar(bArg)
    if (!ys?.intervalo || !xs?.intervalo || ys.intervalo.length !== xs.intervalo.length) return E('#N/A')
    const px = [], py = []
    ys.intervalo.forEach((y, i) => {
      const x = xs.intervalo[i]
      if (typeof x === 'number' && typeof y === 'number') { px.push(x); py.push(y) }
    })
    return { px, py }
  }

  procurar(args, horizontal) {
    const alvo = this.escalar(args[0]); if (ehErro(alvo)) return alvo
    const tab = this.avaliar(args[1])
    if (!tab?.intervalo) return E('#VALUE!')
    const idx = paraNumero(this.escalar(args[2])); if (ehErro(idx)) return idx
    const aproximado = args.length > 3 ? paraLogico(this.escalar(args[3])) : true
    const nL = tab.linhas, nC = tab.colunas
    const em = (l, c) => tab.intervalo[l * nC + c]
    const n = horizontal ? nC : nL
    if (idx < 1 || idx > (horizontal ? nL : nC)) return E('#REF!')
    const chave = i => (horizontal ? em(0, i) : em(i, 0))
    const resultado = i => (horizontal ? em(idx - 1, i) : em(i, idx - 1))
    let achado = -1
    if (aproximado === true) {
      for (let i = 0; i < n; i++) {
        const k = chave(i)
        if (k === null) continue
        if (typeof k !== typeof alvo) continue
        if (comparar(k, alvo) <= 0) achado = i; else break
      }
    } else {
      for (let i = 0; i < n; i++) if (chave(i) !== null && comparar(chave(i), alvo) === 0) { achado = i; break }
    }
    if (achado < 0) return E('#N/A')
    const v = resultado(achado)
    return v === null ? 0 : v
  }

  funcao(nome, args) {
    const A = i => (args[i] ? this.escalar(args[i]) : null)
    const N = i => paraNumero(A(i))
    const agregar = f => { const l = this.numeros(args); return ehErro(l) ? l : f(l) }
    const umNumero = f => { const x = N(0); return ehErro(x) ? x : f(x) }

    switch (nome) {
      case 'IF': {
        const c = paraLogico(A(0)); if (ehErro(c)) return c
        if (c) return args.length > 1 ? this.avaliar(args[1]) : true
        return args.length > 2 ? this.avaliar(args[2]) : false
      }
      case 'IFERROR': { const v = A(0); return ehErro(v) ? A(1) : v }
      case 'IFNA': { const v = A(0); return ehErro(v) && v.err === '#N/A' ? A(1) : v }
      case 'SUM': return agregar(l => l.reduce((s, x) => s + x, 0))
      case 'AVERAGE': return agregar(l => (l.length ? media(l) : E('#DIV/0!')))
      case 'MIN': return agregar(l => (l.length ? Math.min(...l) : 0))
      case 'MAX': return agregar(l => (l.length ? Math.max(...l) : 0))
      case 'MEDIAN': return agregar(l => {
        if (!l.length) return E('#NUM!')
        const s = [...l].sort((a, b) => a - b), m = Math.floor(s.length / 2)
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
      })
      case 'COUNT': return this.numeros(args, { ignorarErros: true }).length
      case 'COUNTA': {
        let n = 0
        for (const a of args) {
          const v = this.avaliar(a)
          const l = v && v.intervalo ? v.intervalo : [v]
          n += l.filter(x => x !== null).length
        }
        return n
      }
      case 'STDEV': case 'STDEV.S': return agregar(l => {
        if (l.length < 2) return E('#DIV/0!')
        const m = media(l)
        return Math.sqrt(l.reduce((s, x) => s + (x - m) ** 2, 0) / (l.length - 1))
      })
      case 'PI': return Math.PI
      case 'ABS': return umNumero(Math.abs)
      case 'SQRT': return umNumero(x => (x < 0 ? E('#NUM!') : Math.sqrt(x)))
      case 'LN': return umNumero(x => (x <= 0 ? E('#NUM!') : Math.log(x)))
      case 'LOG10': return umNumero(x => (x <= 0 ? E('#NUM!') : Math.log10(x)))
      case 'LOG': {
        const x = N(0), b = args.length > 1 ? N(1) : 10
        if (ehErro(x)) return x
        if (ehErro(b)) return b
        return x <= 0 || b <= 0 || b === 1 ? E('#NUM!') : Math.log(x) / Math.log(b)
      }
      case 'EXP': return umNumero(Math.exp)
      case 'INT': return umNumero(Math.floor)
      case 'TRUNC': return umNumero(Math.trunc)
      case 'POWER': {
        const x = N(0), y = N(1)
        if (ehErro(x)) return x
        if (ehErro(y)) return y
        const r = Math.pow(x, y)
        return Number.isNaN(r) ? E('#NUM!') : r
      }
      case 'ROUND': case 'ROUNDUP': case 'ROUNDDOWN': {
        const x = N(0), d = args.length > 1 ? N(1) : 0
        if (ehErro(x)) return x
        if (ehErro(d)) return d
        const f = Math.pow(10, Math.trunc(d)), s = Math.sign(x), ax = +(Math.abs(x) * f).toPrecision(15)
        const r = nome === 'ROUND' ? Math.round(ax) : nome === 'ROUNDUP' ? Math.ceil(ax) : Math.floor(ax)
        return (s * r) / f
      }
      case 'AND': case 'OR': {
        const vals = []
        for (const a of args) {
          const v = this.avaliar(a)
          const l = v && v.intervalo ? v.intervalo.filter(x => x !== null && typeof x !== 'string') : [v]
          for (const x of l) { const b = paraLogico(x); if (ehErro(b)) return b; vals.push(b) }
        }
        if (!vals.length) return E('#VALUE!')
        return nome === 'AND' ? vals.every(Boolean) : vals.some(Boolean)
      }
      case 'NOT': { const b = paraLogico(A(0)); return ehErro(b) ? b : !b }
      case 'ISNUMBER': return typeof A(0) === 'number'
      case 'ISTEXT': return typeof A(0) === 'string'
      case 'ISERROR': return ehErro(A(0))
      case 'ISNA': { const v = A(0); return ehErro(v) && v.err === '#N/A' }
      case 'ISBLANK': return A(0) === null
      case 'NA': return E('#N/A')
      case 'TRUE': return true
      case 'FALSE': return false
      case 'CONCATENATE': case 'CONCAT': {
        let s = ''
        for (let i = 0; i < args.length; i++) { const v = A(i); if (ehErro(v)) return v; s += paraTexto(v) }
        return s
      }
      case 'VLOOKUP': return this.procurar(args, false)
      case 'HLOOKUP': return this.procurar(args, true)
      case 'INDEX': {
        const tab = this.avaliar(args[0])
        const l = N(1), c = args.length > 2 ? N(2) : 1
        if (ehErro(l)) return l
        if (ehErro(c)) return c
        if (!tab?.intervalo) return l === 1 && c === 1 ? tab : E('#REF!')
        const li = tab.linhas === 1 && args.length === 2 ? 1 : l
        const ci = tab.linhas === 1 && args.length === 2 ? l : c
        if (li < 1 || ci < 1 || li > tab.linhas || ci > tab.colunas) return E('#REF!')
        const v = tab.intervalo[(li - 1) * tab.colunas + (ci - 1)]
        return v === null ? 0 : v
      }
      case 'MATCH': {
        const alvo = A(0); if (ehErro(alvo)) return alvo
        const tab = this.avaliar(args[1])
        const tipo = args.length > 2 ? N(2) : 1
        if (!tab?.intervalo) return E('#N/A')
        let achado = -1
        tab.intervalo.forEach((k, i) => {
          if (achado >= 0 && tipo === 0) return
          if (k === null) return
          const c = comparar(k, alvo)
          if (tipo === 0 && c === 0) achado = i
          else if (tipo === 1 && c <= 0) achado = i
          else if (tipo === -1 && c >= 0) achado = i
        })
        return achado < 0 ? E('#N/A') : achado + 1
      }
      case 'SLOPE': case 'INTERCEPT': case 'RSQ': case 'CORREL': {
        const par = this.paresNumericos(args[0], args[1])
        if (ehErro(par)) return par
        const { px, py } = par
        if (px.length < 2) return E('#DIV/0!')
        const mx = media(px), my = media(py)
        let sxy = 0, sxx = 0, syy = 0
        px.forEach((x, i) => { sxy += (x - mx) * (py[i] - my); sxx += (x - mx) ** 2; syy += (py[i] - my) ** 2 })
        if (sxx === 0) return E('#DIV/0!')
        if (nome === 'SLOPE') return sxy / sxx
        if (nome === 'INTERCEPT') return my - (sxy / sxx) * mx
        if (syy === 0) return E('#DIV/0!')
        const r = sxy / Math.sqrt(sxx * syy)
        return nome === 'RSQ' ? r * r : r
      }
      default:
        return E('#NAME?')
    }
  }
}
