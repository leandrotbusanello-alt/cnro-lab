import { useEffect, useState, useCallback } from 'react'
import { processarFila, contarPendencias, onFilaMudou } from '../lib/syncQueue'

/**
 * Detecta online/offline e envia a fila offline (pedidos do Campo + operações
 * dos demais módulos) quando a conexão volta. Toda a lógica de envio fica em
 * src/lib/syncQueue.js.
 */
export function useOnlineSync() {
  const [online, setOnline] = useState(navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  const atualizarContagem = useCallback(async () => {
    try { setPendingCount(await contarPendencias()) } catch { /* IndexedDB indisponível */ }
  }, [])

  const syncPendentes = useCallback(async () => {
    if (!navigator.onLine) return
    setSyncing(true)
    try {
      await processarFila()
    } finally {
      setSyncing(false)
      atualizarContagem()
    }
  }, [atualizarContagem])

  useEffect(() => {
    function onOnline()  { setOnline(true); syncPendentes() }
    function onOffline() { setOnline(false) }

    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    const parar = onFilaMudou(() => atualizarContagem())

    atualizarContagem()
    if (navigator.onLine) syncPendentes()

    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
      parar()
    }
  }, [syncPendentes, atualizarContagem])

  return { online, syncing, pendingCount, syncPendentes }
}
