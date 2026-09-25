import { supabase } from '../../lib/supabase'
import {
  cacheSubstituir, cacheGetAll, cacheGet, cachePut, cacheDelete, idMapTodos,
} from '../../lib/offlineDB'
import {
  enfileirar, enfileirarUnico, executarOperacao, processarFila, filaVazia, listarFila,
  contemIdTemp, ehIdTemp, mensagemErro,
} from '../../lib/syncQueue'
import { listarModelos, modeloVigente, prepararModelos } from '../fichas/fichasRepo'
import { apagarFotosApoio } from '../fichas/components/FotoApoio'
import { STATUS_NA_FILA } from './constants'

// ─────────────────────────────────────────────────────────────────────────────
// Repositório do Módulo Assistente
//  • Online e sem fila pendente → grava direto no servidor (RPCs da migração 12).
//  • Offline (ou com fila pendente) → aplica no aparelho e enfileira na syncQueue.
// Os caches do assistente ficam em stores próprios (assist_*), separados do Lab.
// ─────────────────────────────────────────────────────────────────────────────

const COLUNAS_USUARIOS = '*'

async function buscarServidor(perfil) {
  const { data: ensaiosOs, error } = await supabase.from('ensaios_os').select('*')
    .eq('assistente_id', perfil.id).in('status', STATUS_NA_FILA)
  if (error) throw error

  const idsPedidos = [...new Set((ensaiosOs || []).map(e => e.pedido_id))].filter(id => !ehIdTemp(id))
  const pedidos = []
  for (let i = 0; i < idsPedidos.length; i += 150) {
    const { data, error: e2 } = await supabase.from('pedidos_ensaio').select('*').in('id', idsPedidos.slice(i, i + 150))
    if (e2) throw e2
    pedidos.push(...(data || []))
  }

  const [usuarios, ensaios, empresas, fichas, modelos] = await Promise.all([
    supabase.from('usuarios').select(COLUNAS_USUARIOS).order('nome').then(r => { if (r.error) throw r.error; return r.data || [] }),
    supabase.from('ensaios').select('*').order('nome').then(r => { if (r.error) throw r.error; return r.data || [] }),
    supabase.from('empresas').select('*').order('nome').then(r => { if (r.error) throw r.error; return r.data || [] }),
    supabase.from('fichas_ensaio').select('id, codigo, nome, ensaio_id, versao, ativa').order('codigo')
      .then(r => { if (r.error) throw r.error; return r.data || [] }),
    listarModelos(),
  ])
  return { ensaiosOs: ensaiosOs || [], pedidos, usuarios, ensaios, empresas, fichas, modelos }
}

/** Mantém a versão local de registros com alterações ainda não sincronizadas */
function mesclarLocais(servidor, locais) {
  if (!locais.length) return servidor
  const mapa = new Map(servidor.map(r => [r.id, r]))
  for (const l of locais) mapa.set(l.id, l)
  return [...mapa.values()]
}

/** Modelo que o ensaio usa (congelado ao iniciar) ou o vigente da ficha */
export function modeloIdDoEnsaio(eo, modelos) {
  return eo?.ficha_modelo_id || modeloVigente(modelos, eo?.ficha_ensaio_id)?.id || null
}

export async function carregarDados(perfil) {
  let dados = null
  let fonte = 'servidor'

  if (navigator.onLine) {
    try {
      const s = await buscarServidor(perfil)
      const pendentes = new Set((await listarFila()).map(o => o.pedidoId))
      const mapaIds = await idMapTodos()
      const jaSincronizado = r => ehIdTemp(r.id) && mapaIds[r.id]
      const locaisEo = (await cacheGetAll('assist_ensaios_cache'))
        .filter(e => e._alteradoOffline && pendentes.has(e.pedido_id) && !jaSincronizado(e))
      const ensaiosOs = mesclarLocais(s.ensaiosOs, locaisEo)
      await Promise.all([
        cacheSubstituir('assist_ensaios_cache', ensaiosOs),
        cacheSubstituir('assist_pedidos_cache', s.pedidos),
        cacheSubstituir('usuarios_cache', s.usuarios),
        cacheSubstituir('ensaios_cache', s.ensaios),
        cacheSubstituir('empresas_cache', s.empresas),
        cacheSubstituir('fichas_ensaio_cache', s.fichas),
      ])
      dados = { ...s, ensaiosOs }
      // baixa os modelos das fichas da fila para poder trabalhar offline depois
      prepararModelos(ensaiosOs.map(eo => modeloIdDoEnsaio(eo, s.modelos)))
    } catch (e) {
      if (!/fetch|network|conexão/i.test(e?.message || '')) throw new Error(mensagemErro(e))
      fonte = 'cache'
    }
  } else {
    fonte = 'cache'
  }

  if (fonte === 'cache') {
    const [ensaiosOs, pedidos, usuarios, ensaios, empresas, fichas, modelos] = await Promise.all([
      cacheGetAll('assist_ensaios_cache'), cacheGetAll('assist_pedidos_cache'), cacheGetAll('usuarios_cache'),
      cacheGetAll('ensaios_cache'), cacheGetAll('empresas_cache'), cacheGetAll('fichas_ensaio_cache'), listarModelos(),
    ])
    dados = { ensaiosOs: ensaiosOs.filter(e => e.assistente_id === perfil.id), pedidos, usuarios, ensaios, empresas, fichas, modelos }
  }
  return { ...dados, fonte }
}

// ── Execução (online direto / offline enfileirado) ───────────────────────────

async function executar(op, aplicarLocal) {
  if (navigator.onLine && !contemIdTemp([op.id, op.dados, op.args]) && await filaVazia()) {
    try {
      const resultado = await executarOperacao(op)
      if (aplicarLocal) await aplicarLocal(resultado)
      return { resultado, offline: false }
    } catch (e) {
      const semRede = /conexão|fetch|network/i.test(e.message || '')
      if (!semRede) throw e
    }
  }
  if (aplicarLocal) await aplicarLocal(null)
  if (op.chave) await enfileirarUnico(op); else await enfileirar(op)
  if (navigator.onLine) processarFila()
  return { resultado: null, offline: true }
}

async function patchEnsaioLocal(eo, patch, marcarOffline) {
  const atual = (await cacheGet('assist_ensaios_cache', eo.id)) || eo
  await cachePut('assist_ensaios_cache', { ...atual, ...patch, ...(marcarOffline ? { _alteradoOffline: true } : {}) })
}

// ── Rascunho local (no aparelho) ─────────────────────────────────────────────
// Guardado a cada alteração. Vale enquanto o ensaio não for devolvido/reenviado:
// a "base" muda quando o laboratorista devolve, e aí o rascunho antigo é descartado.

export function baseDoRascunho(eo) {
  return eo?.devolvido_em || 'inicial'
}

export async function lerRascunho(eo) {
  const r = await cacheGet('rascunhos_ficha', eo.id)
  return r && r.base === baseDoRascunho(eo) ? r : null
}

export async function gravarRascunho(eo, { estado, assinatura, enviadoServidorEm }) {
  const atual = await cacheGet('rascunhos_ficha', eo.id)
  await cachePut('rascunhos_ficha', {
    ensaioOsId: eo.id,
    base: baseDoRascunho(eo),
    estado,
    assinatura: assinatura || null,
    salvoEm: new Date().toISOString(),
    enviadoServidorEm: enviadoServidorEm ?? atual?.enviadoServidorEm ?? null,
  })
}

export async function apagarRascunho(ensaioOsId) {
  await cacheDelete('rascunhos_ficha', ensaioOsId)
}

// ── Ações do assistente ──────────────────────────────────────────────────────

export async function iniciarEnsaio(ctx, eo) {
  const modeloId = modeloIdDoEnsaio(eo, ctx.modelos)
  const correcao = eo.status === 'devolvido'
  return executar({
    tipo: 'rpc', rpc: 'iniciar_ensaio', args: { p_ensaio_os_id: eo.id },
    descricao: `${correcao ? 'Iniciar correção' : 'Iniciar'}: ${eo.nome_ensaio}`, pedidoId: eo.pedido_id,
  }, async resultado => {
    if (resultado) await patchEnsaioLocal(eo, resultado, false)
    else {
      await patchEnsaioLocal(eo, {
        status: 'em_andamento', ficha_modelo_id: eo.ficha_modelo_id || modeloId,
        iniciado_em: eo.iniciado_em || new Date().toISOString(),
      }, true)
    }
  })
}

/** Rascunho no servidor (continua depois, em outro aparelho). Offline: só o último fica na fila. */
export async function salvarRascunhoServidor(ctx, eo, dados) {
  return executar({
    tipo: 'rpc', rpc: 'salvar_rascunho_ensaio', args: { p_ensaio_os_id: eo.id, p_dados: dados },
    chave: `rascunho:${eo.id}`,
    descricao: `Salvar rascunho: ${eo.nome_ensaio}`, pedidoId: eo.pedido_id,
  }, async resultado => {
    await patchEnsaioLocal(eo, resultado ? { dados_resultado: resultado.dados_resultado, rascunho_em: resultado.rascunho_em }
      : { dados_resultado: dados, rascunho_em: new Date().toISOString() }, !resultado)
  })
}

export async function enviarParaRevisao(ctx, eo, dados, assinadoEm) {
  const r = await executar({
    tipo: 'rpc', rpc: 'enviar_para_revisao',
    args: { p_ensaio_os_id: eo.id, p_dados: dados, p_assinado_em: assinadoEm },
    chave: `enviar:${eo.id}`,
    descricao: `Enviar para revisão: ${eo.nome_ensaio}`, pedidoId: eo.pedido_id,
  }, async resultado => {
    await patchEnsaioLocal(eo, resultado || {
      status: 'aguardando_revisao', dados_resultado: dados, data_conclusao: new Date().toISOString(),
    }, !resultado)
  })
  await apagarRascunho(eo.id)
  await apagarFotosApoio(eo.id).catch(() => {})
  return r
}
