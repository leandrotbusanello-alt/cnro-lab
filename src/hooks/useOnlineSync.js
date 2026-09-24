import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getPedidosPendentes, marcarPedidoSincronizado } from '../lib/offlineDB'

export function useOnlineSync() {
  const [online, setOnline] = useState(navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  const syncPendentes = useCallback(async () => {
    if (!navigator.onLine) return
    setSyncing(true)
    try {
      const pendentes = await getPedidosPendentes()
      setPendingCount(pendentes.length)

      for (const pedido of pendentes) {
        const { id, status, ...dados } = pedido
        const { error } = await supabase.from('pedidos_ensaio').insert(dados)
        if (!error) {
          await marcarPedidoSincronizado(id)
          setPendingCount(c => Math.max(0, c - 1))
        }
      }
    } finally {
      setSyncing(false)
    }
  }, [])

  useEffect(() => {
    async function atualizarContagem() {
      const p = await getPedidosPendentes()
      setPendingCount(p.length)
    }

    function onOnline()  { setOnline(true);  syncPendentes(); atualizarContagem() }
    function onOffline() { setOnline(false) }

    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    atualizarContagem()

    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [syncPendentes])

  return { online, syncing, pendingCount }
}
