import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import {
  salvarPedidoOffline, getPedidosPendentes, marcarPedidoSincronizado,
  cacheEnsaios, getEnsaiosCache, cacheEmpresas, getEmpresasCache,
} from '../../lib/offlineDB'

export function useCampo() {
  const { perfil } = useAuthStore()
  const [empresas, setEmpresas] = useState([])
  const [ensaios, setEnsaios]   = useState([])
  const [pedidos, setPedidos]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  // ── Load data ──────────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      if (navigator.onLine) {
        // Fix: campo correto é 'nome' (não 'nome_fantasia')
        const { data: emp, error: empErr } = await supabase
          .from('empresas')
          .select('id, nome, cnpj, lote')
          .order('nome')
        if (empErr) console.warn('[useCampo] empresas:', empErr.message)
        if (emp && emp.length > 0) { setEmpresas(emp); await cacheEmpresas(emp) }
        else if (emp && emp.length === 0) {
          // Pode ser RLS — tenta o cache offline
          const cached = await getEmpresasCache()
          if (cached?.length) setEmpresas(cached)
        }

        // Ensaios da tabela (tabela ainda usada para outros módulos)
        const { data: ens } = await supabase.from('ensaios').select('*').order('nome')
        if (ens) { setEnsaios(ens); await cacheEnsaios(ens) }

        // Pedidos do usuário atual com nome da empresa
        const { data: peds } = await supabase
          .from('pedidos_ensaio')
          .select('*, empresa:empresas(nome)')
          .eq('solicitante_id', perfil?.id)
          .order('created_at', { ascending: false })
          .limit(50)
        if (peds) setPedidos(peds)
      } else {
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

  // ── Upload de arquivo (certificado ligante asfáltico → bucket 'documentos') ──
  const uploadCertificado = useCallback(async (file) => {
    if (!file) return null
    const ext = file.name.split('.').pop()
    const path = `certificados/${Date.now()}_${perfil?.id}.${ext}`
    const { error } = await supabase.storage.from('documentos').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('documentos').getPublicUrl(path)
    return data.publicUrl
  }, [perfil?.id])

  // ── Enviar novo pedido ─────────────────────────────────────────────────────
  const enviarPedido = useCallback(async (dados) => {
    const payload = {
      empresa_id:       dados.empresa_id,
      lote:             dados.lote,
      tipo_solicitacao: dados.tipo_solicitacao,
      observacoes:      dados.observacoes,
      tipo_amostra:     dados.material,   // coluna no banco é tipo_amostra
      sub_tipo:         dados.sub_tipo,
      ensaios_ids:      dados.ensaios_ids,
      dados_amostra:    dados.dados_amostra,
      solicitante_id:   perfil?.id,
      status:           'aguardando_lab',
      created_at:       new Date().toISOString(),
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

  // ── Corrigir pedido devolvido (UPDATE, não INSERT) ─────────────────────────
  const corrigirPedido = useCallback(async (pedidoId, dadosCorrigidos) => {
    if (!navigator.onLine) {
      const tempPayload = { id: pedidoId, ...dadosCorrigidos, status: 'pendente_sync' }
      await salvarPedidoOffline(tempPayload)
      setPedidos(prev => prev.map(p => p.id === pedidoId ? tempPayload : p))
      return { offline: true }
    }

    const { data, error } = await supabase
      .from('pedidos_ensaio')
      .update({
        ...dadosCorrigidos,
        status: 'aguardando_lab',
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
    enviarPedido, corrigirPedido, reenviarPedido, uploadCertificado,
    recarregar: carregar,
  }
}
