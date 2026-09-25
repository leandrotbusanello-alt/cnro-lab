// ─────────────────────────────────────────────────────────────────────────────
// Lançamento histórico (migração 14)
//
// Pedidos antigos (em papel) lançados pelo DEV com o fluxo completo, em nome das
// pessoas que realmente solicitaram, executaram e aprovaram, com as datas reais.
//  • só o DEV cria e altera; os demais usuários não veem esses pedidos nas filas;
//  • o banco age em nome do laboratorista do pedido / assistente do ensaio;
//  • funciona só com internet (não entra na fila offline).
// ─────────────────────────────────────────────────────────────────────────────
import { format } from 'date-fns'
import { modulosDoUsuario } from './modulos'

export function ehDev(perfil) {
  return String(perfil?.perfil || '').toUpperCase() === 'DEV'
}

export function ehHistorico(pedido) {
  return !!pedido?.lancamento_historico
}

/** 'AAAA-MM-DD' → ISO ao meio-dia de Cuiabá (evita mudar de dia por fuso) */
export function dataParaISO(dia) {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null
  return `${dia}T12:00:00-04:00`
}

/** ISO/Date → 'AAAA-MM-DD' (no fuso do aparelho) */
export function isoParaData(valor) {
  if (!valor) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor
  try { return format(new Date(valor), 'yyyy-MM-dd') } catch { return '' }
}

/** Maior entre várias datas 'AAAA-MM-DD' (ignora vazias) */
export function maiorData(...dias) {
  return dias.filter(Boolean).sort().slice(-1)[0] || ''
}

export function exigirOnlineHistorico(pedido) {
  if (ehHistorico(pedido) && !navigator.onLine) {
    throw new Error('Lançamento histórico só pode ser feito com internet.')
  }
}

/** Usuários com o módulo Laboratório (inclui inativos: podem ter saído da empresa) */
export function laboratoristasHistorico(usuarios) {
  return ordenarPorNome((usuarios || []).filter(u => modulosDoUsuario(u).includes('laboratorio')))
}

/** Executores (módulo Assistente), incluindo inativos */
export function executoresHistorico(usuarios) {
  return ordenarPorNome((usuarios || []).filter(u => modulosDoUsuario(u).includes('assistente')))
}

export function rotuloUsuario(u) {
  if (!u) return '—'
  return `${u.nome}${(u.status || 'Ativo') !== 'Ativo' ? ' (inativo)' : ''}`
}

function ordenarPorNome(lista) {
  return [...lista].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
}
