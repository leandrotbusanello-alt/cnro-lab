#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Garante que mexer no motor/conversor não muda as fichas já publicadas.
//
//   node tools/fichas/previa/comparar_motor.mjs --gravar base.json     # antes da mudança
//   node tools/fichas/previa/comparar_motor.mjs --comparar base.json   # depois (sai 1 se algo mudou)
//   … [FR-IMOB-13_Rev00 …]  só estas fichas
//
// Para cada modelo de tools/fichas/saida: 3 estados aleatórios (sementes fixas) + o estado de
// estados/<ficha>.json, se existir → todos os valores calculados, dados_resultado e linhas de resultado_*.
// Fichas que não existiam na base aparecem como "nova" (não é erro).
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { indexarModelo, calcularFicha, linhasResultado, montarDados } from '../../../src/modules/fichas/motor/ficha.js'
import { estadoAleatorio } from './estadoAleatorio.js'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SAIDA = join(AQUI, '..', 'saida')
const args = process.argv.slice(2)
const iG = args.indexOf('--gravar'), iC = args.indexOf('--comparar')
const arquivo = args[(iG >= 0 ? iG : iC) + 1]
if ((iG < 0 && iC < 0) || !arquivo) { console.error('uso: --gravar base.json | --comparar base.json [fichas…]'); process.exit(2) }
const filtro = args.filter((a, i) => !a.startsWith('--') && i !== (iG >= 0 ? iG : iC) + 1)

const limpo = v => (v && v.err ? v.err : typeof v === 'number' ? +v.toPrecision(12) : v ?? null)

function fotografar(nome) {
  const { modelo, mapa_resultados: mapa } = JSON.parse(readFileSync(join(SAIDA, `${nome}.modelo.json`), 'utf8'))
  const indice = indexarModelo(modelo)
  const estados = [11, 22, 33].map(s => ['aleatorio' + s, estadoAleatorio(indice, s)])
  const arqEstado = join(AQUI, 'estados', `${nome}.json`)
  if (existsSync(arqEstado)) {
    const e = JSON.parse(readFileSync(arqEstado, 'utf8'))
    estados.push(['estados/' + nome, { entradas: {}, escolhas: {}, verificacoes: {}, ...(e.estado || e) }])
  }
  const out = {}
  for (const [rot, estado] of estados) {
    const motor = calcularFicha(indice, estado, { os: 'OS-1', material: 'M', registro: 'R' })
    const valores = {}
    for (const a of Object.keys(indice.formulas).sort()) valores[a] = limpo(motor.valores.get(a))
    const dados = montarDados(indice, estado, motor, { modeloId: 'x' })
    delete dados.atualizado_em
    out[rot] = { valores, calculados: dados.calculados, resultados: linhasResultado(mapa || [], motor) }
  }
  return out
}

const nomes = readdirSync(SAIDA).filter(f => f.endsWith('.modelo.json')).map(f => f.replace('.modelo.json', ''))
  .filter(n => !filtro.length || filtro.includes(n)).sort()
const atual = Object.fromEntries(nomes.map(n => [n, fotografar(n)]))

if (iG >= 0) {
  writeFileSync(arquivo, JSON.stringify(atual))
  console.log(`Base gravada: ${nomes.length} fichas → ${arquivo}`)
  process.exit(0)
}
const base = JSON.parse(readFileSync(arquivo, 'utf8'))
let mudou = 0
for (const n of nomes) {
  if (!base[n]) { console.log(`${n}: nova`); continue }
  const difs = []
  for (const [rot, v] of Object.entries(atual[n])) {
    const b = base[n][rot]
    if (!b) continue
    for (const a of new Set([...Object.keys(v.valores), ...Object.keys(b.valores)])) {
      if (JSON.stringify(v.valores[a]) !== JSON.stringify(b.valores[a])) difs.push(`${rot} ${a}: ${JSON.stringify(b.valores[a])} → ${JSON.stringify(v.valores[a])}`)
    }
    if (JSON.stringify(v.resultados) !== JSON.stringify(b.resultados)) difs.push(`${rot} resultado_*: mudou`)
    if (JSON.stringify(v.calculados) !== JSON.stringify(b.calculados)) difs.push(`${rot} dados_resultado.calculados: mudou`)
  }
  console.log(difs.length ? `${n}: ✗ ${difs.length} diferença(s)` : `${n}: igual`)
  difs.slice(0, 8).forEach(d => console.log('   ' + d))
  mudou += difs.length
}
for (const n of Object.keys(base)) if (!atual[n] && (!filtro.length || filtro.includes(n))) { console.log(`${n}: sumiu`); mudou++ }
console.log(mudou ? `\n${mudou} diferença(s).` : '\nNenhuma ficha anterior mudou.')
process.exit(mudou ? 1 : 0)
