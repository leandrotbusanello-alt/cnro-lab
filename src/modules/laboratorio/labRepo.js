import { supabase } from '../../lib/supabase'
import {
  cacheSubstituir, cacheGetAll, cacheGet, cachePut, cacheDelete,
  getPedidosPendentes, arquivoObter, arquivoSalvar, idMapTodos,
} from '../../lib/offlineDB'
import {
  enfileirar, executarOperacao, processarFila, filaVazia, listarFila,
  contemIdTemp, novoIdTemp, ehIdTemp, mensagemErro,
} from '../../lib/syncQueue'
import { DIAS_CONCLUIDAS } from './constants'
import { gerarNumeroOSProvisorio } from './utils'
import { prepararModelos, listarModelos } from '../fichas/fichasRepo'
import { ehHistorico, dataParaISO } from '../../lib/historico'

// ─────────────────────────────────────────────────────────────────────────────
// Repositório do Módulo Laboratório
//
// Toda leitura e escrita do módulo passa por aqui.
//  • Online e sem fila pendente → grava direto no servidor.
//  • Offline (ou com fila pendente) → aplica a mudança no cache local,
//    enfileira a operação e ela é enviada quando a conexão voltar.
// ─────────────────────────────────────────────────────────────────────────────

const SELECT_PEDIDO_COMPLETO =
  '*, ficha_os:fichas_os!pedidos_ensaio_ficha_os_id_fkey(*), ' +
  'ficha_sol:fichas_solicitacao!pedidos_ensaio_ficha_sol_id_fkey(*)'

// ── Leitura ──────────────────────────────────────────────────────────────────

async function buscarPedidos({ ehDev = false } = {}) {
  const desde = new Date(Date.now() - DIAS_CONCLUIDAS * 86400000).toISOString()
  // DEV: também todos os lançamentos históricos (finalizados com datas antigas)
  const filtro =
    `status.in.(aguardando_lab,em_analise,em_andamento,aguardando_revisao,devolvido_campo),` +
    `finalizado_em.gte.${desde}` + (ehDev ? ',lancamento_historico.is.true' : '')

  let r = await supabase.from('pedidos_ensaio').select(SELECT_PEDIDO_COMPLETO)
    .or(filtro).order('created_at', { ascending: true }).limit(1000)
  if (r.error) {
    // Se o relacionamento com as fichas não estiver disponível, carrega sem elas
    r = await supabase.from('pedidos_ensaio').select('*')
      .or(filtro).order('created_at', { ascending: true }).limit(1000)
  }
  if (r.error) throw r.error
  return r.data || []
}

async function buscarEnsaiosOs(pedidoIds) {
  const ids = pedidoIds.filter(id => !ehIdTemp(id))
  const saida = []
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from('ensaios_os').select('*').in('pedido_id', ids.slice(i, i + 150))
    if (error) throw error
    saida.push(...(data || []))
  }
  return saida
}

/** Pedidos criados offline pelo Campo neste aparelho (ainda não enviados) */
async function pedidosCampoOffline() {
  const pend = await getPedidosPendentes()
  return pend
    .filter(p => ehIdTemp(p.id))
    .map(p => ({
      ...p,
      status: 'aguardando_lab',
      historico: p.historico || [],
      _origemOffline: true,
    }))
}

/**
 * Carrega tudo o que o módulo precisa.
 * Lançamentos históricos só aparecem para o DEV (os demais não os veem nas filas).
 * @returns {{pedidos, ensaiosOs, usuarios, ensaios, empresas, fichas, fonte}}
 */
export async function carregarDados({ ehDev = false } = {}) {
  let dados
  let fonte = 'servidor'

  if (navigator.onLine) {
    try {
      const [pedidosTodos, usuarios, ensaios, empresas, fichas] = await Promise.all([
        buscarPedidos({ ehDev }),
        supabase.from('usuarios').select('id, nome, cargo, perfil, status, assinatura_url, lote, empresa, modulos_acesso')
          .order('nome').then(r => { if (r.error) throw r.error; return r.data || [] }),
        supabase.from('ensaios').select('*').order('nome')
          .then(r => { if (r.error) throw r.error; return r.data || [] }),
        supabase.from('empresas').select('*').order('nome')
          .then(r => { if (r.error) throw r.error; return r.data || [] }),
        supabase.from('fichas_ensaio').select('id, codigo, nome, ensaio_id, versao, ativa').order('codigo')
          .then(r => { if (r.error) throw r.error; return r.data || [] }),
      ])
      const pedidos = ehDev ? pedidosTodos : pedidosTodos.filter(p => !ehHistorico(p))
      const ensaiosOs = await buscarEnsaiosOs(pedidos.map(p => p.id))
      // fichas online a revisar: baixa os modelos para revisar também sem internet
      prepararModelos(ensaiosOs.filter(e => e.ficha_modelo_id && e.status === 'aguardando_revisao').map(e => e.ficha_modelo_id))

      // Pedidos com operações ainda na fila (ex.: erro de sincronização)
      // continuam exibindo a versão local, para não "sumir" o trabalho feito.
      const pendentes = new Set((await listarFila()).map(o => o.pedidoId))
      const mapaIds = await idMapTodos()
      // registro local provisório já sincronizado → mostra só a versão do servidor
      const jaSincronizado = r => ehIdTemp(r.id) && mapaIds[r.id]
      const pedidosFinais = mesclarLocais(pedidos,
        (await cacheGetAll('pedidos_cache')).filter(p => p._alteradoOffline && pendentes.has(p.id) && !jaSincronizado(p)))
      const ensaiosOsFinais = mesclarLocais(ensaiosOs,
        (await cacheGetAll('ensaios_os_cache')).filter(e => e._alteradoOffline && pendentes.has(e.pedido_id) && !jaSincronizado(e)))

      await Promise.all([
        cacheSubstituir('pedidos_cache', pedidosFinais),
        cacheSubstituir('ensaios_os_cache', ensaiosOsFinais),
        cacheSubstituir('usuarios_cache', usuarios),
        cacheSubstituir('ensaios_cache', ensaios),
        cacheSubstituir('empresas_cache', empresas),
        cacheSubstituir('fichas_ensaio_cache', fichas),
      ])
      dados = { pedidos: pedidosFinais, ensaiosOs: ensaiosOsFinais, usuarios, ensaios, empresas, fichas }
    } catch (e) {
      if (!/fetch|network/i.test(e?.message || '')) throw new Error(mensagemErro(e))
      fonte = 'cache'
    }
  } else {
    fonte = 'cache'
  }

  if (fonte === 'cache') {
    const [pedidos, ensaiosOs, usuarios, ensaios, empresas, fichas] = await Promise.all([
      cacheGetAll('pedidos_cache'), cacheGetAll('ensaios_os_cache'), cacheGetAll('usuarios_cache'),
      cacheGetAll('ensaios_cache'), cacheGetAll('empresas_cache'), cacheGetAll('fichas_ensaio_cache'),
    ])
    dados = { pedidos: ehDev ? pedidos : pedidos.filter(p => !ehHistorico(p)), ensaiosOs, usuarios, ensaios, empresas, fichas }
  }

  // Pedidos do Campo criados offline neste aparelho
  const offline = await pedidosCampoOffline()
  const ids = new Set(dados.pedidos.map(p => p.id))
  dados.pedidos = [...dados.pedidos, ...offline.filter(p => !ids.has(p.id))]

  // Modelos das fichas online (lista, sem o conteúdo): indicam quais fichas já estão no sistema
  const modelos = await listarModelos().catch(() => [])

  return { ...dados, modelos, fonte }
}

/** Mantém a versão local de registros com alterações ainda não sincronizadas */
function mesclarLocais(servidor, locais) {
  if (!locais.length) return servidor
  const mapa = new Map(servidor.map(r => [r.id, r]))
  for (const l of locais) mapa.set(l.id, l)
  return [...mapa.values()]
}

/** Resultado detalhado de um ensaio (tabelas `resultados` e `resultado_*`) */
export async function carregarResultadoDetalhado(ensaioOs, nomeEnsaio) {
  if (!navigator.onLine || !ensaioOs?.resultado_id) return null
  try {
    const { data: resultado } = await supabase.from('resultados').select('*')
      .eq('id', ensaioOs.resultado_id).maybeSingle()
    let detalhes = []
    let tabela = null
    if (nomeEnsaio) {
      const { data: mapa } = await supabase.from('ensaio_resultado_map').select('tabela_resultado')
        .eq('ensaio_nome', nomeEnsaio).maybeSingle()
      tabela = mapa?.tabela_resultado || null
      if (tabela && /^resultado_[a-z_]+$/.test(tabela)) {
        const { data } = await supabase.from(tabela).select('*').eq('resultado_id', ensaioOs.resultado_id)
        detalhes = data || []
      }
    }
    return { resultado, tabela, detalhes }
  } catch {
    return null
  }
}

// ── Assinaturas e arquivos ───────────────────────────────────────────────────

const urlsCriadas = new Map()

/**
 * URL local (blob:) da assinatura PNG de um usuário. Funciona offline se a
 * assinatura já tiver sido baixada uma vez neste aparelho.
 */
export async function urlAssinatura(usuario) {
  const caminho = usuario?.assinatura_url
  if (!caminho) return null
  const chave = `assinatura:${usuario.id}:${caminho}`
  if (urlsCriadas.has(chave)) return urlsCriadas.get(chave)

  let blob = await arquivoObter(chave)
  if (!blob && navigator.onLine) {
    try {
      if (/^https?:\/\//.test(caminho)) {
        const resp = await fetch(caminho)
        if (resp.ok) blob = await resp.blob()
      } else {
        const { data, error } = await supabase.storage.from('assinaturas').download(caminho)
        if (!error) blob = data
      }
      if (blob) await arquivoSalvar(chave, blob)
    } catch { /* sem assinatura disponível */ }
  }
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  urlsCriadas.set(chave, url)
  return url
}

/** URL para abrir um arquivo enviado pelo assistente (foto/PDF da ficha) */
export async function urlArquivo(caminho) {
  if (!caminho) return null
  if (/^https?:\/\//.test(caminho)) return caminho
  if (!navigator.onLine) return null
  const [bucket, ...resto] = caminho.split('/')
  const { data } = await supabase.storage.from(bucket).createSignedUrl(resto.join('/'), 3600)
  return data?.signedUrl || null
}

// ── Execução (online direto / offline enfileirado) ───────────────────────────

async function executar(op, aplicarLocal) {
  if (navigator.onLine && !contemIdTemp([op.id, op.dados, op.args]) && await filaVazia()) {
    try {
      return { resultado: await executarOperacao(op), offline: false }
    } catch (e) {
      const semRede = /conexão|fetch|network/i.test(e.message || '')
      if (!semRede) throw e
      // caiu a conexão no meio: segue como offline
    }
  }
  if (aplicarLocal) await aplicarLocal()
  await enfileirar(op)
  if (navigator.onLine) processarFila()
  return { resultado: null, offline: true }
}

/** Executa uma sequência de operações na ordem (para no primeiro erro online) */
async function executarSequencia(passos) {
  let offline = false
  const resultados = []
  for (const { op, local } of passos) {
    const r = await executar(op, local)
    offline = offline || r.offline
    resultados.push(r.resultado)
  }
  return { offline, resultados }
}

// ── Atualizações locais (modo offline) ───────────────────────────────────────

function eventoLocal(ctx, acao, extra = {}) {
  return {
    acao, ...extra,
    usuario_id: ctx.perfil?.id, usuario: ctx.perfil?.nome,
    data: new Date().toISOString(), offline: true,
  }
}

async function obterPedidoLocal(id) {
  let p = await cacheGet('pedidos_cache', id)
  if (!p && ehIdTemp(id)) {
    p = (await pedidosCampoOffline()).find(x => x.id === id)
  }
  return p
}

async function patchPedidoLocal(id, patch, evento) {
  const atual = (await obterPedidoLocal(id)) || { id }
  const historico = evento ? [...(atual.historico || []), evento] : atual.historico
  await cachePut('pedidos_cache', { ...atual, ...patch, historico, _alteradoOffline: true })
}

async function patchEnsaioOsLocal(id, patch) {
  const atual = (await cacheGet('ensaios_os_cache', id)) || { id }
  await cachePut('ensaios_os_cache', { ...atual, ...patch, _alteradoOffline: true })
}

// ── Operações de histórico ───────────────────────────────────────────────────

function opHistorico(pedidoId, evento) {
  const ev = { ...evento }
  if (!navigator.onLine) ev.data = new Date().toISOString()  // mantém a hora real da ação
  return {
    tipo: 'rpc', rpc: 'adicionar_historico',
    args: { p_pedido_id: pedidoId, p_evento: ev },
    descricao: `Histórico: ${evento.acao}`, pedidoId,
  }
}

// ── Ações do laboratorista ───────────────────────────────────────────────────
// ctx = { perfil, ensaiosPorId, usuariosPorId }

/** Passo "assumir" (só quando necessário). Retorna [] se já é o responsável. */
function passosAssumir(ctx, pedido) {
  const meuId = ctx.meuIdPara ? ctx.meuIdPara(pedido) : ctx.perfil.id   // histórico: laboratorista do pedido
  const souResp = pedido.laboratorista_id === meuId
  if (souResp && pedido.status !== 'aguardando_lab') return []
  return [{
    op: {
      tipo: 'rpc', rpc: 'assumir_pedido', args: { p_pedido_id: pedido.id },
      descricao: 'Assumir pedido', pedidoId: pedido.id,
    },
    local: () => patchPedidoLocal(pedido.id, {
      laboratorista_id: ctx.perfil.id,
      assumido_em: pedido.assumido_em || new Date().toISOString(),
      status: pedido.status === 'aguardando_lab' ? 'em_analise' : pedido.status,
    }, eventoLocal(ctx, souResp ? 'Análise retomada' : 'Pedido assumido')),
  }]
}

export async function salvarEdicao(ctx, pedido, patch, camposAlterados = []) {
  const evento = { acao: 'Pedido editado', campos: camposAlterados }
  return executarSequencia([
    ...passosAssumir(ctx, pedido),
    {
      op: { tipo: 'update', tabela: 'pedidos_ensaio', id: pedido.id, dados: patch,
            descricao: 'Editar pedido', pedidoId: pedido.id },
      local: () => {
        const extra = {}
        if (patch.empresa_id) extra.empresa = ctx.empresasPorId?.[patch.empresa_id]?.nome
        return patchPedidoLocal(pedido.id, { ...patch, ...extra }, eventoLocal(ctx, evento.acao, { campos: camposAlterados }))
      },
    },
    { op: opHistorico(pedido.id, evento) },
  ])
}

export async function devolverAoCampo(ctx, pedido, motivo) {
  return executarSequencia([
    ...passosAssumir(ctx, pedido),
    {
      op: { tipo: 'update', tabela: 'pedidos_ensaio', id: pedido.id,
            dados: { status: 'devolvido_campo', motivo_devolucao: motivo },
            descricao: 'Devolver ao campo', pedidoId: pedido.id },
      local: () => patchPedidoLocal(pedido.id, { status: 'devolvido_campo', motivo_devolucao: motivo },
        eventoLocal(ctx, 'Devolvido ao campo', { motivo })),
    },
    { op: opHistorico(pedido.id, { acao: 'Devolvido ao campo', motivo }) },
  ])
}

export async function gerarOS(ctx, pedido, { lote, dataValidacao }) {
  // Linhas provisórias de ensaios da O.S. (substituídas pelas do servidor na sincronização)
  const itens = (pedido.ensaios_ids || []).map(ensaioId => ({ tempId: novoIdTemp('eo'), ensaio_id: ensaioId }))

  const passos = [...passosAssumir(ctx, pedido)]
  passos.push({
    op: {
      tipo: 'rpc', rpc: 'gerar_os',
      args: { p_pedido_id: pedido.id, p_data: dataValidacao, p_lote: lote },
      pos: 'mapear_ensaios_os', posArgs: { pedidoId: pedido.id, itens },
      descricao: 'Gerar O.S.', pedidoId: pedido.id,
    },
    local: async () => {
      const numeroProv = gerarNumeroOSProvisorio(new Date(`${dataValidacao}T12:00:00`))
      await patchPedidoLocal(pedido.id, {
        numero_os: numeroProv, status: 'em_andamento', lote, data_validacao: dataValidacao,
        laboratorista_id: ctx.perfil.id,
      }, eventoLocal(ctx, 'O.S. gerada', { numero_os: numeroProv }))
      for (const it of itens) {
        await cachePut('ensaios_os_cache', {
          id: it.tempId, pedido_id: pedido.id, ensaio_id: it.ensaio_id,
          nome_ensaio: ctx.ensaiosPorId?.[it.ensaio_id]?.nome || 'Ensaio',
          status: 'pendente', visivel_campo: false, dados_resultado: {},
          created_at: new Date().toISOString(), _alteradoOffline: true,
        })
      }
    },
  })
  return executarSequencia(passos)
}

export async function transferirOS(ctx, pedido, paraId, motivo) {
  const para = ctx.usuariosPorId?.[paraId]
  return executar({
    tipo: 'rpc', rpc: 'transferir_os', args: { p_pedido_id: pedido.id, p_para: paraId, p_motivo: motivo || null },
    descricao: `Transferir para ${para?.nome || 'laboratorista'}`, pedidoId: pedido.id,
  }, () => patchPedidoLocal(pedido.id, { laboratorista_id: paraId },
    eventoLocal(ctx, 'O.S. transferida', { para: para?.nome, motivo })))
}

export async function atualizarAtribuicao(ctx, pedido, ensaioOs, { assistenteId, fichaId }) {
  const dados = {}
  const extra = {}
  if (assistenteId !== undefined && assistenteId !== ensaioOs.assistente_id) {
    dados.assistente_id = assistenteId || null
    // lançamento histórico: atribuição na data da O.S.
    const quando = ehHistorico(pedido) ? (dataParaISO(pedido.data_validacao) || pedido.created_at) : new Date().toISOString()
    dados.data_atribuicao = assistenteId ? quando : null
    extra.assistente = assistenteId ? ctx.usuariosPorId?.[assistenteId]?.nome : null
  }
  if (fichaId !== undefined && fichaId !== ensaioOs.ficha_ensaio_id) {
    dados.ficha_ensaio_id = fichaId || null
  }
  if (Object.keys(dados).length === 0) return { offline: false }

  const acao = 'assistente_id' in dados
    ? (dados.assistente_id ? 'Ensaio atribuído' : 'Atribuição removida')
    : 'Ficha do ensaio alterada'
  const evento = { acao, ensaio: ensaioOs.nome_ensaio, ...extra }

  return executarSequencia([
    {
      op: { tipo: 'update', tabela: 'ensaios_os', id: ensaioOs.id, dados,
            descricao: `${acao}: ${ensaioOs.nome_ensaio}`, pedidoId: pedido.id },
      local: async () => {
        await patchEnsaioOsLocal(ensaioOs.id, dados)
        await patchPedidoLocal(pedido.id, {}, eventoLocal(ctx, acao, { ensaio: ensaioOs.nome_ensaio, ...extra }))
      },
    },
    { op: opHistorico(pedido.id, evento) },
  ])
}

export async function adicionarEnsaioNaOS(ctx, pedido, ensaio) {
  const tempId = novoIdTemp('eo')
  const novosIds = [...new Set([...(pedido.ensaios_ids || []), ensaio.id])]
  return executarSequencia([
    {
      op: { tipo: 'insert', tabela: 'ensaios_os', tempId,
            dados: { pedido_id: pedido.id, ensaio_id: ensaio.id, nome_ensaio: ensaio.nome, status: 'pendente' },
            descricao: `Adicionar ensaio: ${ensaio.nome}`, pedidoId: pedido.id },
      local: () => cachePut('ensaios_os_cache', {
        id: tempId, pedido_id: pedido.id, ensaio_id: ensaio.id, nome_ensaio: ensaio.nome,
        status: 'pendente', visivel_campo: false, dados_resultado: {},
        created_at: new Date().toISOString(), _alteradoOffline: true,
      }),
    },
    {
      op: { tipo: 'update', tabela: 'pedidos_ensaio', id: pedido.id, dados: { ensaios_ids: novosIds },
            descricao: 'Atualizar ensaios do pedido', pedidoId: pedido.id },
      local: () => patchPedidoLocal(pedido.id, { ensaios_ids: novosIds },
        eventoLocal(ctx, 'Ensaio adicionado', { ensaio: ensaio.nome })),
    },
    { op: opHistorico(pedido.id, { acao: 'Ensaio adicionado', ensaio: ensaio.nome }) },
  ])
}

export async function removerEnsaioDaOS(ctx, pedido, ensaioOs) {
  const novosIds = (pedido.ensaios_ids || []).filter(id => id !== ensaioOs.ensaio_id)
  return executarSequencia([
    {
      op: { tipo: 'delete', tabela: 'ensaios_os', id: ensaioOs.id,
            descricao: `Remover ensaio: ${ensaioOs.nome_ensaio}`, pedidoId: pedido.id },
      local: () => cacheDelete('ensaios_os_cache', ensaioOs.id),
    },
    {
      op: { tipo: 'update', tabela: 'pedidos_ensaio', id: pedido.id, dados: { ensaios_ids: novosIds },
            descricao: 'Atualizar ensaios do pedido', pedidoId: pedido.id },
      local: () => patchPedidoLocal(pedido.id, { ensaios_ids: novosIds },
        eventoLocal(ctx, 'Ensaio removido', { ensaio: ensaioOs.nome_ensaio })),
    },
    { op: opHistorico(pedido.id, { acao: 'Ensaio removido', ensaio: ensaioOs.nome_ensaio }) },
  ])
}

export async function aprovarEnsaio(ctx, pedido, ensaioOs, { visivelCampo } = {}) {
  const dados = { status: 'aprovado', aprovado_por_id: ctx.perfil.id, aprovado_em: new Date().toISOString() }
  if (typeof visivelCampo === 'boolean') dados.visivel_campo = visivelCampo
  return executarSequencia([
    {
      op: { tipo: 'update', tabela: 'ensaios_os', id: ensaioOs.id, dados,
            descricao: `Aprovar: ${ensaioOs.nome_ensaio}`, pedidoId: pedido.id },
      local: async () => {
        await patchEnsaioOsLocal(ensaioOs.id, dados)
        await patchPedidoLocal(pedido.id, {}, eventoLocal(ctx, 'Ensaio aprovado', { ensaio: ensaioOs.nome_ensaio }))
      },
    },
    { op: opHistorico(pedido.id, { acao: 'Ensaio aprovado', ensaio: ensaioOs.nome_ensaio }) },
  ])
}

// ── Revisão de fichas online (migração 13) ───────────────────────────────────

/** Salva correções feitas pelo laboratorista na ficha, sem aprovar */
export async function salvarRevisaoFicha(ctx, pedido, ensaioOs, dados) {
  return executarSequencia([{
    op: { tipo: 'rpc', rpc: 'salvar_revisao_ensaio', args: { p_ensaio_os_id: ensaioOs.id, p_dados: dados },
          descricao: `Corrigir ficha: ${ensaioOs.nome_ensaio}`, pedidoId: pedido.id },
    local: async () => { await patchEnsaioOsLocal(ensaioOs.id, { dados_resultado: dados }) },
  }])
}

/**
 * Aprova a ficha online: grava a ficha final, a assinatura do calculista e os
 * resultados normalizados (resultados + resultado_*), que alimentam o Painel.
 */
export async function aprovarEnsaioFicha(ctx, pedido, ensaioOs, {
  dados, resultados, conformidade, observacoes, visivelCampo, assinadoEm,
}) {
  return executarSequencia([{
    op: {
      tipo: 'rpc', rpc: 'aprovar_ensaio',
      args: {
        p_ensaio_os_id: ensaioOs.id, p_dados: dados, p_resultados: resultados || [],
        p_conformidade: conformidade || null, p_observacoes: observacoes || null,
        p_visivel_campo: typeof visivelCampo === 'boolean' ? visivelCampo : null,
        p_assinado_em: assinadoEm,
      },
      descricao: `Aprovar: ${ensaioOs.nome_ensaio}`, pedidoId: pedido.id,
    },
    local: async () => {
      await patchEnsaioOsLocal(ensaioOs.id, {
        status: 'aprovado', dados_resultado: dados, aprovado_por_id: ctx.perfil.id, aprovado_em: new Date().toISOString(),
        ...(typeof visivelCampo === 'boolean' ? { visivel_campo: visivelCampo } : {}),
        assinatura_calculista: { usuario_id: ctx.perfil.id, nome: ctx.perfil.nome, em: assinadoEm },
      })
      await patchPedidoLocal(pedido.id, {}, eventoLocal(ctx, 'Ensaio aprovado', { ensaio: ensaioOs.nome_ensaio }))
    },
  }])
}

export async function devolverAoAssistente(ctx, pedido, ensaioOs, motivo) {
  const dados = {
    status: 'devolvido', devolvido_motivo: motivo,
    devolvido_em: new Date().toISOString(), devolvido_por_id: ctx.perfil.id,
    aprovado_por_id: null, aprovado_em: null,
  }
  return executarSequencia([
    {
      op: { tipo: 'update', tabela: 'ensaios_os', id: ensaioOs.id, dados,
            descricao: `Devolver ao assistente: ${ensaioOs.nome_ensaio}`, pedidoId: pedido.id },
      local: async () => {
        await patchEnsaioOsLocal(ensaioOs.id, dados)
        await patchPedidoLocal(pedido.id, {},
          eventoLocal(ctx, 'Devolvido ao assistente', { ensaio: ensaioOs.nome_ensaio, motivo }))
      },
    },
    { op: opHistorico(pedido.id, { acao: 'Devolvido ao assistente', ensaio: ensaioOs.nome_ensaio, motivo }) },
  ])
}

export async function alterarVisibilidade(ctx, pedido, ensaioOs, visivel) {
  const acao = visivel ? 'Resultado liberado ao campo' : 'Resultado ocultado do campo'
  return executarSequencia([
    {
      op: { tipo: 'update', tabela: 'ensaios_os', id: ensaioOs.id, dados: { visivel_campo: visivel },
            descricao: `${acao}: ${ensaioOs.nome_ensaio}`, pedidoId: pedido.id },
      local: async () => {
        await patchEnsaioOsLocal(ensaioOs.id, { visivel_campo: visivel })
        await patchPedidoLocal(pedido.id, {}, eventoLocal(ctx, acao, { ensaio: ensaioOs.nome_ensaio }))
      },
    },
    { op: opHistorico(pedido.id, { acao, ensaio: ensaioOs.nome_ensaio }) },
  ])
}

/** @param {{dataFinalizacao?: string}} opcoes — ISO; obrigatória no lançamento histórico */
export async function finalizarOS(ctx, pedido, { dataFinalizacao } = {}) {
  const args = { p_pedido_id: pedido.id }
  if (dataFinalizacao) args.p_data = dataFinalizacao
  return executar({
    tipo: 'rpc', rpc: 'finalizar_os', args,
    descricao: 'Finalizar O.S.', pedidoId: pedido.id,
  }, () => patchPedidoLocal(pedido.id, {
    status: 'concluido', finalizado_por: ctx.perfil.id, finalizado_em: new Date().toISOString(),
  }, eventoLocal(ctx, 'O.S. finalizada')))
}

// ── Somente DEV (migração 14): excluir pedido e corrigir o número ────────────
// Operações online e diretas (não entram na fila offline).

export async function excluirPedido(ctx, pedido, confirmacao) {
  if (!navigator.onLine) throw new Error('Excluir pedido só pode ser feito com internet.')
  if (ehIdTemp(pedido.id)) throw new Error('Pedido ainda não sincronizado.')
  const { data, error } = await supabase.rpc('excluir_pedido', { p_pedido_id: pedido.id, p_confirmacao: confirmacao })
  if (error) throw new Error(mensagemErro(error))
  await cacheDelete('pedidos_cache', pedido.id).catch(() => {})
  return { resultado: data, offline: false }
}

export async function alterarNumeroPE(ctx, pedido, sequencial) {
  if (!navigator.onLine) throw new Error('Alterar o número só pode ser feito com internet.')
  const { data, error } = await supabase.rpc('alterar_numero_pe', { p_pedido_id: pedido.id, p_sequencial: sequencial })
  if (error) throw new Error(mensagemErro(error))
  return { resultado: data, offline: false }
}

// ── Fichas FR-IMOB-05 / FR-IMOB-04 ───────────────────────────────────────────

export async function salvarFichaSolicitacao(ctx, pedido, dados) {
  return executarSequencia([
    ...passosAssumir(ctx, pedido),
    {
      op: {
        tipo: 'rpc', rpc: 'salvar_ficha_solicitacao',
        args: { p_pedido_id: pedido.id, p_dados: dados },
        descricao: 'Salvar ficha FR-IMOB-05', pedidoId: pedido.id,
      },
      local: async () => {
        const atual = (await obterPedidoLocal(pedido.id)) || pedido
        await patchPedidoLocal(pedido.id, {
          ficha_sol: {
            ...(atual.ficha_sol || {}), ...dados,
            observacao_editada: true, updated_at: new Date().toISOString(),
          },
        }, eventoLocal(ctx, 'Ficha FR-IMOB-05 salva'))
      },
    },
  ])
}

export async function salvarFichaOS(ctx, pedido, dados) {
  return executar({
    tipo: 'rpc', rpc: 'salvar_ficha_os',
    args: { p_pedido_id: pedido.id, p_dados: dados },
    descricao: 'Salvar ficha FR-IMOB-04', pedidoId: pedido.id,
  }, async () => {
    const atual = (await obterPedidoLocal(pedido.id)) || pedido
    await patchPedidoLocal(pedido.id, {
      ficha_os: {
        ...(atual.ficha_os || {}), ...dados,
        observacao_editada: true, updated_at: new Date().toISOString(),
      },
    }, eventoLocal(ctx, 'Ficha FR-IMOB-04 salva'))
  })
}
