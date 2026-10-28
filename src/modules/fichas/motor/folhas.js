// ─────────────────────────────────────────────────────────────────────────────
// Folhas adicionais da mesma ficha (decisão de 20/10/2026)
//
// Quando o ensaio não cabe numa ficha (ex.: FR-IMOB-46 com mais de 21 CPs), o assistente
// acrescenta outra folha da MESMA ficha: mesmo ensaio, uma só revisão/aprovação, as assinaturas
// valem para todas as folhas. Cada folha calcula as suas médias (como no papel).
//
// estado (tela):          { entradas, escolhas, …, taras, cabecalho, extras: [estadoFolha, …] }
//   folha 1 = o próprio estado (como sempre); folha i+1 = extras[i] = { entradas, escolhas, verificacoes, fotos, ajustes }
//   taras e cabeçalho aproveitado valem para todas as folhas.
// dados_resultado (banco): o de sempre (folha 1) + folhas_extras: [{ entradas, escolhas, verificacoes,
//   fotos, ajustes, calculados }] — fichas sem folha extra continuam exatamente iguais.
// ─────────────────────────────────────────────────────────────────────────────
import { calcularFicha, montarDados, linhasResultado, situacaoPreenchimento, separarEndereco, colNum } from './ficha.js'

const partes = a => separarEndereco(a) || { aba: '?', c: 0, r: 0 }

/** Nº de folhas do estado (1 + extras). */
export function qtdFolhas(estado) {
  return 1 + (estado?.extras?.length || 0)
}

/** Estado de uma folha (0 = principal), no formato que o motor e a FichaEnsaio esperam. */
export function estadoDaFolha(estado, i) {
  if (!i) {
    if (!estado?.extras) return estado
    const { extras, ...resto } = estado   // eslint-disable-line no-unused-vars
    return resto
  }
  const f = estado?.extras?.[i - 1] || {}
  return {
    entradas: f.entradas || {}, escolhas: f.escolhas || {}, verificacoes: f.verificacoes || {},
    fotos: f.fotos || {}, ajustes: f.ajustes || {},
    ...(f.rupturas ? { rupturas: f.rupturas } : {}),
    cabecalho: estado?.cabecalho || {},
    ...(estado?.taras ? { taras: estado.taras } : {}),
  }
}

/** Estado completo com a folha i trocada por `novo`. */
export function comFolha(estado, i, novo) {
  if (!i) return { ...novo, ...(estado?.extras?.length ? { extras: estado.extras } : {}) }
  const extras = [...(estado?.extras || [])]
  extras[i - 1] = {
    entradas: novo.entradas || {}, escolhas: novo.escolhas || {}, verificacoes: novo.verificacoes || {},
    fotos: novo.fotos || {}, ajustes: novo.ajustes || {},
    ...(novo.rupturas ? { rupturas: novo.rupturas } : {}),
  }
  return { ...estado, extras }
}

/**
 * Primeira linha da área de dados da folha principal: a menor linha dos grupos da lista que não são
 * "Identificação". O que está acima dela é o cabeçalho da ficha.
 */
function linhaInicialDados(indice) {
  let min = Infinity
  const grupos = indice.modelo?.lista?.grupos || []
  for (const g of grupos) {
    if (/^identifica/i.test(g.titulo || '')) continue
    const linhas = []
    for (const c of g.celulas || []) {
      const { aba, r } = partes(c)
      if (!aba) linhas.push(r)
    }
    for (const x of [].concat(g.linhas ?? [])) {
      const m = String(x).match(/^(\d+)/)
      if (m) linhas.push(+m[1])
    }
    if (g.colunas && g.linhas === undefined) {
      // colunas sem linhas: todas as entradas dessas colunas
      const cols = g.colunas.map(colNum)
      for (const a of indice.papeis.entrada) {
        const { aba, c, r } = partes(a)
        if (!aba && cols.includes(c)) linhas.push(r)
      }
    }
    for (const r of linhas) if (r < min) min = r
  }
  return min
}

/**
 * Folha nova: vem com o cabeçalho preenchido na folha anterior (tudo o que fica acima da área de
 * dados, na frente da ficha) e as mesmas opções escolhidas; os CPs/pontos vêm em branco.
 */
export function novaFolha(indice, estadoAnterior) {
  const limite = linhaInicialDados(indice)
  const entradas = {}
  if (Number.isFinite(limite)) {
    for (const [a, v] of Object.entries(estadoAnterior?.entradas || {})) {
      const { aba, r } = partes(a)
      if (!aba && r < limite && v !== null && v !== undefined && v !== '') entradas[a] = v
    }
  }
  return { entradas, escolhas: { ...(estadoAnterior?.escolhas || {}) }, verificacoes: {}, fotos: {}, ajustes: {} }
}

/** Acrescenta uma folha ao fim (copiando o cabeçalho da última). */
export function adicionarFolha(indice, estado) {
  const n = qtdFolhas(estado)
  const nova = novaFolha(indice, estadoDaFolha(estado, n - 1))
  return { ...estado, extras: [...(estado?.extras || []), nova] }
}

/** Remove a folha i (≥ 1). */
export function removerFolha(estado, i) {
  if (!i) return estado
  const extras = (estado?.extras || []).filter((_, k) => k !== i - 1)
  if (extras.length) return { ...estado, extras }
  const { extras: _x, ...resto } = estado   // eslint-disable-line no-unused-vars
  return resto
}

/** Motor (cálculo) de cada folha. `cache` (WeakMap) evita recalcular as folhas que não mudaram. */
export function motoresDasFolhas(indice, estado, pedidoCampos, cache) {
  const out = []
  for (let i = 0; i < qtdFolhas(estado); i++) {
    const e = i ? estado.extras[i - 1] : estado
    const chave = cache && e && typeof e === 'object' ? e : null
    const guardado = chave ? cache.get(chave) : null
    if (guardado && guardado.pedidoCampos === pedidoCampos && guardado.taras === estado?.taras && guardado.cab === estado?.cabecalho) {
      out.push(guardado.motor)
      continue
    }
    const motor = calcularFicha(indice, estadoDaFolha(estado, i), pedidoCampos)
    if (chave) cache.set(chave, { motor, pedidoCampos, taras: estado?.taras, cab: estado?.cabecalho })
    out.push(motor)
  }
  return out
}

/** dados_resultado com todas as folhas. */
export function montarDadosFolhas(indice, estado, motores, opcoes) {
  const base = montarDados(indice, estadoDaFolha(estado, 0), motores[0], opcoes)
  const n = qtdFolhas(estado)
  if (n > 1) {
    base.folhas_extras = []
    for (let i = 1; i < n; i++) {
      const d = montarDados(indice, estadoDaFolha(estado, i), motores[i], opcoes)
      base.folhas_extras.push({
        entradas: d.entradas, escolhas: d.escolhas, calculados: d.calculados,
        ...(d.verificacoes ? { verificacoes: d.verificacoes } : {}),
        ...(d.fotos ? { fotos: d.fotos } : {}),
        ...(d.ajustes && Object.keys(d.ajustes).length ? { ajustes: d.ajustes } : {}),
        ...(d.rupturas && Object.keys(d.rupturas).length ? { rupturas: d.rupturas } : {}),
      })
    }
  }
  return base
}

/**
 * Linhas de resultado_* de todas as folhas — uma entrada por tabela (o servidor apaga e regrava por tabela).
 * Com `indice.rupturas` (FR-IMOB-50 Rev01), cada linha do CP leva o tipo de ruptura escolhido na folha.
 */
export function linhasResultadoFolhas(mapa, motores, { indice, estado } = {}) {
  const porTabela = new Map()
  const cfg = indice?.rupturas
  const celulaDe = cfg ? Object.fromEntries(Object.entries(cfg.celulas || {}).map(([a, c]) => [c, a])) : null
  motores.forEach((motor, i) => {
    const rupt = cfg ? estadoDaFolha(estado, i)?.rupturas || {} : null
    for (const { tabela, linhas } of linhasResultado(mapa, motor)) {
      if (!porTabela.has(tabela)) porTabela.set(tabela, [])
      const comRuptura = cfg && tabela === cfg.tabela
        ? linhas.map(l => ({ ...l, [cfg.campo]: rupt[celulaDe[l.codigo_cp]] || null }))
        : linhas
      porTabela.get(tabela).push(...comRuptura)
    }
  })
  return [...porTabela].map(([tabela, linhas]) => ({ tabela, linhas }))
}

/** Situação do preenchimento somando as folhas (inválidos das folhas extras vêm com "Folha n:"). */
export function situacaoFolhas(indice, estado) {
  const n = qtdFolhas(estado)
  const total = { preenchidos: 0, total: 0, invalidos: [], fotosPendentes: 0 }
  for (let i = 0; i < n; i++) {
    const s = situacaoPreenchimento(indice, estadoDaFolha(estado, i))
    total.preenchidos += s.preenchidos
    total.total += s.total
    total.fotosPendentes += s.fotosPendentes
    total.rupturasPendentes = (total.rupturasPendentes || 0) + (s.rupturasPendentes || 0)
    total.invalidos.push(...(i ? s.invalidos.map(a => `Folha ${i + 1}: ${a}`) : s.invalidos))
  }
  return total
}
