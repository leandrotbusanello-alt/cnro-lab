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
//            'verificacao' (caixa de seleção independente, ☐/☒ — pontos de verificação do verso)
//
// Frente e verso: modelo.abas = [{ id:'VERSO', titulo:'Verso', origem, cols, rows, cells, imgs, pagina, lista }]
//   (mesmo formato da aba principal). Fora da folha, o endereço leva o id da aba: 'VERSO!F7'.
//   modelo.apelidos: nome da aba no Excel → id ('' = principal), para as fórmulas entre abas.
//
// estado (o que o usuário preencheu):
//   { entradas: {D18: 65.13, 'VERSO!F7': 'BAL-01', …}, escolhas: {grupo: 'Sim'}, verificacoes: {'VERSO!B10': true} }
// ─────────────────────────────────────────────────────────────────────────────
import { Motor, colNum, colStr, ehErro, separarEndereco } from './formulas.js'

export const VERSAO_MOTOR = 1

const porPosicao = (x, y) => {
  const a = separarEndereco(x), b = separarEndereco(y)
  return a.r - b.r || a.c - b.c
}
const porColuna = (x, y) => {
  const a = separarEndereco(x), b = separarEndereco(y)
  return a.c - b.c || a.r - b.r
}

/**
 * Índice de uma folha (aba) da ficha. As células ficam com o endereço local ('B7');
 * os papéis e a ordem de digitação usam o endereço completo ('VERSO!B7'; na aba principal, 'B7').
 */
function indexarFolha(folha, id, titulo) {
  const prefixo = id ? `${id}!` : ''
  const { c1, r1 } = folha.origem
  const cobertas = new Set()
  const entradas = [], revisao = []
  for (const [a, d] of Object.entries(folha.cells)) {
    const p = separarEndereco(a)
    const rs = d.rs || 1, cs = d.cs || 1
    if (rs > 1 || cs > 1) {
      for (let r = p.r; r < p.r + rs; r++) {
        for (let c = p.c; c < p.c + cs; c++) if (r !== p.r || c !== p.c) cobertas.add(colStr(c) + r)
      }
    }
    if (d.role?.tipo === 'entrada') entradas.push(a)
    if (d.role?.tipo === 'revisao') revisao.push(a)
  }
  const colsImpressao = folha.impressao?.cols || folha.cols.length
  return {
    id: id || null, titulo, prefixo, modelo: folha, c1, r1, cobertas,
    // ordem de digitação: desce a coluna (como na planilha, CP por CP)
    ordemDigitacao: entradas.sort(porColuna).map(a => prefixo + a),
    revisao: revisao.sort(porPosicao).map(a => prefixo + a),
    largura: folha.cols.reduce((s, w) => s + w, 0),
    altura: folha.rows.reduce((s, h) => s + h, 0),
    // colunas da área de impressão; as seguintes aparecem só na tela (ex.: carga em t no FR-IMOB-50)
    colsImpressao,
    larguraImpressao: folha.cols.slice(0, colsImpressao).reduce((s, w) => s + w, 0),
  }
}

/**
 * Índice do modelo (calculado uma vez por modelo).
 * Fichas com frente e verso (modelo.abas) têm várias folhas; a primeira é a aba principal.
 * Os campos do índice que descrevem o desenho (modelo, c1, r1, largura, …) são os da folha principal,
 * como antes; `folhas` traz todas. `cells` tem todas as células pelo endereço completo.
 */
export function indexarModelo(modelo) {
  const folhas = [indexarFolha(modelo, null, modelo.titulo_aba || 'Frente')]
  for (const ab of modelo.abas || []) folhas.push(indexarFolha(ab, ab.id, ab.titulo || ab.id))

  const cells = {}
  const formulas = {}
  const estaticos = {}
  const papeis = { entrada: [], revisao: [], pedido: [], escolha: [], verificacao: [], assinatura: {} }
  for (const f of folhas) {
    for (const [local, d] of Object.entries(f.modelo.cells)) {
      const a = f.prefixo + local
      cells[a] = d
      if (d.fx) formulas[a] = d.fx
      else if (d.v !== undefined && !d.role) estaticos[a] = d.v
      if (d.role) {
        const t = d.role.tipo
        if (t === 'assinatura') { if (!papeis.assinatura[d.role.quem]) papeis.assinatura[d.role.quem] = a }
        else if (papeis[t]) papeis[t].push(a)
      }
    }
  }
  papeis.entrada.sort(porPosicao)
  papeis.revisao.sort(porPosicao)

  const gruposEscolha = {}
  for (const a of papeis.escolha) {
    const r = cells[a].role
    ;(gruposEscolha[r.grupo] ||= []).push({ endereco: a, opcao: r.opcao })
  }

  return {
    ...folhas[0],
    modelo, folhas, cells, formulas, estaticos, papeis, gruposEscolha,
    apelidos: modelo.apelidos || {},
    ordemDigitacao: folhas.flatMap(f => f.ordemDigitacao),
  }
}

export function estadoVazio() {
  return { entradas: {}, escolhas: {}, verificacoes: {} }
}

/** Estado a partir de dados_resultado salvos (aceita dados antigos/vazios). */
export function estadoDosDados(dados) {
  return {
    entradas: { ...(dados?.entradas || {}) },
    escolhas: { ...(dados?.escolhas || {}) },
    verificacoes: { ...(dados?.verificacoes || {}) },
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
  const cells = indice.cells
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
  motor.definirFormulas(indice.formulas, { apelidos: indice.apelidos })
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
  const verificacoes = {}
  for (const [a, v] of Object.entries(estado?.verificacoes || {})) if (v) verificacoes[a] = true
  const calculados = {}
  for (const a of Object.keys(indice.formulas)) {
    const v = normalizarSaida(motor.valores.get(a))
    if (v !== null && v !== '') calculados[a] = v
  }
  const pedido = {}
  for (const a of indice.papeis.pedido) {
    const v = motor.valores.get(a)
    if (v !== null && v !== undefined && v !== '') pedido[indice.cells[a].role.campo] = v
  }
  return {
    motor: VERSAO_MOTOR,
    modelo_id: modeloId || null,
    codigo: indice.modelo.codigo,
    versao: indice.modelo.versao,
    entradas, escolhas, pedido, calculados,
    ...(indice.papeis.verificacao.length ? { verificacoes } : {}),
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
 * Grupos da visão em lista: [{ titulo, aba, itens: [{ tipo:'entrada'|'revisao'|'escolha'|'verificacao', endereco|grupo, rotulo }] }]
 * Em fichas com frente e verso, cada folha tem os seus grupos (aba = id da folha; null = principal).
 */
export function gruposDaLista(indice, { incluirRevisao = false } = {}) {
  const cells = indice.cells
  const usados = new Set()
  const grupos = []
  const varias = indice.folhas.length > 1
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
  const textoAEsquerda = (folha, a) => {
    const p = separarEndereco(a)
    for (let c = p.c - 1; c >= folha.c1; c--) {
      const t = cells[folha.prefixo + colStr(c) + p.r]
      if (t && typeof t.v === 'string' && !t.role) return t.v
    }
    return ''
  }
  const textoADireita = (folha, a) => {
    const p = separarEndereco(a)
    const ultima = folha.c1 + folha.modelo.cols.length - 1
    for (let c = p.c + (cells[a]?.cs || 1); c <= ultima; c++) {
      const t = cells[folha.prefixo + colStr(c) + p.r]
      if (t && typeof t.v === 'string' && !t.role && t.v.trim()) return t.v.trim()
      if (t && t.rt) return t.rt.map(x => x.t).join('').trim()
    }
    return ''
  }

  for (const folha of indice.folhas) {
    const doFolha = a => (folha.prefixo ? a.startsWith(folha.prefixo) : !a.includes('!'))
    const entradasFolha = indice.papeis.entrada.filter(doFolha)
    const marcaveis = [...indice.papeis.entrada, ...indice.papeis.escolha, ...indice.papeis.verificacao].filter(doFolha)
    const defs = folha.modelo.lista?.grupos || []
    const inicio = grupos.length
    const titulo = t => (varias && folha.id ? `${folha.titulo} — ${t}` : t)

    const itemDe = (a, modoRotulo) => {
      const role = cells[a]?.role
      if (!role) return null
      if (role.tipo === 'escolha') {
        if (usados.has(`g:${role.grupo}`)) return null
        usados.add(`g:${role.grupo}`)
        indice.gruposEscolha[role.grupo].forEach(o => usados.add(o.endereco))
        const rot = textoAEsquerda(folha, indice.gruposEscolha[role.grupo][0].endereco.replace(/^.*!/, ''))
        return { tipo: 'escolha', grupo: role.grupo, rotulo: role.rotuloGrupo || rot || role.grupo, opcoes: indice.gruposEscolha[role.grupo] }
      }
      if (usados.has(a)) return null
      if (role.tipo === 'verificacao') {
        usados.add(a)
        const local = a.replace(/^.*!/, '')
        return { tipo: 'verificacao', endereco: a, rotulo: role.rot || role.texto || textoADireita(folha, a) || textoAEsquerda(folha, local) || local }
      }
      if (role.tipo !== 'entrada' && !(incluirRevisao && role.tipo === 'revisao')) return null
      usados.add(a)
      return { tipo: role.tipo, endereco: a, dado: role.dado, rotulo: rotuloDe(role, modoRotulo) || a, multilinha: !!role.ml }
    }

    for (const def of defs) {
      const modoRotulo = def.rotulo
      if (def.colunas) {
        const linhasFiltro = listaLinhas(def.linhas)
        def.colunas.forEach((col, i) => {
          const enderecos = entradasFolha.filter(a => {
            const p = separarEndereco(a)
            return colStr(p.c) === col && (!linhasFiltro || linhasFiltro.includes(p.r))
          })
          const itens = enderecos.map(a => itemDe(a, modoRotulo)).filter(Boolean)
          if (itens.length) grupos.push({ titulo: titulo(substituir(def.titulo, { n: i + 1, c: col })), aba: folha.id, itens })
        })
      } else {
        let enderecos = []
        if (def.celulas) enderecos = def.celulas.map(a => folha.prefixo + a)
        else if (def.linhas) {
          const ls = listaLinhas(def.linhas)
          enderecos = marcaveis.filter(a => ls.includes(separarEndereco(a).r)).sort(porPosicao)
        }
        const itens = enderecos.map(a => itemDe(a, modoRotulo)).filter(Boolean)
        if (itens.length) grupos.push({ titulo: titulo(def.titulo), aba: folha.id, itens })
      }
    }

    const restantes = marcaveis.filter(a => !usados.has(a)).map(a => itemDe(a)).filter(Boolean)
    if (restantes.length) {
      const t = folha.id ? folha.titulo : (grupos.length > inicio ? 'Outros campos' : 'Campos da ficha')
      grupos.push({ titulo: t, aba: folha.id, itens: restantes })
    }
  }

  if (incluirRevisao) {
    const rev = indice.papeis.revisao.filter(a => !usados.has(a)).map(a => {
      usados.add(a)
      const role = cells[a].role
      return { tipo: 'revisao', endereco: a, dado: role.dado, rotulo: rotuloDe(role) || a, multilinha: !!role.ml }
    })
    if (rev.length) grupos.push({ titulo: 'Laboratorista (parâmetros)', aba: null, itens: rev })
  }
  return grupos
}

export { colNum, colStr, separarEndereco }
