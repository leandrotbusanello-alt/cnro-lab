#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Teste do motor de fichas contra o Excel
//
//   node tools/fichas/testar_motor.mjs                 # compara com os valores gravados pelo Excel
//   node tools/fichas/testar_motor.mjs --libreoffice   # + 3 rodadas com valores aleatórios recalculados
//                                                      #   no LibreOffice (conferência independente)
//   node tools/fichas/testar_motor.mjs --libreoffice FR-IMOB-34 FR-IMOB-35   # só estas fichas
//   node tools/fichas/testar_motor.mjs --libreoffice --estados FR-IMOB-55    # + dados de teste de previa/estados
//
// Rode depois de python3 tools/fichas/converter.py (que gera a pasta saida/). Sai com código 1 se algo divergir.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { indexarModelo, calcularFicha, linhasResultado, montarDados } from '../../src/modules/fichas/motor/ficha.js'
import { ehErro } from '../../src/modules/fichas/motor/formulas.js'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SAIDA = join(AQUI, 'saida')
const usarLibre = process.argv.includes('--libreoffice')
const usarEstados = process.argv.includes('--estados')      // com --libreoffice: também os dados de previa/estados
const ESTADOS = join(AQUI, 'previa', 'estados')
const filtro = process.argv.slice(2).filter(a => !a.startsWith('--'))

function igual(a, b) {
  const vazioA = a === null || a === undefined || a === ''
  const vazioB = b === null || b === undefined || b === ''
  if (vazioA && (vazioB || b === 0)) return true
  if (ehErro(a)) return typeof b === 'string' && (b === a.err || (a.err === '#N/A' && b === '#N/A'))
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(b))   // 1e-8: arredondamento em contas com cancelamento (parábola da compactação)
  if (typeof a === 'boolean') return a === b || (typeof b === 'number' && +a === b)   // LibreOffice grava FALSO/VERDADEIRO de IF sem "senão" como 0/1
  return String(a) === String(b)
}

// Erro × erro de tipo diferente: quando dois erros se combinam numa conta (p.ex. #DIV/0! * #N/A), o Excel devolve o
// da esquerda e o LibreOffice às vezes o outro. Não é divergência de cálculo: conta à parte (aviso), não como falha.
const ehTextoErro = x => typeof x === 'string' && /^#[A-Z/0!?]+[!?A]?$/.test(x)
function comparar(indice, motor, esperado, errosCruzados = []) {
  const dif = []
  for (const [a, ex] of Object.entries(esperado)) {
    if (!(a in indice.formulas)) continue
    const v = motor.valores.get(a)
    if (igual(v === undefined ? null : v, ex)) continue
    if (ehErro(v) && ehTextoErro(ex)) { errosCruzados.push(a); continue }
    dif.push({ a, sistema: ehErro(v) ? v.err : v, excel: ex })
  }
  return dif
}

// Gerador determinístico (resultados reproduzíveis)
let semente = 12345
const aleatorio = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648)

function valoresAleatorios(indice, exemplo) {
  const out = {}
  for (const a of indice.papeis.entrada) {
    const role = indice.cells[a].role
    if (aleatorio() < 0.15) continue                                // alguns vazios, como na vida real
    if (role.dado === 'data') out[a] = 46000 + Math.floor(aleatorio() * 400)
    else if (role.dado === 'hora') out[a] = Math.floor(aleatorio() * 1440) / 1440
    else if (role.opcoes?.length) out[a] = role.opcoes[Math.floor(aleatorio() * role.opcoes.length)]
    else if (role.dado === 'texto') out[a] = `T${Math.floor(aleatorio() * 100)}`
    else {
      const base = typeof exemplo[a] === 'number' ? exemplo[a] : 10 + aleatorio() * 1000
      out[a] = +(base * (0.9 + aleatorio() * 0.2)).toFixed(3)
    }
  }
  return out
}

let falhas = 0
for (const arq of readdirSync(SAIDA).filter(f => f.endsWith('.modelo.json')).sort()) {
  const nome = arq.replace('.modelo.json', '')
  if (filtro.length && !filtro.some(c => nome.startsWith(c))) continue
  const { modelo, mapa_resultados: mapa } = JSON.parse(readFileSync(join(SAIDA, arq), 'utf8'))
  const verif = JSON.parse(readFileSync(join(SAIDA, `${nome}.verificacao.json`), 'utf8'))
  const indice = indexarModelo(modelo)
  const nFormulas = Object.keys(indice.formulas).length

  // 1) Dados do exemplo x valores gravados pelo Excel
  const temExemplo = indice.papeis.entrada.some(a => verif.exemplo[a] !== undefined)
  if (temExemplo) {
    const entradas = {}
    for (const a of [...indice.papeis.entrada, ...indice.papeis.revisao]) if (verif.exemplo[a] !== undefined) entradas[a] = verif.exemplo[a]
    const motor = calcularFicha(indice, { entradas, escolhas: {}, verificacoes: verif.verificacoes || {} }, verif.pedido_exemplo)
    const dif = comparar(indice, motor, verif.excel)
    console.log(`${nome}: exemplo do Excel → ${nFormulas - dif.length}/${nFormulas} fórmulas iguais`)
    dif.slice(0, 10).forEach(d => console.log(`   ✗ ${d.a}: sistema ${JSON.stringify(d.sistema)} · Excel ${JSON.stringify(d.excel)}`))
    falhas += dif.length
    const res = linhasResultado(mapa, motor)
    res.forEach(r => console.log(`   → ${r.tabela}: ${r.linhas.length} linha(s)`, JSON.stringify(r.linhas[0] || {})))
    const dados = montarDados(indice, { entradas, escolhas: {}, verificacoes: verif.verificacoes || {} }, motor, { modeloId: 'teste' })
    console.log(`   → dados_resultado: ${Object.keys(dados.entradas).length} entradas, ${Object.keys(dados.calculados).length} calculados, ${JSON.stringify(dados).length} bytes`)
  } else {
    console.log(`${nome}: planilha sem dados de exemplo (use --libreoffice para conferir os cálculos)`)
  }

  // 2) Valores aleatórios recalculados pelo LibreOffice
  if (usarLibre) {
    const tmp = mkdtempSync(join(tmpdir(), 'fichas-'))
    // rodadas 1–3: valores aleatórios; com --estados, também os dados de teste de previa/estados/<ficha>*.json
    const rodadas = [1, 2, 3].map(n => ({ rotulo: `rodada ${n}` }))
    if (usarEstados) {
      for (const f of readdirSync(ESTADOS).filter(f => f.endsWith('.json') && (f === `${nome}.json` || f.startsWith(`${nome}__`))).sort()) {
        const e = JSON.parse(readFileSync(join(ESTADOS, f), 'utf8'))
        rodadas.push({ rotulo: `estado ${f.replace('.json', '')}`, entradas: e.estado.entradas, escolhas: e.estado.escolhas || {} })
      }
    }
    for (const [i, rd] of rodadas.entries()) {
      const rodada = i + 1
      const entradas = rd.entradas || valoresAleatorios(indice, verif.exemplo)
      // escolhas (Sim/Não, marcas "X"): uma opção sorteada por grupo
      const escolhas = rd.escolhas || {}
      if (!rd.entradas) {
        for (const [g, ops] of Object.entries(indice.gruposEscolha)) {
          if (aleatorio() < 0.3) continue
          escolhas[g] = ops[Math.floor(aleatorio() * ops.length)].opcao
        }
      }
      const arqIn = join(tmp, `in${rodada}.json`), arqOut = join(tmp, `out${rodada}.json`)
      const planilha = { ...entradas }
      for (const a of [...indice.papeis.entrada, ...indice.papeis.revisao, ...indice.papeis.pedido]) if (!(a in planilha)) planilha[a] = null
      for (const a of indice.papeis.escolha) {
        const r = indice.cells[a].role
        if (r.marca) planilha[a] = escolhas[r.grupo] === r.opcao ? r.marca : null
      }
      // fórmulas acrescentadas pela spec (não existem na planilha original): grava na cópia
      for (const [a, d] of Object.entries(indice.cells)) {
        if (d.fxi) planilha[a] = `=${d.fx}`
        if (d.vx) planilha[a] = d.v                     // valor posto pela spec (celulas_extras)
      }
      Object.assign(planilha, verif.extras_aux || {})    // valores da spec em células auxiliares (tabela de taras)
      for (const f of indice.folhas) {                    // auxiliares com fórmula da spec
        for (const [a, d] of Object.entries(f.modelo.aux || {})) if (d.fxi) planilha[f.prefixo + a] = `=${d.fx}`
      }
      // frente e verso: 'VERSO!F7' → '<nome da aba no Excel>!F7' (e de volta na saída)
      const abasExcel = verif.abas_excel || {}
      const paraExcel = a => { const m = /^([A-Z][A-Z0-9_]*)!(.+)$/.exec(a); return m && abasExcel[m[1]] ? `${abasExcel[m[1]]}!${m[2]}` : a }
      const deExcel = Object.fromEntries(Object.entries(abasExcel).filter(([id]) => id).map(([id, nome]) => [nome, id]))
      writeFileSync(arqIn, JSON.stringify(Object.fromEntries(Object.entries(planilha).map(([a, v]) => [paraExcel(a), v]))))
      execFileSync('python3', [join(AQUI, 'recalcular_libreoffice.py'), join(AQUI, 'planilhas', `${nome}.xlsx`), abasExcel[''] || '', arqIn, arqOut])
      const esperado = Object.fromEntries(Object.entries(JSON.parse(readFileSync(arqOut, 'utf8'))).map(([a, v]) => {
        const i = a.lastIndexOf('!')
        return [i > 0 && deExcel[a.slice(0, i)] ? `${deExcel[a.slice(0, i)]}!${a.slice(i + 1)}` : a, v]
      }))
      const motor = calcularFicha(indice, { entradas, escolhas, verificacoes: {} }, {})
      const cruzados = []
      const dif = comparar(indice, motor, esperado, cruzados)
      if (cruzados.length) console.log(`   ⚠ ${cruzados.length} célula(s) com erro nos dois, de tipo diferente (precedência de erros do LibreOffice): ${cruzados.slice(0, 5).join(', ')}…`)
      if (rodada === 1) {
        const res = linhasResultado(mapa, motor)
        res.forEach(r => console.log(`   → ${r.tabela}: ${r.linhas.length} linha(s)`, JSON.stringify(r.linhas[0] || {})))
      }
      console.log(`${nome}: ${rd.rotulo} (LibreOffice, ${Object.keys(entradas).length} entradas) → ${nFormulas - dif.length}/${nFormulas} iguais`)
      dif.slice(0, +(process.env.MAXDIF || 8)).forEach(d => console.log(`   ✗ ${d.a}: sistema ${JSON.stringify(d.sistema)} · LibreOffice ${JSON.stringify(d.excel)}`))
      falhas += dif.length
    }
  }
}

console.log(falhas ? `\n${falhas} divergência(s).` : '\nTudo confere.')
process.exit(falhas ? 1 : 0)
