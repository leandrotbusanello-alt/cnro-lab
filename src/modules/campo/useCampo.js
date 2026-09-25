import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import {
  salvarPedidoOffline, getPedidosPendentes,
  cacheEnsaios, getEnsaiosCache, cacheEmpresas, getEmpresasCache,
} from '../../lib/offlineDB'
import { novoIdTemp, processarFila } from '../../lib/syncQueue'

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
        // (seção 14, item 1) a tabela tem nome/lote/rodovia — não há nome_fantasia/cnpj
        const { data: emp } = await supabase
          .from('empresas')
          .select('*')
          .order('nome')
        if (emp) {
          const ativas = emp.filter(e => e.ativo !== false)
          setEmpresas(ativas)
          await cacheEmpresas(ativas)
        }

        // Ensaios disponíveis
        const { data: ens } = await supabase.from('ensaios').select('*').order('nome')
        if (ens) { setEnsaios(ens); await cacheEnsaios(ens) }

        // Pedidos do usuário atual
        const { data: peds } = await supabase
          .from('pedidos_ensaio')
          .select('*')   // (item 2) empresa = texto preenchido pelo banco a partir de empresa_id
          .eq('solicitante_id', perfil?.id)
          .order('created_at', { ascending: false })
          .limit(50)
        // pedidos ainda guardados no aparelho continuam visíveis até sincronizar
        const pendentes = (await getPedidosPendentes()).filter(p => !(peds || []).some(x => x.id === p.id))
        setPedidos([...pendentes.map(p => ({ ...p, status: 'pendente_sync' })), ...(peds || [])])
      } else {
        // Offline fallback
        const [empCache, ensCache, pendentes] = await Promise.all([
          getEmpresasCache(),
          getEnsaiosCache(),
          getPedidosPendentes(),
        ])
        setEmpresas(empCache)
        setEnsaios(ensCache)
        setPedidos(pendentes.map(p => ({ ...p, status: 'pendente_sync' })))
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
      status: 'aguardando_lab',   // (item 3) nome oficial do status
      created_at: new Date().toISOString(),
    }

    if (!navigator.onLine) {
      const tempId = novoIdTemp()
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

  // ── Reenviar pedidos guardados no aparelho (pendente_sync) ─────────────────
  // (seção 14, item 6) usa a fila de sincronização oficial: evita pedido duplicado
  // e trata tanto pedidos novos quanto correções feitas offline.
  const reenviarPedido = useCallback(async () => {
    if (!navigator.onLine) throw new Error('Sem conexão. O pedido será enviado quando a internet voltar.')
    const r = await processarFila()
    await carregar()
    return r
  }, [carregar])

  return {
    empresas, ensaios, pedidos, loading, error,
    enviarPedido, corrigirPedido, reenviarPedido,
    recarregar: carregar,
  }
}
