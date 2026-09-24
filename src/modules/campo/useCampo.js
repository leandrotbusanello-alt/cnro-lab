import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import {
  salvarPedidoOffline, getPedidosPendentes, marcarPedidoSincronizado,
  cacheEnsaios, getEnsaiosCache, cacheEmpresas, getEmpresasCache,
} from '../../lib/offlineDB'

export function useCampo() {
  const { perfil } = useAuthStore()
  const [empresas, setEmpresas]   = useState([])
  const [ensaios, setEnsaios]     = useState([])
  const [pedidos, setPedidos]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  // ── Load data ─────────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      if (navigator.onLine) {
        // Empresas
        const { data: emp } = await supabase.from('empresas').select('id, nome_fantasia, cnpj').order('nome_fantasia')
        if (emp) { setEmpresas(emp); await cacheEmpresas(emp) }

        // Ensaios disponíveis
        const { data: ens } = await supabase.from('ensaios').select('*').order('nome')
        if (ens) { setEnsaios(ens); await cacheEnsaios(ens) }

        // Pedidos do usuário atual
        const { data: peds } = await supabase
          .from('pedidos_ensaio')
          .select('*, empresa:empresas(nome_fantasia)')
          .eq('solicitante_id', perfil?.id)
          .order('created_at', { ascending: false })
          .limit(50)
        if (peds) setPedidos(peds)
      } else {
        // Offline fallback
        const [empCache, ensCache, pendentes] = await Promise.all([
          getEmpresasCache(),
          getEnsaiosCache(),
          getPedidosPendentes(),
        ])
        setEmpresas(empCache)
        setEnsaios(ensCache)
        setPedidos(pendentes)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [perfil?.id])

  useEffect(() => { if (perfil) carregar() }, [perfil, carregar])

  // ── Enviar pedido ──────────────────────────────────────────────────────────
  const enviarPedido = useCallback(async (dados) => {
    const payload = {
      ...dados,
      solicitante_id: perfil?.id,
      status: 'aguardando_analise',
      created_at: new Date().toISOString(),
    }

    if (!navigator.onLine) {
      const tempId = `offline_${Date.now()}`
      await salvarPedidoOffline({ id: tempId, ...payload })
      setPedidos(prev => [{ id: tempId, ...payload, status: 'pendente_sync' }, ...prev])
      return { offline: true }
    }

    const { data, error } = await supabase.from('pedidos_ensaio').insert(payload).select().single()
    if (error) throw error
    setPedidos(prev => [data, ...prev])
    return { data }
  }, [perfil?.id])

  // ── Reenviar pedido offline ────────────────────────────────────────────────
  const reenviarPedido = useCallback(async (id) => {
    const pendentes = await getPedidosPendentes()
    const pedido = pendentes.find(p => p.id === id)
    if (!pedido) return

    const { id: _, status, ...dados } = pedido
    const { data, error } = await supabase.from('pedidos_ensaio').insert(dados).select().single()
    if (error) throw error

    await marcarPedidoSincronizado(id)
    setPedidos(prev => prev.map(p => p.id === id ? { ...data } : p))
    return { data }
  }, [])

  return { empresas, ensaios, pedidos, loading, error, enviarPedido, reenviarPedido, recarregar: carregar }
}
