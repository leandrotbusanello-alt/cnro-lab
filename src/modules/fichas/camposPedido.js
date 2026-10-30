// ─────────────────────────────────────────────────────────────────────────────
// Dados do pedido que preenchem o cabeçalho das fichas (células de papel "pedido")
//   os · registro · material · procedencia · complemento · pe · lote · rodovia · empresa
// ─────────────────────────────────────────────────────────────────────────────
import {
  normalizarAmostras, rotuloMaterial, rotuloSubtipo, nomeEmpresa,
} from '../laboratorio/utils'
import { normalizarKm } from '../../lib/km'

/** "2026.03.06.02.0094" (sem o prefixo "O.S.") */
function numeroOSTexto(p) {
  if (!p?.numero_os) return ''
  return String(p.numero_os).replace(/^O\.S\.\s*/, '')
}

/** Registro da amostra no formato das fichas: "094/2026" */
function registroAmostra(p) {
  const n = parseInt(p?.numero_pe ?? p?.sequencial, 10)
  if (!Number.isFinite(n)) return ''
  const ano = p.ano ?? (p.created_at ? new Date(p.created_at).getFullYear() : '')
  return `${String(n).padStart(3, '0')}/${ano}`
}

// Campos da amostra que descrevem o material (entram em "Material")
const CAMPOS_MATERIAL = ['tipo_mistura', 'tipo_ligante', 'tipo_agregado', 'granulometria', 'traco', 'cap', 'teor_cimento', 'fck']

function descricaoMaterial(p, amostras) {
  if (SUBTIPOS_CONCRETO.includes(p.sub_tipo)) return materialConcreto(amostras)
  const partes = []
  const base = rotuloSubtipo(p.material, p.sub_tipo) || rotuloMaterial(p.material)
  if (base) partes.push(base)
  const a = amostras[0] || {}
  for (const k of CAMPOS_MATERIAL) {
    if (a[k] === undefined || a[k] === null || a[k] === '') continue
    if (k === 'fck') partes.push(`fck ${a[k]} MPa`)
    else if (k === 'teor_cimento') partes.push(`${a[k]}% de cimento`)
    else if (k === 'cap') partes.push(`CAP ${a[k]}`)
    else partes.push(String(a[k]))
  }
  return [...new Set(partes)].join(' · ')
}

// Concreto (FR-IMOB-50 Rev01 — 28/10/2026): "CPs 2479 A 2484 | FUNDAÇÃO DAS ESTACAS P02 - PONTE RIBEIRÃO ESPINHEIRO KM 469"
const SUBTIPOS_CONCRETO = ['concreto', 'cp_concreto']
const maiusc = v => String(v || '').trim().toUpperCase()

function materialConcreto(amostras) {
  const dim = String(amostras[0]?.dimensoes_cp || '').replace(/\s/g, '').toLowerCase()
  if (dim === '5x10') return 'CORPOS DE PROVA DE ARGAMASSA (DIÂMETRO 5 x 10 cm)'
  if (dim === '10x20') return 'CORPOS DE PROVA DE CONCRETO (DIÂMETRO 10 x 20 cm)'
  return 'CORPOS DE PROVA DE CONCRETO'
}

function complementoConcreto(amostras) {
  const ids = amostras.map(a => String(a.identificacao_cp || '').trim()).filter(Boolean)
  const cps = ids.length > 1 ? `CPs ${ids[0]} A ${ids.at(-1)}` : ids.length ? `CP ${ids[0]}` : ''
  const a0 = amostras[0] || {}
  const local = [maiusc(a0.elemento || a0.estrutura), maiusc(a0.local_concretagem || a0.local)].filter(Boolean).join(' - ')
  return [cps, local].filter(Boolean).join(' | ')
}

// ── Cabeçalho resumido (29/10/2026) ──────────────────────────────────────────
// Informações complementares: só a data (coleta, extração, moldagem…) e o trecho/local.
// O restante do pedido fica na FR-IMOB-04/05 e no Detalhar demanda.

/** Datas das amostras, na ordem de prioridade: a primeira que existir dá o rótulo */
const DATAS_REFERENCIA = [
  ['data_coleta', 'DATA DA COLETA'],
  ['data_extracao', 'DATA DE EXTRAÇÃO'],
  ['data_moldagem', 'DATA DA MOLDAGEM'],
  ['data_aplicacao', 'DATA DE APLICAÇÃO'],
  ['data_usinagem', 'DATA DE USINAGEM'],
  ['data_chegada', 'DATA DE CHEGADA'],
]

const fmtData = d => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

function dataReferencia(amostras) {
  for (const [k, rotulo] of DATAS_REFERENCIA) {
    const dias = [...new Set(amostras.map(a => String(a[k] || '').slice(0, 10)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort()
    if (!dias.length) continue
    if (dias.length === 1) return `${rotulo}: ${fmtData(dias[0])}`
    return `${rotulo}: ${fmtData(dias[0])} A ${fmtData(dias.at(-1))}`
  }
  return ''
}

const valorKm = t => { const m = /^(\d+),(\d+)$/.exec(t); return m ? Number(`${m[1]}.${m[2]}`) : null }

/** Trecho: "KM 120,000" · "KM 120,000 E KM 125,000" · "KM 120,000 AO KM 135,500" */
function trechoAmostras(amostras) {
  const pontos = [...new Set(amostras
    .map(a => a.km_extracao || a.km_coleta || a.estaca_extracao || a.estaca || a.km)
    .filter(Boolean).map(v => normalizarKm(String(v))).filter(Boolean))]
  const ini = amostras.map(a => a.km_inicial || a.estaca_inicial).find(Boolean)
  const fim = [...amostras].reverse().map(a => a.km_final || a.estaca_final).find(Boolean)
  if (!pontos.length && (ini || fim)) {
    return [ini && `KM ${normalizarKm(String(ini))}`, fim && `KM ${normalizarKm(String(fim))}`].filter(Boolean).join(' AO ')
  }
  if (!pontos.length) return ''
  if (pontos.length === 1) return `KM ${pontos[0]}`
  const num = pontos.map(valorKm)
  if (pontos.length === 2 || num.some(v => v === null)) return pontos.map(k => `KM ${k}`).join(' E ')
  const ord = pontos.map((k, i) => [num[i], k]).sort((a, b) => a[0] - b[0])
  return `KM ${ord[0][1]} AO KM ${ord.at(-1)[1]}`
}

function textoComplementar(p, amostras) {
  if (SUBTIPOS_CONCRETO.includes(p.sub_tipo)) return complementoConcreto(amostras)
  return [dataReferencia(amostras), trechoAmostras(amostras)].filter(Boolean).join(' · ')
}

// Procedência: jazida (solos), pedreira (agregados), concreteira/central (concreto); demais: empresa
const semPrefixo = (v, re) => String(v || '').trim().replace(re, '').trim()

function procedenciaMaterial(p, amostras, empresa) {
  const unicos = k => [...new Set(amostras.map(a => String(a[k] || '').trim()).filter(Boolean))]
  if (['jazida', 'caixa_emprestimo', 'segmento'].includes(p.sub_tipo)) {
    const j = unicos('jazida').map(v => semPrefixo(v, /^jazida\s*/i))
    if (j.length) return `JAZIDA ${j.join(' / ')}`.toUpperCase()
  }
  if (p.sub_tipo === 'agregados') {
    const q = unicos('pedreira').map(v => semPrefixo(v, /^pedreira\s*/i))
    if (q.length) return `PEDREIRA ${q.join(' / ')}`.toUpperCase()
  }
  if (SUBTIPOS_CONCRETO.includes(p.sub_tipo)) {
    const c = unicos('concreteira')
    if (c.length) return c.join(' / ').toUpperCase()
  }
  return empresa
}

/**
 * @param pedido  registro de pedidos_ensaio
 * @param ctx     { empresasPorId }
 */
export function camposDoPedido(pedido, ctx = {}) {
  if (!pedido) return {}
  const amostras = normalizarAmostras(pedido.dados_amostra)
  const empresa = ctx.empresasPorId?.[pedido.empresa_id]
  return {
    os: numeroOSTexto(pedido),
    registro: registroAmostra(pedido),
    pe: pedido.numero_pe ? `${pedido.numero_pe}/${pedido.ano}` : '',
    material: descricaoMaterial(pedido, amostras),
    procedencia: procedenciaMaterial(pedido, amostras, nomeEmpresa(pedido, ctx.empresasPorId)),
    empresa: nomeEmpresa(pedido, ctx.empresasPorId),
    lote: pedido.lote || empresa?.lote || '',
    rodovia: empresa?.rodovia || '',
    complemento: textoComplementar(pedido, amostras),
  }
}
