import { format, formatDistanceToNowStrict } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TIPOS_AMOSTRA, SUBCATEGORIAS } from '../campo/constants'
import { ehIdTemp } from '../../lib/syncQueue'

// ── Números de documento ─────────────────────────────────────────────────────

/** PE-2026-0047 (ou "PE provisório" para pedido ainda não sincronizado) */
export function numeroPE(p) {
  if (!p) return '—'
  if (ehIdTemp(p.id) || (!p.numero_pe && !p.sequencial)) return 'PE provisório'
  const n = p.numero_pe ?? p.sequencial
  const num = /^\d+$/.test(String(n)) ? String(n).padStart(4, '0') : String(n)
  if (num.startsWith('PE-')) return num
  return `PE-${p.ano ?? new Date(p.created_at).getFullYear()}-${num}`
}

export function ehOSProvisoria(p) {
  return !!p?.numero_os && String(p.numero_os).startsWith('PROV-')
}

/** "O.S. 2026.08.21.03.0047" ou "O.S. provisória" */
export function numeroOS(p, { curto = false } = {}) {
  if (!p?.numero_os) return null
  const n = String(p.numero_os).replace(/^O\.S\.\s*/, '')
  if (n.startsWith('PROV-')) return curto ? 'O.S. provisória' : `O.S. provisória (${n})`
  return `O.S. ${n}`
}

export function gerarNumeroOSProvisorio(data = new Date()) {
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `PROV-${format(data, 'yyyyMMdd')}-${rnd}`
}

/** Prévia do número definitivo (quando o sequencial já é conhecido) */
export function previaNumeroOS({ data, lote, sequencial }) {
  const loteNum = String(lote || '').replace(/\D/g, '')
  if (!loteNum || !sequencial || !data) return null
  const d = typeof data === 'string' ? new Date(`${data}T12:00:00`) : data
  return `${format(d, 'yyyy.MM.dd')}.${loteNum.padStart(2, '0')}.${String(sequencial).padStart(4, '0')}`
}

// ── Datas ────────────────────────────────────────────────────────────────────

export function dataHora(iso) {
  if (!iso) return '—'
  try { return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) } catch { return '—' }
}

export function data(iso) {
  if (!iso) return '—'
  try {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso)
    return format(d, 'dd/MM/yyyy', { locale: ptBR })
  } catch { return '—' }
}

export function idade(iso) {
  if (!iso) return ''
  try { return formatDistanceToNowStrict(new Date(iso), { locale: ptBR, addSuffix: true }) } catch { return '' }
}

export function hojeISO() {
  return format(new Date(), 'yyyy-MM-dd')
}

// ── Material / amostras ──────────────────────────────────────────────────────

export function rotuloMaterial(material) {
  return TIPOS_AMOSTRA.find(t => t.value === material)?.label || material || '—'
}

export function rotuloSubtipo(material, subTipo) {
  const lista = SUBCATEGORIAS[material] || Object.values(SUBCATEGORIAS).flat()
  return lista.find(s => s.value === subTipo)?.label || subTipo || ''
}

/**
 * dados_amostra → array de amostras.
 * Contrato atual: array. Aceita também {amostras:[...]} e o legado {cabecario:{...}}.
 */
export function normalizarAmostras(dados) {
  if (!dados) return []
  if (Array.isArray(dados)) return dados
  if (Array.isArray(dados.amostras)) return dados.amostras
  if (dados.cabecario && typeof dados.cabecario === 'object') return [dados.cabecario]
  if (typeof dados === 'object' && Object.keys(dados).length > 0) return [dados]
  return []
}

const ROTULOS_CAMPOS = {
  estaca_inicial: 'Estaca inicial', estaca_final: 'Estaca final', estaca_extracao: 'Estaca de extração',
  qtd_cps: 'Qtd. de CPs', fck: 'fck (MPa)', gc_minimo: 'GC mínimo', temp_usina: 'Temp. usina (°C)',
  temp_pista: 'Temp. pista (°C)', temp_coleta: 'Temp. coleta (°C)', cap: 'CAP', data_aplicacao: 'Data de aplicação',
  diametro_cps: 'Diâmetro dos CPs (mm)', responsavel_coleta: 'Responsável pela coleta',
  local_aplicacao: 'Local de aplicação', idade_ruptura: 'Idade de ruptura',
}

export function rotuloCampo(chave) {
  if (ROTULOS_CAMPOS[chave]) return ROTULOS_CAMPOS[chave]
  const t = String(chave).replace(/_pct$/, ' (%)').replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function valorExibicao(v) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return data(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// ── Diversos ─────────────────────────────────────────────────────────────────

export function porId(lista) {
  return Object.fromEntries((lista || []).map(x => [x.id, x]))
}

export function nomeEmpresa(p, empresasPorId) {
  return empresasPorId?.[p?.empresa_id]?.nome || p?.empresa || '—'
}

export function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}
