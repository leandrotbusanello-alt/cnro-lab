// ─────────────────────────────────────────────────────────────────────────────
// Dados do pedido que preenchem o cabeçalho das fichas (células de papel "pedido")
//   os · registro · material · procedencia · complemento · pe · lote · rodovia · empresa
// ─────────────────────────────────────────────────────────────────────────────
import {
  normalizarAmostras, rotuloCampo, rotuloMaterial, rotuloSubtipo, valorExibicao, nomeEmpresa, campoOculto,
} from '../laboratorio/utils'
import { ordemCampos } from '../campo/formularios'

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
// Campos que não entram no texto complementar
const IGNORAR = new Set(['id', 'fotos', 'foto', 'arquivos', 'responsavel_coleta', 'info_geral', 'certificado'])

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

function textoComplementar(p, amostras) {
  if (SUBTIPOS_CONCRETO.includes(p.sub_tipo)) return complementoConcreto(amostras)
  const ordem = ordemCampos(p.sub_tipo)
  const pos = k => (ordem.indexOf(k) < 0 ? 999 : ordem.indexOf(k))
  const blocos = amostras.map((a, i) => {
    const itens = Object.entries(a)
      .sort((x, y) => pos(x[0]) - pos(y[0]))
      .filter(([k, v]) => !IGNORAR.has(k) && !campoOculto(k) && !CAMPOS_MATERIAL.includes(k) && v !== '' && v !== null && v !== undefined && typeof v !== 'object')
      .map(([k, v]) => `${rotuloCampo(k)}: ${valorExibicao(v, k)}`)
    if (!itens.length) return ''
    return (amostras.length > 1 ? `Amostra ${i + 1} — ` : '') + itens.join('; ')
  }).filter(Boolean)
  if (p.observacoes) blocos.push(`Obs.: ${p.observacoes}`)
  return blocos.join(' | ')
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
    procedencia: nomeEmpresa(pedido, ctx.empresasPorId),
    empresa: nomeEmpresa(pedido, ctx.empresasPorId),
    lote: pedido.lote || empresa?.lote || '',
    rodovia: empresa?.rodovia || '',
    complemento: textoComplementar(pedido, amostras),
  }
}
