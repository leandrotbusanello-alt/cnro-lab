import { supabase } from './supabase'
import {
  getPedidosPendentes, marcarPedidoSincronizado,
  filaAdicionar, filaListar, filaAtualizar, filaRemover,
  idMapSalvar, idMapTodos,
} from './offlineDB'

// ─────────────────────────────────────────────────────────────────────────────
// Fila offline genérica — compartilhada por todos os módulos.
//
// Cada ação feita sem internet vira uma "operação" guardada no aparelho, na
// ordem em que aconteceu. Quando a conexão volta, a fila é enviada na mesma
// ordem. Registros criados offline usam IDs provisórios ("offline_…"); ao
// serem gravados no servidor, o ID definitivo é guardado em id_map e as
// operações seguintes são traduzidas automaticamente.
//
// Formato de uma operação:
//   { tipo: 'insert' | 'update' | 'delete' | 'rpc',
//     tabela, id, dados,            // insert/update/delete
//     rpc, args,                    // rpc
//     tempId,                       // insert: ID provisório do registro criado
//     pos,                          // pós-processamento (ver POS_PROCESSADORES)
//     posArgs,
//     descricao, pedidoId }         // exibição na tela / agrupamento
//
// Se uma operação falha, a fila PARA (as seguintes podem depender dela) e o
// erro fica visível para o usuário decidir: tentar de novo ou descartar.
// ─────────────────────────────────────────────────────────────────────────────

export const PREFIXO_TEMP = 'offline_'

export function ehIdTemp(id) {
  return typeof id === 'string' && id.startsWith(PREFIXO_TEMP)
}

export function novoIdTemp(tipo = 'reg') {
  const rnd = Math.random().toString(36).slice(2, 8)
  return `${PREFIXO_TEMP}${tipo}_${Date.now().toString(36)}_${rnd}`
}

// ── Ouvintes (para a interface atualizar contadores) ─────────────────────────

const ouvintes = new Set()

export function onFilaMudou(fn) {
  ouvintes.add(fn)
  return () => ouvintes.delete(fn)
}

function notificar(evento = {}) {
  ouvintes.forEach(fn => {
    try { fn(evento) } catch { /* ignora ouvinte com erro */ }
  })
}

// ── Mensagens de erro amigáveis ──────────────────────────────────────────────

export function mensagemErro(e) {
  const msg = e?.message || String(e || 'Erro desconhecido')
  if (e?.code === 'PGRST116' || /0 rows|no rows/i.test(msg)) {
    return 'Sem permissão para alterar este registro (verifique se você é o responsável).'
  }
  if (e?.code === '42501' || /row-level security/i.test(msg)) {
    return 'Sem permissão para esta ação.'
  }
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    return 'Sem conexão com o servidor.'
  }
  return msg
}

function erro(e) {
  const err = new Error(mensagemErro(e))
  err.original = e
  err.code = e?.code
  return err
}

// ── Tradução de IDs provisórios ──────────────────────────────────────────────

function traduzir(valor, mapa) {
  if (typeof valor === 'string') return mapa[valor] || valor
  if (Array.isArray(valor)) return valor.map(v => traduzir(v, mapa))
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, traduzir(v, mapa)]))
  }
  return valor
}

export function contemIdTemp(valor) {
  if (typeof valor === 'string') return ehIdTemp(valor)
  if (Array.isArray(valor)) return valor.some(contemIdTemp)
  if (valor && typeof valor === 'object') return Object.values(valor).some(contemIdTemp)
  return false
}

// ── Pós-processadores ────────────────────────────────────────────────────────
// Executados após uma operação dar certo, para mapear IDs criados pelo servidor.

const POS_PROCESSADORES = {
  /**
   * Após gerar_os: o servidor cria as linhas de ensaios_os. Mapeia as linhas
   * provisórias criadas no aparelho ({tempId, ensaio_id}) para as definitivas.
   */
  async mapear_ensaios_os(resultado, posArgs = {}, mapa) {
    const pedidoId = traduzir(posArgs.pedidoId, mapa)
    const itens = posArgs.itens || []
    if (!pedidoId || itens.length === 0) return
    const { data, error } = await supabase
      .from('ensaios_os').select('id, ensaio_id').eq('pedido_id', pedidoId)
    if (error) throw error
    for (const it of itens) {
      const real = data.find(d => d.ensaio_id === it.ensaio_id)
      if (real) {
        await idMapSalvar(it.tempId, real.id)
        mapa[it.tempId] = real.id
      }
    }
  },
}

// ── Execução de uma operação ─────────────────────────────────────────────────

export async function executarOperacao(op, mapa = {}) {
  let resultado = null

  if (op.tipo === 'insert') {
    const { data, error } = await supabase.from(op.tabela).insert(op.dados).select().single()
    if (error) throw erro(error)
    resultado = data
    if (op.tempId && data?.id) {
      await idMapSalvar(op.tempId, data.id)
      mapa[op.tempId] = data.id
    }
  } else if (op.tipo === 'update') {
    const { data, error } = await supabase.from(op.tabela).update(op.dados).eq('id', op.id).select()
    if (error) throw erro(error)
    if (!data || data.length === 0) throw erro({ code: 'PGRST116', message: '0 rows' })
    resultado = data[0]
  } else if (op.tipo === 'delete') {
    const { error } = await supabase.from(op.tabela).delete().eq('id', op.id)
    if (error) throw erro(error)
  } else if (op.tipo === 'rpc') {
    const { data, error } = await supabase.rpc(op.rpc, op.args || {})
    if (error) throw erro(error)
    resultado = data
  } else {
    throw new Error(`Tipo de operação desconhecido: ${op.tipo}`)
  }

  if (op.pos && POS_PROCESSADORES[op.pos]) {
    await POS_PROCESSADORES[op.pos](resultado, op.posArgs, mapa)
  }
  return resultado
}

// ── Enfileirar ───────────────────────────────────────────────────────────────

export async function enfileirar(op) {
  const id = await filaAdicionar({ ...op, status: 'pendente', criadoEm: new Date().toISOString() })
  notificar({ tipo: 'enfileirado' })
  return id
}

/**
 * Enfileira substituindo operações pendentes com a mesma `chave` (ex.: rascunho
 * de uma ficha salvo várias vezes offline → só o último é enviado).
 * Operações com erro não são removidas.
 */
export async function enfileirarUnico(op) {
  if (op.chave) {
    const ops = await filaListar()
    for (const o of ops) {
      if (o.chave === op.chave && o.status !== 'erro') await filaRemover(o.id)
    }
  }
  return enfileirar(op)
}

// ── Pedidos criados/corrigidos offline pelo Módulo Campo ─────────────────────

const COLUNAS_PEDIDO_CAMPO = [
  'empresa_id', 'empresa', 'lote', 'observacoes', 'material', 'sub_tipo', 'tipo_amostra',
  'tipo_solicitacao', 'ensaios_ids', 'dados_amostra', 'solicitante_id', 'created_at',
]

function filtrarColunas(obj, colunas) {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => colunas.includes(k)))
}

async function sincronizarPedidosCampo(mapa, res) {
  const pendentes = await getPedidosPendentes()
  for (const p of pendentes) {
    try {
      if (ehIdTemp(p.id)) {
        if (mapa[p.id]) {                      // já enviado antes
          await marcarPedidoSincronizado(p.id)
          continue
        }
        const dados = { ...filtrarColunas(p, COLUNAS_PEDIDO_CAMPO), offline_id: p.id }
        let realId = null
        const { data, error } = await supabase.from('pedidos_ensaio').insert(dados).select('id').single()
        if (error) {
          if (error.code !== '23505') throw error  // 23505 = já existe (envio repetido)
          const { data: ex, error: e2 } = await supabase
            .from('pedidos_ensaio').select('id').eq('offline_id', p.id).single()
          if (e2) throw e2
          realId = ex.id
        } else {
          realId = data.id
        }
        await idMapSalvar(p.id, realId)
        mapa[p.id] = realId
      } else {
        // Correção offline de um pedido que já existe no servidor
        const dados = filtrarColunas(p, COLUNAS_PEDIDO_CAMPO.filter(c => c !== 'created_at'))
        const { error } = await supabase
          .from('pedidos_ensaio').update({ ...dados, status: 'aguardando_lab' }).eq('id', p.id)
        if (error) throw error
      }
      await marcarPedidoSincronizado(p.id)
      res.enviados++
    } catch (e) {
      res.errosCampo.push({ id: p.id, erro: mensagemErro(e) })
    }
  }
}

// ── Processar a fila ─────────────────────────────────────────────────────────

let emAndamento = null

/** Envia tudo o que estiver pendente. Chamadas simultâneas compartilham a mesma execução. */
export function processarFila() {
  if (!emAndamento) {
    emAndamento = _processar().finally(() => { emAndamento = null })
  }
  return emAndamento
}

async function _processar() {
  const res = { enviados: 0, erro: null, errosCampo: [], offline: false }
  if (!navigator.onLine) { res.offline = true; return res }

  notificar({ tipo: 'inicio' })
  try {
    const mapa = await idMapTodos()
    await sincronizarPedidosCampo(mapa, res)

    const ops = await filaListar()
    for (const op of ops) {
      if (op.status === 'erro') { res.erro = op; break }

      const traduzida = {
        ...op,
        id: traduzir(op.id, mapa),
        dados: traduzir(op.dados, mapa),
        args: traduzir(op.args, mapa),
      }
      if (contemIdTemp([traduzida.id, traduzida.dados, traduzida.args])) {
        const falha = { ...op, status: 'erro', erro: 'Depende de um registro que ainda não foi sincronizado.' }
        await filaAtualizar(falha)
        res.erro = falha
        break
      }

      try {
        await executarOperacao(traduzida, mapa)
        await filaRemover(op.id)
        res.enviados++
      } catch (e) {
        const falha = { ...op, status: 'erro', erro: e.message || mensagemErro(e) }
        await filaAtualizar(falha)
        res.erro = falha
        break
      }
    }
  } finally {
    notificar({ tipo: 'fim', ...res })
  }
  return res
}

// ── Consultas e ações sobre a fila (para a interface) ────────────────────────

export async function listarFila() {
  return filaListar()
}

export async function contarPendencias() {
  const [ops, pedidos] = await Promise.all([filaListar(), getPedidosPendentes()])
  return ops.length + pedidos.length
}

export async function descartarOperacao(id) {
  await filaRemover(id)
  notificar({ tipo: 'descartado' })
}

/** Descarta a operação com erro e todas as seguintes do mesmo pedido. */
export async function descartarOperacoesDoPedido(pedidoId) {
  const ops = await filaListar()
  for (const op of ops) {
    if (op.pedidoId === pedidoId) await filaRemover(op.id)
  }
  notificar({ tipo: 'descartado' })
}

export async function tentarNovamente(id) {
  const ops = await filaListar()
  const op = ops.find(o => o.id === id)
  if (op) await filaAtualizar({ ...op, status: 'pendente', erro: null })
  return processarFila()
}

/** true se não há nada na fila (útil para decidir executar direto ou enfileirar). */
export async function filaVazia() {
  const ops = await filaListar()
  return ops.length === 0
}
