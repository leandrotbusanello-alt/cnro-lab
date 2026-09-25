// ─────────────────────────────────────────────────────────────────────────────
// Ficha online: índice do modelo, cálculo, dados para salvar e resultados
//
// modelo (fichas_modelo.modelo) — gerado por tools/fichas/converter.py:
//   { motor, codigo, versao, titulo, origem:{c1,r1}, cols:[px], rows:[px],
//     cells: { 'D18': { rs, cs, f, bg, bd, h, vt, w, nf, v | rt | fx, role } },
//     imgs:[{x,y,w,h,src}], pagina:{orient, margens, centralizar, ajuste}, lista:{grupos} }
//
// role.tipo: 'entrada' (assistente) · 'revisao' (laboratorista) · 'pedido' (dados do pedido)
//            'escolha' (Sim/Não) · 'assinatura' (executor | calculista)
//
// estado (o que o usuário preencheu): { entradas: {D18: 65.13, …}, escolhas: {grupo: 'Sim'} }
// ─────────────────────────────────────────────────────────────────────────────
import { Motor, colNum, colStr, ehErro, separarEndereco } from './formulas.js'

export const VERSAO_MOTOR = 1

/** Índice do modelo (calculado uma vez por modelo). */
export function indexarModelo(modelo) {
  const { c1, r1 } = modelo.origem
  const cobertas = new Set()
  const formulas = {}
  const estaticos = {}
  const papeis = { entrada: [], revisao: [], pedido: [], escolha: [], assinatura: {} }

  for (const [a, d] of Object.entries(modelo.cells)) {
    const p = separarEndereco(a)
    const rs = d.rs || 1, cs = d.cs || 1
    if (rs > 1 || cs > 1) {
      for (let r = p.r; r < p.r + rs; r++) {
        for (let c = p.c; c < p.c + cs; c++) if (r !== p.r || c !== p.c) cobertas.add(colStr(c) + r)
      }
    }
    if (d.fx) formulas[a] = d.fx
    else if (d.v !== undefined && !d.role) estaticos[a] = d.v
    if (d.role) {
      const t = d.role.tipo
      if (t === 'assinatura') papeis.assinatura[d.role.quem] = a
      else if (papeis[t]) papeis[t].push(a)
    }
  }

  const porPosicao = (x, y) => {
    const a = separarEndereco(x), b = separarEndereco(y)
    return a.r - b.r || a.c - b.c
  }
  const porColuna = (x, y) => {
    const a = separarEndereco(x), b = separarEndereco(y)
    return a.c - b.c || a.r - b.r
  }
  papeis.entrada.sort(porPosicao)
  papeis.revisao.sort(porPosicao)

  const gruposEscolha = {}
  for (const a of papeis.escolha) {
    const r = modelo.cells[a].role
    ;(gruposEscolha[r.grupo] ||= []).push({ endereco: a, opcao: r.opcao })
  }

  return {
    modelo, c1, r1, cobertas, formulas, estaticos, papeis, gruposEscolha,
    // ordem de digitação: desce a coluna (como na planilha, CP por CP)
    ordemDigitacao: [...papeis.entrada].sort(porColuna),
    largura: modelo.cols.reduce((s, w) => s + w, 0),
    altura: modelo.rows.reduce((s, h) => s + h, 0),
    // colunas da área de impressão; as seguintes aparecem só na tela (ex.: carga em t no FR-IMOB-50)
    colsImpressao: modelo.impressao?.cols || modelo.cols.length,
    larguraImpressao: modelo.cols.slice(0, modelo.impressao?.cols || modelo.cols.length).reduce((s, w) => s + w, 0),
  }
}

export function estadoVazio() {
  return { entradas: {}, escolhas: {} }
}

/** Estado a partir de dados_resultado salvos (aceita dados antigos/vazios). */
export function estadoDosDados(dados) {
  return {
    entradas: { ...(dados?.entradas || {}) },
    escolhas: { ...(dados?.escolhas || {}) },
  }
}

function valorDeEntrada(v) {
  if (v && typeof v === 'object' && 'invalido' in v) return v.invalido  // texto em campo numérico: #VALUE! como no Excel
  return v === undefined ? null : v
}

/**
 * Calcula a ficha. Retorna o motor já recalculado (motor.valores tem tudo).
 *   pedidoCampos: { os, material, registro, procedencia, complemento, … }
 */
export function calcularFicha(indice, estado, pedidoCampos = {}) {
  const motor = new Motor()
  for (const [a, v] of Object.entries(indice.estaticos)) motor.definir(a, v)
  const cells = indice.modelo.cells
  for (const a of [...indice.papeis.entrada, ...indice.papeis.revisao]) {
    motor.definir(a, valorDeEntrada(estado?.entradas?.[a]))
  }
  for (const a of indice.papeis.pedido) {
    const campo = cells[a].role.campo
    const v = estado?.entradas?.[a] ?? pedidoCampos?.[campo]
    motor.definir(a, v === undefined || v === '' ? null : v)
  }
  for (const a of indice.papeis.escolha) {
    const r = cells[a].role
    // marca ("X"): a célula só tem valor quando a opção está marcada; senão, o texto fixo da opção
    motor.definir(a, r.marca ? (estado?.escolhas?.[r.grupo] === r.opcao ? r.marca : null) : r.texto)
  }
  motor.definirFormulas(indice.formulas)
  motor.recalcular()
  return motor
}

/** Valor exibível de uma célula calculada/estática (para o componente). */
export function valorCelula(motor, endereco) {
  const v = motor.valores.get(endereco)
  return v === undefined ? null : v
}

function normalizarSaida(v) {
  if (v === null || v === undefined) return null
  if (ehErro(v)) return v.err
  if (typeof v === 'number') return +v.toPrecision(15)
  return v
}

/** Dados salvos em ensaios_os.dados_resultado (cópia fiel da ficha). */
export function montarDados(indice, estado, motor, { modeloId } = {}) {
  const entradas = {}
  for (const [a, v] of Object.entries(estado?.entradas || {})) {
    if (v === null || v === undefined || v === '') continue
    entradas[a] = valorDeEntrada(v)
  }
  const escolhas = {}
  for (const [g, v] of Object.entries(estado?.escolhas || {})) if (v) escolhas[g] = v
  const calculados = {}
  for (const a of Object.keys(indice.formulas)) {
    const v = normalizarSaida(motor.valores.get(a))
    if (v !== null && v !== '') calculados[a] = v
  }
  const pedido = {}
  for (const a of indice.papeis.pedido) {
    const v = motor.valores.get(a)
    if (v !== null && v !== undefined && v !== '') pedido[indice.modelo.cells[a].role.campo] = v
  }
  return {
    motor: VERSAO_MOTOR,
    modelo_id: modeloId || null,
    codigo: indice.modelo.codigo,
    versao: indice.modelo.versao,
    entradas, escolhas, pedido, calculados,
    atualizado_em: new Date().toISOString(),
  }
}

/** Situação do preenchimento (para o status e para bloquear o envio). */
export function situacaoPreenchimento(indice, estado) {
  const invalidos = []
  let preenchidos = 0
  for (const a of indice.papeis.entrada) {
    const v = estado?.entradas?.[a]
    if (v && typeof v === 'object' && 'invalido' in v) invalidos.push(a)
    else if (v !== null && v !== undefined && v !== '') preenchidos++
  }
  return { preenchidos, total: indice.papeis.entrada.length, invalidos }
}

// ── Resultados normalizados (resultado_*) ────────────────────────────────────
// mapa_resultados (da spec da ficha):
//   [{ tabela, repetir: {var:'c', valores:['D','F'], quando:'=COUNT({c}18:{c}21)>0'},
//      campos: { codigo_cp: '="CP "&{n}', gmb_obtido: '={c}32', tipo_material: 'texto fixo' } }
//    { tabela, linhas: [{ quando, campos }, …] }]

function substituir(txt, vars) {
  return String(txt).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}

const EPOCA = Date.UTC(1899, 11, 30)

/**
 * Campo do resultado: valor fixo, fórmula ('=D32') ou { expr: '=B20', tipo: 'data' | 'numero' | 'texto' }.
 * tipo 'data' converte o número serial do Excel para 'AAAA-MM-DD' (colunas date).
 */
function avaliarCampo(motor, def, vars) {
  const expr = def && typeof def === 'object' ? def.expr : def
  const tipo = def && typeof def === 'object' ? def.tipo : null
  if (typeof expr !== 'string' || !expr.startsWith('=')) return expr
  let v = motor.calcular(substituir(expr.slice(1), vars))
  if (ehErro(v) || v === null || v === '') return null
  if (tipo === 'data') {
    if (typeof v !== 'number') return null
    return new Date(EPOCA + Math.round(v) * 864e5).toISOString().slice(0, 10)
  }
  if (tipo === 'texto') return String(v)
  if (tipo === 'numero' && typeof v !== 'number') return null
  if (typeof v === 'number') v = +v.toPrecision(12)
  return v
}

function linha(motor, campos, quando, vars) {
  if (quando) {
    const q = motor.calcular(substituir(quando.replace(/^=/, ''), vars))
    if (q !== true && !(typeof q === 'number' && q !== 0)) return null
  }
  const out = {}
  for (const [col, expr] of Object.entries(campos || {})) {
    const v = avaliarCampo(motor, expr, vars)
    if (v !== null && v !== undefined) out[col] = v
  }
  return Object.keys(out).length ? out : null
}

export function linhasResultado(mapa, motor) {
  const saida = []
  for (const item of mapa || []) {
    const linhas = []
    if (item.repetir) {
      const { var: nome, valores, quando } = item.repetir
      valores.forEach((valor, i) => {
        const l = linha(motor, item.campos, quando, { [nome]: valor, n: i + 1 })
        if (l) linhas.push(l)
      })
    } else if (item.linhas) {
      item.linhas.forEach((def, i) => {
        const l = linha(motor, def.campos, def.quando, { n: i + 1 })
        if (l) linhas.push(l)
      })
    } else {
      const l = linha(motor, item.campos, item.quando, { n: 1 })
      if (l) linhas.push(l)
    }
    saida.push({ tabela: item.tabela, linhas })
  }
  return saida
}

// ── Visão em lista (celular) ─────────────────────────────────────────────────

function rotuloDe(role, modoRotulo) {
  if (role.rot) return role.rot
  if (modoRotulo === 'cabecalho') return role.rc || role.rl || ''
  if (modoRotulo === 'linha') return role.rl || role.rc || ''
  return [role.rl, role.rc].filter(Boolean).join(' · ')
}

/**
 * Grupos da visão em lista: [{ titulo, itens: [{ tipo:'entrada'|'escolha'|'revisao', endereco|grupo, rotulo }] }]
 */
export function gruposDaLista(indice, { incluirRevisao = false } = {}) {
  const cells = indice.modelo.cells
  const defs = indice.modelo.lista?.grupos || []
  const usados = new Set()
  const grupos = []
  const listaLinhas = v => {
    if (v === undefined) return null
    const out = []
    for (const x of [].concat(v)) {
      if (typeof x === 'number') out.push(x)
      else if (/^\d+-\d+$/.test(String(x))) { const [a, b] = String(x).split('-').map(Number); for (let i = a; i <= b; i++) out.push(i) }
      else out.push(Number(x))
    }
    return out
  }
  const itemDe = (a, modoRotulo) => {
    const role = cells[a]?.role
    if (!role) return null
    if (role.tipo === 'escolha') {
      if (usados.has(`g:${role.grupo}`)) return null
      usados.add(`g:${role.grupo}`)
      indice.gruposEscolha[role.grupo].forEach(o => usados.add(o.endereco))
      const primeira = indice.gruposEscolha[role.grupo][0].endereco
      const p = separarEndereco(primeira)
      let rot = ''
      for (let c = p.c - 1; c >= indice.c1 && !rot; c--) {
        const t = cells[colStr(c) + p.r]
        if (t && typeof t.v === 'string' && !t.role) rot = t.v
      }
      return { tipo: 'escolha', grupo: role.grupo, rotulo: role.rotuloGrupo || rot || role.grupo, opcoes: indice.gruposEscolha[role.grupo] }
    }
    if (role.tipo !== 'entrada' && !(incluirRevisao && role.tipo === 'revisao')) return null
    if (usados.has(a)) return null
    usados.add(a)
    return { tipo: role.tipo, endereco: a, dado: role.dado, rotulo: rotuloDe(role, modoRotulo) || a, multilinha: !!role.ml }
  }

  for (const def of defs) {
    const modoRotulo = def.rotulo
    if (def.colunas) {
      const linhasFiltro = listaLinhas(def.linhas)
      def.colunas.forEach((col, i) => {
        const enderecos = indice.papeis.entrada.filter(a => {
          const p = separarEndereco(a)
          return colStr(p.c) === col && (!linhasFiltro || linhasFiltro.includes(p.r))
        })
        const itens = enderecos.map(a => itemDe(a, modoRotulo)).filter(Boolean)
        if (itens.length) grupos.push({ titulo: substituir(def.titulo, { n: i + 1, c: col }), itens })
      })
    } else {
      let enderecos = []
      if (def.celulas) enderecos = def.celulas
      else if (def.linhas) {
        const ls = listaLinhas(def.linhas)
        enderecos = [...indice.papeis.entrada, ...indice.papeis.escolha].filter(a => ls.includes(separarEndereco(a).r))
          .sort((x, y) => { const a = separarEndereco(x), b = separarEndereco(y); return a.r - b.r || a.c - b.c })
      }
      const itens = enderecos.map(a => itemDe(a, modoRotulo)).filter(Boolean)
      if (itens.length) grupos.push({ titulo: def.titulo, itens })
    }
  }

  const restantes = [...indice.papeis.entrada, ...indice.papeis.escolha]
    .filter(a => !usados.has(a))
    .map(a => itemDe(a))
    .filter(Boolean)
  if (restantes.length) grupos.push({ titulo: grupos.length ? 'Outros campos' : 'Campos da ficha', itens: restantes })

  if (incluirRevisao) {
    const rev = indice.papeis.revisao.filter(a => !usados.has(a)).map(a => itemDe(a)).filter(Boolean)
    if (rev.length) grupos.push({ titulo: 'Laboratorista (parâmetros)', itens: rev })
  }
  return grupos
}

export { colNum, colStr, separarEndereco }
