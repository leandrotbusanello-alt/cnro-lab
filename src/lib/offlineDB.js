import { openDB } from 'idb'

// ─────────────────────────────────────────────────────────────────────────────
// Banco local (IndexedDB) compartilhado por todos os módulos.
//
// v1 (Campo): pedidos_pendentes, ensaios_cache, empresas_cache, sync_queue, perfil_cache
// v2 (Lab):   pedidos_cache, ensaios_os_cache, usuarios_cache, fichas_ensaio_cache,
//             arquivos_cache (assinaturas etc.), op_queue (fila ordenada de operações),
//             id_map (ID provisório offline → ID definitivo no servidor)
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = 'cnro_lab'
const DB_VERSION = 2

function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // ── v1 ──
      if (!db.objectStoreNames.contains('pedidos_pendentes')) {
        const store = db.createObjectStore('pedidos_pendentes', { keyPath: 'id' })
        store.createIndex('status', 'status')
      }
      if (!db.objectStoreNames.contains('ensaios_cache')) {
        db.createObjectStore('ensaios_cache', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('empresas_cache')) {
        db.createObjectStore('empresas_cache', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains('perfil_cache')) {
        db.createObjectStore('perfil_cache', { keyPath: 'id' })
      }
      // ── v2 ──
      if (!db.objectStoreNames.contains('pedidos_cache')) {
        db.createObjectStore('pedidos_cache', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('ensaios_os_cache')) {
        const s = db.createObjectStore('ensaios_os_cache', { keyPath: 'id' })
        s.createIndex('pedido_id', 'pedido_id')
      }
      if (!db.objectStoreNames.contains('usuarios_cache')) {
        db.createObjectStore('usuarios_cache', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('fichas_ensaio_cache')) {
        db.createObjectStore('fichas_ensaio_cache', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('arquivos_cache')) {
        db.createObjectStore('arquivos_cache', { keyPath: 'chave' })
      }
      if (!db.objectStoreNames.contains('op_queue')) {
        db.createObjectStore('op_queue', { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains('id_map')) {
        db.createObjectStore('id_map', { keyPath: 'tempId' })
      }
    },
  })
}

// ── Pedidos pendentes (Módulo Campo) ─────────────────────────────────────────

export async function salvarPedidoOffline(pedido) {
  const db = await getDB()
  await db.put('pedidos_pendentes', { ...pedido, status: 'pendente_sync' })
}

export async function getPedidosPendentes() {
  const db = await getDB()
  return db.getAll('pedidos_pendentes')
}

export async function marcarPedidoSincronizado(id) {
  const db = await getDB()
  await db.delete('pedidos_pendentes', id)
}

// ── Caches do Campo ──────────────────────────────────────────────────────────

export async function cacheEnsaios(ensaios) {
  const db = await getDB()
  const tx = db.transaction('ensaios_cache', 'readwrite')
  await Promise.all(ensaios.map(e => tx.store.put(e)))
  await tx.done
}

export async function getEnsaiosCache() {
  const db = await getDB()
  return db.getAll('ensaios_cache')
}

export async function cacheEmpresas(empresas) {
  const db = await getDB()
  const tx = db.transaction('empresas_cache', 'readwrite')
  await Promise.all(empresas.map(e => tx.store.put(e)))
  await tx.done
}

export async function getEmpresasCache() {
  const db = await getDB()
  return db.getAll('empresas_cache')
}

export async function cachePerfil(perfil) {
  const db = await getDB()
  await db.put('perfil_cache', perfil)
}

export async function getPerfilCache(userId) {
  const db = await getDB()
  return db.get('perfil_cache', userId)
}

// ── Cache genérico (v2) ──────────────────────────────────────────────────────
// Stores: pedidos_cache, ensaios_os_cache, usuarios_cache, fichas_ensaio_cache,
//         ensaios_cache, empresas_cache

/** Substitui todo o conteúdo de um store pelos registros informados. */
export async function cacheSubstituir(store, registros) {
  const db = await getDB()
  const tx = db.transaction(store, 'readwrite')
  await tx.store.clear()
  await Promise.all((registros || []).map(r => tx.store.put(r)))
  await tx.done
}

/** Insere/atualiza registros sem apagar os demais. */
export async function cachePutVarios(store, registros) {
  const db = await getDB()
  const tx = db.transaction(store, 'readwrite')
  await Promise.all((registros || []).map(r => tx.store.put(r)))
  await tx.done
}

export async function cachePut(store, registro) {
  const db = await getDB()
  await db.put(store, registro)
}

export async function cacheGet(store, id) {
  const db = await getDB()
  return db.get(store, id)
}

export async function cacheGetAll(store) {
  const db = await getDB()
  return db.getAll(store)
}

export async function cacheDelete(store, id) {
  const db = await getDB()
  await db.delete(store, id)
}

// ── Arquivos (assinaturas, imagens) ──────────────────────────────────────────

export async function arquivoSalvar(chave, blob) {
  const db = await getDB()
  await db.put('arquivos_cache', { chave, blob, salvoEm: new Date().toISOString() })
}

export async function arquivoObter(chave) {
  const db = await getDB()
  const r = await db.get('arquivos_cache', chave)
  return r?.blob || null
}

// ── Fila de operações (v2) ───────────────────────────────────────────────────

export async function filaAdicionar(op) {
  const db = await getDB()
  return db.add('op_queue', op)
}

export async function filaListar() {
  const db = await getDB()
  const ops = await db.getAll('op_queue')
  return ops.sort((a, b) => a.id - b.id)
}

export async function filaAtualizar(op) {
  const db = await getDB()
  await db.put('op_queue', op)
}

export async function filaRemover(id) {
  const db = await getDB()
  await db.delete('op_queue', id)
}

// ── Mapa de IDs provisórios ──────────────────────────────────────────────────

export async function idMapSalvar(tempId, realId) {
  const db = await getDB()
  await db.put('id_map', { tempId, realId, em: new Date().toISOString() })
}

export async function idMapTodos() {
  const db = await getDB()
  const itens = await db.getAll('id_map')
  return Object.fromEntries(itens.map(i => [i.tempId, i.realId]))
}
