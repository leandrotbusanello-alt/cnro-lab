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
        // Empresas (incluindo lote para preenchimento automático)
        const { data: emp } = await supabase
          .from('empresas')
          .select('id, nome_fantasia, cnpj, lote')
          .order('nome_fantasia')
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

  // ── Enviar novo pedido ─────────────────────────────────────────────────────
  const enviarPedido = useCallback(async (dados) => {
    // Bug 2 fix: payload alinhado com schema da tabela pedidos_ensaio
    // solicitante_id vem do perfil; dados_amostra é o nome correto no banco
    const payload = {
      empresa_id:    dados.empresa_id,
      lote:          dados.lote,
      observacoes:   dados.observacoes,
      material:      dados.material,
      sub_tipo:      dados.sub_tipo,
      ensaios_ids:   dados.ensaios_ids,
      dados_amostra: dados.dados_amostra,
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

  // ── Bug 4 fix: Corrigir pedido devolvido via UPDATE (não INSERT) ───────────
  const corrigirPedido = useCallback(async (pedidoId, dadosCorrigidos) => {
    if (!navigator.onLine) {
      // Offline: salvar correção pendente localmente
      const tempPayload = { id: pedidoId, ...dadosCorrigidos, status: 'pendente_sync' }
      await salvarPedidoOffline(tempPayload)
      setPedidos(prev => prev.map(p => p.id === pedidoId ? tempPayload : p))
      return { offline: true }
    }

    const { data, error } = await supabase
      .from('pedidos_ensaio')
      .update({
        ...dadosCorrigidos,
        status: 'aguardando_analise',
        updated_at: new Date().toISOString(),
      })
      .eq('id', pedidoId)
      .select()
      .single()
    if (error) throw error

    setPedidos(prev => prev.map(p => p.id === pedidoId ? data : p))
    return { data }
  }, [])

  // ── Reenviar pedido offline (pendente_sync) ────────────────────────────────
  const reenviarPedido = useCallback(async (id) => {
    const pendentes = await getPedidosPendentes()
    const pedido = pendentes.find(p => p.id === id)
    if (!pedido) return

    const { id: tempId, status, ...dados } = pedido

    // Se é uma correção de pedido existente (id não começa com 'offline_')
    // o id original foi preservado no payload
    const { data, error } = await supabase
      .from('pedidos_ensaio')
      .insert(dados)
      .select()
      .single()
    if (error) throw error

    await marcarPedidoSincronizado(id)
    setPedidos(prev => prev.map(p => p.id === id ? { ...data } : p))
    return { data }
  }, [])

  return {
    empresas, ensaios, pedidos, loading, error,
    enviarPedido, corrigirPedido, reenviarPedido,
    recarregar: carregar,
  }
}
