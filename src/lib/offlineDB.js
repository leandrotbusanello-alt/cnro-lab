import { openDB } from 'idb'

const DB_NAME = 'cnro_lab'
const DB_VERSION = 1

function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
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
    },
  })
}

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
