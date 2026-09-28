#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Teste do motor dos quadros de controle com dados simulados (sem banco) + conta à mão.
//   node tools/fichas/quadros/testar_quadros.mjs [--gravar-estados]
// --gravar-estados: grava os dados simulados em tools/fichas/previa/estados/quadro_<CODIGO>.json
//                   (prévia de impressão: python3 tools/fichas/previa/imprimir.py --quadro FR-IMOB-39)
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { QUADROS } from '../../../src/modules/quadros/definicoes.js'
import { montarQuadro, expandirModelo, isoParaSerial, lambdaK, desvio } from '../../../src/modules/quadros/motorQuadros.js'
import { indexarModelo, calcularFicha } from '../../../src/modules/fichas/motor/ficha.js'

const AQUI = dirname(fileURLToPath(import.meta.url))
const MODELOS = join(AQUI, '../../../src/modules/quadros/modelos')
const gravar = process.argv.includes('--gravar-estados')
let falhas = 0
// banco simulado para a prévia da tela (tools/fichas/previa: ?tela=quadros)
const banco = { pedidos_ensaio: [], ensaios_os: [], fichas_os: [], empresas: [] }
let idRes = 0
function paraBanco(dados) {
  banco.pedidos_ensaio.push(...dados.pedidos.map(p => ({ status: 'em_andamento', ...p })))
  for (const e of dados.ensaios) {
    const resultado_id = `r${++idRes}`
    banco.ensaios_os.push({ id: `eo${idRes}`, pedido_id: e.pedido_id, status: 'aprovado', dados_resultado: e.dados_resultado, resultado_id })
    for (const [t, linhas] of Object.entries(e.resultados || {})) (banco[t] ||= []).push(...linhas.map(l => ({ ...l, resultado_id })))
  }
  for (const [id, obra] of Object.entries(dados.obraPorFichaOs || {})) if (!banco.fichas_os.some(f => f.id === id)) banco.fichas_os.push({ id, obra })
}
const ok = (cond, msg) => { if (!cond) { falhas++; console.log('   ✗', msg) } }
const perto = (a, b, msg) => ok(typeof a === 'number' && Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${msg}: sistema ${a} · à mão ${b}`)
const avg = v => v.reduce((s, x) => s + x, 0) / v.length

const EMPRESAS = { e1: { id: 'e1', nome: 'Construtora Alfa', lote: 'Lote 3' }, e2: { id: 'e2', nome: 'Usina Beta', lote: 'Lote 5' } }
let seq = 90
function pedido(material, sub_tipo, amostra, extra = {}) {
  seq++
  return { id: `p${seq}`, numero_pe: seq, ano: 2026, material, sub_tipo, dados_amostra: [amostra], empresa_id: 'e1', lote: 'Lote 3', created_at: '2026-09-01T12:00:00Z', ...extra }
}

function verificar(codigo, dados, filtros, conferir) {
  paraBanco(dados)
  const def = QUADROS[codigo]
  const { modelo, quadro: meta } = JSON.parse(readFileSync(join(MODELOS, `${codigo}.json`), 'utf8'))
  const r = montarQuadro(def, dados, filtros, meta)
  const exp = expandirModelo(modelo, meta, r.n)
  const ind = indexarModelo(exp)
  const desconhecidas = Object.keys(r.entradas).filter(a => !ind.papeis.entrada.includes(a))
  ok(!desconhecidas.length, `${codigo}: endereços fora do modelo: ${desconhecidas.slice(0, 8)}`)
  const motor = calcularFicha(ind, { entradas: r.entradas, escolhas: {}, verificacoes: {} }, {})
  ok(!!motor, `${codigo}: ficha calculada`)
  conferir(r, meta)
  console.log(`${codigo}: ${r.linhas.length} linha(s) no período · ${r.total} no global · ${Object.keys(r.entradas).length} valores · ${exp.rows.length} linhas no modelo${r.avisos.length ? ' · avisos: ' + r.avisos.join(' | ') : ''}`)
  if (gravar) {
    writeFileSync(join(AQUI, '../previa/estados', `quadro_${codigo}.json`), JSON.stringify({
      _nota: 'Dados simulados do teste dos quadros (tools/fichas/quadros/testar_quadros.mjs).', quadro: codigo, n: r.n, entradas: r.entradas }, null, 1))
  }
  return r
}

// ── FR-39 agregado ──
{
  const peds = [
    pedido('solos', 'agregados', { tipo_agregado: 'Brita 1', origem: 'Pedreira Serra', data_coleta: '2026-09-05', local_aplicacao: 'Usina km 12' }),
    pedido('solos', 'agregados', { tipo_agregado: 'Brita 1', origem: 'Pedreira Serra', data_coleta: '2026-09-15' }),
    pedido('solos', 'agregados', { tipo_agregado: 'Brita 1', origem: 'Pedreira Serra', data_coleta: '2026-06-10' }),   // fora do período
    pedido('solos', 'agregados', { tipo_agregado: 'Areia', origem: 'Porto Rio', data_coleta: '2026-09-07' }),          // outro tipo
  ]
  const fr11 = (h, q) => ({ codigo: 'FR-IMOB-11', versao: 'Rev00', calculados: { H30: h[0], H31: h[1], H33: h[2], H34: h[3], H35: h[4], H36: h[5], H37: h[6], H38: h[7], H39: h[8], Q30: q[0], Q31: q[1], Q33: q[2], Q34: q[3], Q35: q[4], Q36: q[5], Q37: q[6], Q38: q[7], Q39: q[8] }, entradas: {} })
  const g = [[1, 0.98, 0.6, 0.3, 0.05, 0.03, 0.02, 0.015, 0.01], [1, 0.96, 0.58, 0.28, 0.06, 0.035, 0.022, 0.016, 0.011], [1, 0.97, 0.55, 0.25, 0.04, 0.02, 0.015, 0.012, 0.008]]
  const dens = (real, abs) => ({ resultado_densidade_agregado_graudo: [{ densidade_real: real, absorcao_pct: abs }, { densidade_real: real + 0.004, absorcao_pct: abs + 0.1 }] })
  const ensaios = [
    { pedido_id: peds[0].id, dados_resultado: fr11(g[0], g[1]) },
    { pedido_id: peds[0].id, dados_resultado: { codigo: 'FR-IMOB-37' }, resultados: { resultado_indice_forma: [{ metodo: 'Paquímetro', indice_forma_pct: 2.36 }] } },
    { pedido_id: peds[0].id, dados_resultado: { codigo: 'FR-IMOB-06' }, resultados: dens(2.705, 0.6) },
    { pedido_id: peds[1].id, dados_resultado: fr11(g[1], g[2]) },
    { pedido_id: peds[1].id, dados_resultado: { codigo: 'FR-IMOB-31' }, resultados: { resultado_indice_forma: [{ metodo: 'Crivos', indice_forma_pct: 0.8 }] } },   // crivos não entra
    { pedido_id: peds[1].id, dados_resultado: { codigo: 'FR-IMOB-06' }, resultados: dens(2.712, 0.5) },
    { pedido_id: peds[2].id, dados_resultado: fr11(g[2], g[2]) },
    { pedido_id: peds[3].id, dados_resultado: fr11(g[0], g[0]) },
  ]
  verificar('FR-IMOB-39', { pedidos: peds, ensaios, empresasPorId: EMPRESAS }, { inicio: '2026-09-01', fim: '2026-09-30', tipo: 'Brita 1' }, (r, meta) => {
    ok(r.linhas.length === 2, 'FR-39: 2 amostras no período (tipo Brita 1)')
    const L0 = meta.bloco.linha
    perto(r.entradas[`F${L0}`], (0.98 + 0.96) / 2 * 100, 'FR-39 3/4" amostra 1')
    perto(r.entradas[`F${L0 + 1}`], (0.96 + 0.97) / 2 * 100, 'FR-39 3/4" amostra 2')
    perto(r.entradas[`P${L0}`], 2.36, 'FR-39 IF paquímetro')
    ok(r.entradas[`P${L0 + 1}`] === undefined, 'FR-39: IF por crivos não entra')
    perto(r.entradas[`Q${L0}`], (2.705 + 2.709) / 2, 'FR-39 massa específica real')
    perto(r.entradas[`S${L0 + 1}`], (0.5 + 0.6) / 2, 'FR-39 absorção')
    perto(r.entradas[`O${L0}`], 19.1, 'FR-39 Dmáx (NBR NM 248: retido acumulado 3/4" = 3% ≤ 5%, 1/2" = 41%)')
    ok(r.entradas[`T${L0}`] === 'Usina km 12' && r.entradas[`U${L0}`] === 'Pedreira Serra', 'FR-39 local e procedência')
    ok(r.entradas[`D${L0}`] === isoParaSerial('2026-09-05'), 'FR-39 data da coleta')
    // estatísticas: endereço depois da expansão
    const a = Object.entries(meta.estatisticas).find(([, e]) => e.col === 'F' && e.fn === 'media' && e.escopo === 'periodo')[0]
    const aExp = a.replace(/\d+$/, m => +m + (r.n - 1) * meta.bloco.altura)
    perto(r.entradas[aExp], avg([(0.98 + 0.96) / 2 * 100, (0.96 + 0.97) / 2 * 100]), 'FR-39 média do período 3/4"')
    const gl = Object.entries(meta.estatisticas).find(([, e]) => e.col === 'F' && e.fn === 'desvio')[0].replace(/\d+$/, m => +m + (r.n - 1) * meta.bloco.altura)
    perto(r.entradas[gl], desvio([(0.98 + 0.96) / 2 * 100, (0.96 + 0.97) / 2 * 100, 97]), 'FR-39 desvio global 3/4" (3 amostras Brita 1)')
  })
}

// ── FR-40 CAP ──
{
  const peds = [pedido('asfalto', 'ligante_asfaltico', { tipo_ligante: 'CAP 50/70', fornecedor: 'Distribuidora X', data_coleta: '2026-09-10' })]
  const ensaios = [
    { pedido_id: peds[0].id, dados_resultado: { codigo: 'FR-IMOB-14', versao: 'Rev00', entradas: { G56: 2.1, G59: 0.3 } },
      resultados: { resultado_penetracao: [{ penetracao_media: 55 }], resultado_ponto_amolecimento: [{ media_c: 60.5 }], resultado_recuperacao_elastica: [{ recuperacao_obtida_pct: 88 }], resultado_viscosidade: [{ viscosidade_135c_cp: 1450, viscosidade_150c_cp: 720, viscosidade_177c_cp: 250 }] } },
  ]
  verificar('FR-IMOB-40', { pedidos: peds, ensaios, empresasPorId: EMPRESAS }, {}, (r, meta) => {
    const L0 = meta.bloco.linha
    perto(r.entradas[`E${L0}`], 55, 'FR-40 penetração'); perto(r.entradas[`H${L0}`], 2.1, 'FR-40 separação de fase')
    perto(r.entradas[`K${L0}`], 250, 'FR-40 viscosidade 177'); perto(r.entradas[`L${L0}`], 0.3, 'FR-40 RTFOT')
    ok(r.entradas[`N${L0}`] === 'Distribuidora X', 'FR-40 procedência')
  })
}

// ── FR-42 CBUQ fresco ──
{
  const peds = [pedido('asfalto', 'massa_asfaltica', { tipo_mistura: 'CBUQ Faixa C', data_aplicacao: '2026-09-12', pista: 'Norte', estaca: '120' }, { empresa_id: 'e2' })]
  const cps = [{ gmb_obtido: 2.401, va_pct: 4.1, vam_pct: 15.2, rbv_pct: 73, estabilidade_kgf: 980, fluencia_mm: 3.2, resistencia_tracao_mpa: 1.05, gmm_referencia: 2.5 },
               { gmb_obtido: 2.395, va_pct: 4.3, vam_pct: 15.4, rbv_pct: 72, estabilidade_kgf: 1010, fluencia_mm: 3.0, resistencia_tracao_mpa: 1.1, gmm_referencia: 2.5 }]
  const ensaios = [
    { pedido_id: peds[0].id, dados_resultado: { codigo: 'FR-IMOB-13', versao: 'Rev00', calculados: { D34: 0.8, F34: 1.0 } }, resultados: { resultado_marshall: cps } },
    { pedido_id: peds[0].id, dados_resultado: { codigo: 'FR-IMOB-10' }, resultados: { resultado_rice: [{ gmm_obtido: 2.498 }, { gmm_obtido: 2.502 }] } },
    { pedido_id: peds[0].id, dados_resultado: { codigo: 'FR-IMOB-22' }, resultados: { resultado_teor_betume: [{ teor_obtido_pct: 5.4 }] } },
    { pedido_id: peds[0].id, dados_resultado: { codigo: 'FR-IMOB-21', versao: 'Rev01', calculados: { L21: 100, L22: 99.1, L25: 55.3, L29: 5.9 } } },
  ]
  verificar('FR-IMOB-42', { pedidos: peds, ensaios, empresasPorId: EMPRESAS }, {}, (r, meta) => {
    const L0 = meta.bloco.linha
    perto(r.entradas[`P${L0}`], (2.401 + 2.395) / 2, 'FR-42 Gmb médio'); perto(r.entradas[`Q${L0}`], 2.5, 'FR-42 Gmm (Rice)')
    perto(r.entradas[`R${L0}`], 995, 'FR-42 estabilidade'); perto(r.entradas[`X${L0}`], 0.9, 'FR-42 absorção')
    perto(r.entradas[`I${L0}`], 55.3, 'FR-42 nº4'); perto(r.entradas[`O${L0}`], 5.4, 'FR-42 teor')
    ok(r.entradas[`Z${L0}`] === 'Usina Beta' && r.entradas[`Y${L0}`] === 'Norte · Est. 120', 'FR-42 local e procedência')
  })
}

// ── FR-41 CBUQ endurecido ──
{
  const peds = [pedido('asfalto', 'cps_extraidos_pista', { tipo_mistura: 'CBUQ Faixa C', data_extracao: '2026-09-20', espessura: 5.1 })]
  const ensaios = [{ pedido_id: peds[0].id, dados_resultado: { codigo: 'FR-IMOB-22' }, resultados: { resultado_teor_betume: [{ teor_obtido_pct: 5.2 }] } }]
  verificar('FR-IMOB-41', { pedidos: peds, ensaios, empresasPorId: EMPRESAS }, {}, (r, meta) => {
    const L0 = meta.bloco.linha
    perto(r.entradas[`N${L0}`], 5.2, 'FR-41 teor'); perto(r.entradas[`V${L0}`], 5.1, 'FR-41 espessura (campo, enquanto não há FR-46)')
    ok(r.entradas[`O${L0}`] === undefined, 'FR-41 Gmb vazio (FR-46 pendente)')
  })
}

// ── FR-43 concreto ──
{
  const fck = 30
  const r28 = [[33.1, 32.5], [31.0, 31.8], [29.4, 30.2], [34.0, 33.2], [32.2, 31.6], [30.5, 31.1], [35.0, 34.2]]
  const r7 = r28.map(p => p.map(x => +(x * 0.7).toFixed(1)))
  const entradas = { B17: fck }
  const escolhas = {}
  r28.forEach((p, k) => {
    const r = 20 + 2 * k
    Object.assign(entradas, { [`B${r}`]: isoParaSerial(`2026-08-${String(10 + k).padStart(2, '0')}`), [`E${r}`]: 100 + k * 5, [`I${r}`]: 0.375, [`S${r}`]: `Pilar P${k + 1}` })
    escolhas[`lancamento_${k + 1}`] = 'Bombeado'
  })
  const calculados = {}
  r28.forEach((p, k) => { const r = 20 + 2 * k; calculados[`P${r}`] = p[0]; calculados[`P${r + 1}`] = p[1]; calculados[`N${r}`] = r7[k][0]; calculados[`N${r + 1}`] = r7[k][1] })
  const peds = [
    pedido('concreto', 'concreto', { tipo_concreto: 'Estrutural C30', resistencia_fck: '30', local: 'Viaduto km 40' }, { ficha_os_id: 'fo1' }),
    pedido('concreto', 'concreto', { tipo_concreto: 'Estrutural C40', resistencia_fck: '40' }, { ficha_os_id: 'fo1' }),
  ]
  const ensaios = [
    { pedido_id: peds[0].id, dados_resultado: { codigo: 'FR-IMOB-50', versao: 'Rev00', entradas, calculados, escolhas } },
    { pedido_id: peds[1].id, dados_resultado: { codigo: 'FR-IMOB-50', versao: 'Rev00', entradas: { B17: 40, B20: isoParaSerial('2026-08-12') }, calculados: { P20: 45, P21: 44 } } },
  ]
  verificar('FR-IMOB-43', { pedidos: peds, ensaios, empresasPorId: EMPRESAS, obraPorFichaOs: { fo1: 'Duplicação BR-163' } }, { fck: '30', obra: 'Duplicação BR-163' }, (r, meta) => {
    ok(r.linhas.length === 7, 'FR-43: 7 séries do fck 30')
    const Q = r28.map(avg)
    const Xn = avg(Q), Sn = desvio(Q)
    const { lambda, K } = lambdaK(7)
    ok(lambda === 1.77 && K === 3, 'FR-43 λ e K para n = 7 (1,77 e 3)')
    perto(r.entradas.P12, Xn, 'FR-43 Xn'); perto(r.entradas.P13, Sn, 'FR-43 Sn'); perto(r.entradas.P14, Sn / Xn * 100, 'FR-43 Vn')
    perto(r.entradas.T13, Xn - 1.77 * Sn, 'FR-43 fck estimado')
    perto(r.entradas.S14, Math.min(...Q), 'FR-43 Xmín')
    const V1 = 0.8865 * avg(r28.map(p => Math.abs(p[0] - p[1]))) / Xn * 100
    perto(r.entradas.P15, V1, 'FR-43 V1')
    const conf = (Xn - 1.77 * Sn) >= fck && Math.min(...Q) >= fck - K ? 'CONFORME' : 'NÃO CONFORME'
    ok(r.entradas.E14 === conf, `FR-43 conformidade (${conf})`)
    ok(r.entradas.E12 === 'n < 30 AMOSTRAS', 'FR-43 padrão de produção com n < 30')
    const L0 = meta.bloco.linha
    perto(r.entradas[`Q${L0 + 2 * 2}`], Q[2], 'FR-43 média 28 dias da 3ª série')
    const mm3 = avg(Q.slice(0, 3))
    ok(r.entradas[`S${L0 + 2 * 2}`] === `${(Math.round(mm3 * 10) / 10).toLocaleString('pt-BR')} ${mm3 >= fck ? '≥' : '<'} 30 ${mm3 >= fck ? 'OK' : 'NC'}`, `FR-43 média móvel da 3ª série: ${r.entradas[`S${L0 + 4}`]}`)
    ok(r.entradas[`T${L0 + 4}`] === `${(Math.round(Q[2] * 10) / 10).toLocaleString('pt-BR')} ≥ 27 OK`, `FR-43 Xmín da série vs fck − K: ${r.entradas[`T${L0 + 4}`]}`)
    perto(r.entradas[`I${L0}`], 10, 'FR-43 slump em cm')
    ok(r.entradas.C9 === 'Estrutural C30' && r.entradas.G9 === 'Bombeado', `FR-43 traço e lançamento: ${r.entradas.C9} / ${r.entradas.G9}`)
    ok(r.entradas.W13 === 30 && r.entradas.C15 === 7, 'FR-43 fck e nº de séries')
  })
  // λ/K nos limites
  ok(lambdaK(5).lambda === 'N<6' && lambdaK(5).K === 1 && lambdaK(15).lambda === 1.48 && lambdaK(15).K === 4 && lambdaK(16).K === 3, 'λ/K: n < 6, n = 15 e n > 15')
}

if (gravar) {
  banco.empresas = Object.values(EMPRESAS)
  writeFileSync(join(AQUI, '../previa/estados', 'banco_quadros.json'), JSON.stringify(banco, null, 1))
}
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo confere.')
process.exit(falhas ? 1 : 0)
