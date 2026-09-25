import { supabase } from '../../lib/supabase'
import { cacheGet, cachePut } from '../../lib/offlineDB'
import { situacao } from '../laboratorio/classificacao'
import { porId } from '../laboratorio/utils'
import { STATUS_ABERTOS } from '../laboratorio/constants'
import { STATUS_NA_FILA } from '../assistente/constants'
import { limitesPeriodo } from './periodo'

// ─────────────────────────────────────────────────────────────────────────────
// Repositório do Painel Interno (escopo aprovado em claude/CNRO_Lab_Painel_Interno_Escopo.md)
//
// Segue o mesmo padrão dos outros módulos: busca linhas enxutas do Supabase,
// calcula os agrupamentos em JavaScript e guarda o resultado no IndexedDB para
// o modo offline. Não existe função nova no banco — a leitura de
// `pedidos_ensaio` e `ensaios_os` já é liberada para qualquer usuário logado
// (RLS `usuario_atual_id() IS NOT NULL`), então os filtros "meus pedidos" /
// "minhas O.S." são um recorte do aplicativo, como já acontece nas listas.
//
// Duas partes:
//   • "Situação atual"  — sempre igual, sem filtro de período.
//   • "Período"         — solicitados / finalizados / cancelados no intervalo
//                          escolhido (Dia · Semana · Mês · Ano).
// Cada parte guarda no cache as LINHAS usadas (não os números prontos), para
// que o cálculo offline seja o mesmo código do cálculo online.
// ─────────────────────────────────────────────────────────────────────────────

const PEDIDOS_ABERTOS_POS_OS = ['em_andamento', 'aguardando_revisao', 'devolvido_campo']

// ── Busca (online) ───────────────────────────────────────────────────────────

async function buscarSituacaoAtualServidor() {
  const { data: pedidos, error } = await supabase.from('pedidos_ensaio')
    .select('id, status, solicitante_id, laboratorista_id, ensaios_ids, created_at')
    .in('status', STATUS_ABERTOS)
  if (error) throw error

  const idsComOS = (pedidos || [])
    .filter(p => PEDIDOS_ABERTOS_POS_OS.includes(p.status))
    .map(p => p.id)

  let ensaiosOs = []
  for (let i = 0; i < idsComOS.length; i += 150) {
    const { data, error: e2 } = await supabase.from('ensaios_os')
      .select('id, pedido_id, assistente_id, status, ensaio_id, nome_ensaio')
      .in('pedido_id', idsComOS.slice(i, i + 150))
    if (e2) throw e2
    ensaiosOs.push(...(data || []))
  }

  return { pedidos: pedidos || [], ensaiosOs }
}

async function buscarPeriodoServidor(inicio, fim, { comCancelados }) {
  const de = inicio.toISOString()
  const ate = fim.toISOString()

  const [rSolic, rFinal, rAprov] = await Promise.all([
    supabase.from('pedidos_ensaio')
      .select('id, status, solicitante_id, ensaios_ids, created_at')
      .gte('created_at', de).lt('created_at', ate),
    supabase.from('pedidos_ensaio')
      .select('id, solicitante_id, laboratorista_id, finalizado_em')
      .eq('status', 'concluido').gte('finalizado_em', de).lt('finalizado_em', ate),
    supabase.from('ensaios_os')
      .select('id, pedido_id, assistente_id, ensaio_id, nome_ensaio, aprovado_em')
      .eq('status', 'aprovado').gte('aprovado_em', de).lt('aprovado_em', ate),
  ])
  if (rSolic.error) throw rSolic.error
  if (rFinal.error) throw rFinal.error
  if (rAprov.error) throw rAprov.error

  let cancelados = []
  if (comCancelados) {
    // Não há coluna própria de "cancelado em": usa updated_at como aproximação.
    const { data, error } = await supabase.from('pedidos_ensaio')
      .select('id, updated_at').eq('status', 'cancelado')
      .gte('updated_at', de).lt('updated_at', ate)
    if (error) throw error
    cancelados = data || []
  }

  return {
    pedidosSolicitados: rSolic.data || [],
    pedidosFinalizados: rFinal.data || [],
    ensaiosAprovados: rAprov.data || [],
    pedidosCancelados: cancelados,
  }
}

async function buscarCatalogoEnsaiosServidor() {
  const { data, error } = await supabase.from('ensaios').select('id, nome')
  if (error) throw error
  return data || []
}

// ── Cache (offline) ──────────────────────────────────────────────────────────

async function lerCache(chave) {
  const r = await cacheGet('dashboard_cache', chave)
  return r?.dados ?? null
}
async function gravarCache(chave, dados) {
  await cachePut('dashboard_cache', { chave, dados, em: new Date().toISOString() })
}

const chavePeriodo = (tipo, inicio) => `periodo:${tipo}:${inicio.toISOString().slice(0, 10)}`

// ── Carregamento principal ───────────────────────────────────────────────────

/**
 * @returns {{ situacaoAtual, periodo, fonte: 'servidor'|'cache', atualizadoEm: Date|null }}
 */
export async function carregar({ tipoPeriodo, referencia, comCancelados }) {
  const { inicio, fim } = limitesPeriodo(tipoPeriodo, referencia)
  const chaveP = chavePeriodo(tipoPeriodo, inicio)

  let situacaoAtual, periodo, catalogoEnsaios, fonte = 'servidor', atualizadoEm = new Date()

  if (navigator.onLine) {
    try {
      const [sit, per, cat] = await Promise.all([
        buscarSituacaoAtualServidor(),
        buscarPeriodoServidor(inicio, fim, { comCancelados }),
        comCancelados ? buscarCatalogoEnsaiosServidor() : Promise.resolve(null),
      ])
      situacaoAtual = sit
      periodo = per
      catalogoEnsaios = cat
      await gravarCache('atual', sit)
      await gravarCache(chaveP, per)
      if (cat) await gravarCache('catalogo_ensaios', cat)
    } catch (e) {
      if (!/fetch|network/i.test(e?.message || '')) throw e
      fonte = 'cache'
    }
  } else {
    fonte = 'cache'
  }

  if (fonte === 'cache') {
    situacaoAtual = await lerCache('atual')
    periodo = await lerCache(chaveP)
    catalogoEnsaios = comCancelados ? await lerCache('catalogo_ensaios') : null
    const metaAtual = await cacheGet('dashboard_cache', 'atual')
    atualizadoEm = metaAtual?.em ? new Date(metaAtual.em) : null
    if (!situacaoAtual) situacaoAtual = { pedidos: [], ensaiosOs: [] }
  }

  return {
    fonte,
    atualizadoEm,
    semDadosDoPeriodo: fonte === 'cache' && !periodo,
    dados: computarContadores({
      situacaoAtual,
      periodo: periodo || { pedidosSolicitados: [], pedidosFinalizados: [], ensaiosAprovados: [], pedidosCancelados: [] },
      catalogoEnsaios: catalogoEnsaios || [],
    }),
  }
}

// ── Cálculo dos contadores (puro — mesmo código online/offline) ─────────────

function contarPorGrupo(pedidos, grupos) {
  const c = {}
  for (const [nome, statuses] of Object.entries(grupos)) {
    c[nome] = pedidos.filter(p => statuses.includes(p.status)).length
  }
  return c
}

const GRUPOS_PEDIDO = {
  aguardandoLab: ['aguardando_lab', 'em_analise'],
  emAndamento:   ['em_andamento', 'aguardando_revisao'],
  devolvidos:    ['devolvido_campo'],
}

function contarEnsaiosPedidos(pedidos) {
  return pedidos.reduce((soma, p) => soma + (Array.isArray(p.ensaios_ids) ? p.ensaios_ids.length : 0), 0)
}

/**
 * Monta os contadores de todos os blocos a partir das linhas já carregadas
 * (do servidor ou do cache). `perfilId` filtra os blocos "meus".
 */
export function computarContadores({ situacaoAtual, periodo, catalogoEnsaios }) {
  const pedidos = situacaoAtual.pedidos || []
  const ensaiosOs = situacaoAtual.ensaiosOs || []
  const ensaiosOsPorPedido = {}
  for (const eo of ensaiosOs) (ensaiosOsPorPedido[eo.pedido_id] ||= []).push(eo)

  const porStatusEnsaio = statuses => ensaiosOs.filter(e => statuses.includes(e.status)).length

  // ── Situação atual (independe de período) ──────────────────────────────
  const geralPedidos = contarPorGrupo(pedidos, GRUPOS_PEDIDO)
  const geralEnsaios = {
    aguardandoLab: contarEnsaiosPedidos(pedidos.filter(p => GRUPOS_PEDIDO.aguardandoLab.includes(p.status))),
    emAndamento:   porStatusEnsaio(['pendente', 'em_andamento', 'devolvido']),
    emRevisao:     porStatusEnsaio(['aguardando_revisao']),
    devolvidos:    contarEnsaiosPedidos(pedidos.filter(p => p.status === 'devolvido_campo')),
  }

  const porCampo = idUsuario => {
    const meus = pedidos.filter(p => p.solicitante_id === idUsuario)
    return contarPorGrupo(meus, GRUPOS_PEDIDO)
  }

  const porMinhasOS = idUsuario => {
    const c = { analise: 0, campo: 0, andamento: 0, revisao: 0, finalizar: 0 }
    for (const p of pedidos) {
      const sit = situacao(p, ensaiosOsPorPedido[p.id] || [], idUsuario)
      if (sit.meu && sit.sub && sit.sub in c) c[sit.sub]++
    }
    return c
  }

  const porAssistente = idUsuario => {
    const meus = ensaiosOs.filter(e => e.assistente_id === idUsuario && STATUS_NA_FILA.includes(e.status))
    return {
      aFazer:      meus.filter(e => e.status === 'pendente').length,
      emAndamento: meus.filter(e => e.status === 'em_andamento').length,
      devolvidos:  meus.filter(e => e.status === 'devolvido').length,
    }
  }

  // ── Período ──────────────────────────────────────────────────────────────
  const solicitados = periodo.pedidosSolicitados || []
  const finalizados = periodo.pedidosFinalizados || []
  const cancelados = periodo.pedidosCancelados || []
  const aprovados = periodo.ensaiosAprovados || []

  const mapaEnsaios = porId(catalogoEnsaios)

  const solicitadosPorTipo = {}
  for (const p of solicitados) {
    for (const id of (p.ensaios_ids || [])) {
      const nome = mapaEnsaios[id]?.nome || null
      if (nome) solicitadosPorTipo[nome] = (solicitadosPorTipo[nome] || 0) + 1
    }
  }
  const aprovadosPorTipo = {}
  for (const e of aprovados) {
    const nome = e.nome_ensaio || 'Ensaio'
    aprovadosPorTipo[nome] = (aprovadosPorTipo[nome] || 0) + 1
  }
  const porTipo = [...new Set([...Object.keys(solicitadosPorTipo), ...Object.keys(aprovadosPorTipo)])]
    .map(nome => ({ nome, solicitados: solicitadosPorTipo[nome] || 0, aprovados: aprovadosPorTipo[nome] || 0 }))
    .sort((a, b) => (b.solicitados + b.aprovados) - (a.solicitados + a.aprovados))

  return {
    geral: { pedidos: geralPedidos, ensaios: geralEnsaios },
    porUsuario: {
      campo: porCampo, minhasOS: porMinhasOS, assistente: porAssistente,
    },
    periodo: {
      solicitados, finalizados, cancelados, aprovados,
      solicitadosTotal: solicitados.length,
      finalizadosTotal: finalizados.length,
      canceladosTotal: cancelados.length,
      aprovadosTotal: aprovados.length,
      porTipo,
      // "Solicitados"/"Finalizados" do Campo olham quem pediu; do Laboratório, quem executou.
      solicitadosPorSolicitante: idUsuario => solicitados.filter(p => p.solicitante_id === idUsuario).length,
      finalizadosPorSolicitante: idUsuario => finalizados.filter(p => p.solicitante_id === idUsuario).length,
      finalizadosPorLaboratorista: idUsuario => finalizados.filter(p => p.laboratorista_id === idUsuario).length,
      aprovadosPorAssistente: idUsuario => aprovados.filter(e => e.assistente_id === idUsuario).length,
    },
  }
}
