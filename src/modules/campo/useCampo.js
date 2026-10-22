import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import {
  salvarPedidoOffline, getPedidosPendentes,
  cacheEnsaios, getEnsaiosCache, cacheEmpresas, getEmpresasCache,
} from '../../lib/offlineDB'
import { novoIdTemp, processarFila } from '../../lib/syncQueue'
import { ehDev } from '../../lib/historico'

export function useCampo() {
  const { perfil } = useAuthStore()
  const [empresas, setEmpresas]   = useState([])
  const [ensaios, setEnsaios]     = useState([])
  const [pedidos, setPedidos]     = useState([])
  const [usuarios, setUsuarios]   = useState([])   // só o DEV (lançamento histórico)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  // ── Load data ─────────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      let online = navigator.onLine
      if (online) {
        try {
          const ok = r => { if (r.error) throw r.error; return r.data || [] }
          // Consultas independentes: em paralelo (antes uma esperava a outra)
          const [emp, ens, us, peds, pendentesTodos] = await Promise.all([
            // Empresas (incluindo lote para preenchimento automático)
            // (seção 14, item 1) a tabela tem nome/lote/rodovia — não há nome_fantasia/cnpj
            supabase.from('empresas').select('*').order('nome').then(ok),
            // Ensaios disponíveis
            supabase.from('ensaios').select('*').order('nome').then(ok),
            // Usuários (DEV: escolher solicitante e laboratorista do lançamento histórico)
            ehDev(perfil)
              ? supabase.from('usuarios').select('id, nome, cargo, perfil, status, modulos_acesso').order('nome').then(ok)
              : Promise.resolve([]),
            // Pedidos do usuário atual (lançamentos históricos não aparecem aqui)
            supabase.from('pedidos_ensaio')
              .select('*')   // (item 2) empresa = texto preenchido pelo banco a partir de empresa_id
              .eq('solicitante_id', perfil?.id)
              .eq('lancamento_historico', false)
              .order('created_at', { ascending: false })
              .limit(50)
              .then(ok),
            getPedidosPendentes(),
          ])
          const ativas = emp.filter(e => e.ativo !== false)
          setEmpresas(ativas)
          setEnsaios(ens)
          setUsuarios(us)
          // pedidos ainda guardados no aparelho continuam visíveis até sincronizar
          const idsServidor = new Set(peds.map(x => x.id))
          const pendentes = pendentesTodos.filter(p => !idsServidor.has(p.id))
          setPedidos([...pendentes.map(p => ({ ...p, status: 'pendente_sync' })), ...peds])
          setError(null)
          await Promise.all([cacheEmpresas(ativas), cacheEnsaios(ens)]).catch(() => {})
        } catch (e) {
          // Conexão caiu no meio (ou o servidor falhou): usa o que está no aparelho
          setError(e?.message || 'Erro ao carregar dados.')
          online = false
        }
      }
      if (!online) {
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
  }, [perfil])

  useEffect(() => { if (perfil) carregar() }, [perfil, carregar])

  // ── Enviar novo pedido ─────────────────────────────────────────────────────
  const enviarPedido = useCallback(async (dados) => {
    // Payload alinhado com o banco (Referência Técnica, seção 6):
    // material (não tipo_amostra), ensaios_ids = ids do catálogo `ensaios`,
    // especificacoes = colunas espec_* da FR-IMOB-04 (migração 15)
    const payload = {
      empresa_id:       dados.empresa_id,
      lote:             dados.lote,
      tipo_solicitacao: dados.tipo_solicitacao || 'rotina',
      observacoes:      dados.observacoes,
      material:         dados.material,
      sub_tipo:         dados.sub_tipo,
      ensaios_ids:      dados.ensaios_ids,
      especificacoes:   dados.especificacoes || [],
      dados_amostra:    dados.dados_amostra,
      traco_id:         dados.traco_id || null,   // projeto adotado (cadastro de traços — migração 17)
      solicitante_id:   perfil?.id,
      status: 'aguardando_lab',   // (item 3) nome oficial do status
      created_at: new Date().toISOString(),
    }

    // Lançamento histórico (somente DEV; o banco confere): solicitante, laboratorista,
    // data da solicitação e nº do PE (opcional) informados; só com internet.
    if (dados.historico) {
      if (!navigator.onLine) throw new Error('Lançamento histórico só pode ser feito com internet.')
      payload.lancamento_historico = true
      payload.solicitante_id = dados.historico.solicitante_id
      payload.laboratorista_id = dados.historico.laboratorista_id
      payload.created_at = dados.historico.created_at
      if (dados.historico.sequencial) payload.sequencial = dados.historico.sequencial
      const { data, error } = await supabase.from('pedidos_ensaio').insert(payload).select().single()
      if (error) throw error
      return { data, historico: true }
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

  // ── Certificado do ligante (bucket privado `certificados` — migração 15) ────
  // Caminho: certificados/<usuarios.id>/<data>_<arquivo>. Guardado na amostra como
  // "certificados/…" (o Laboratório abre com link temporário). Precisa de internet.
  const uploadCertificado = useCallback(async (file) => {
    if (!file) return null
    if (!navigator.onLine) throw new Error('Para anexar o certificado é preciso internet. Envie sem o anexo ou tente de novo com conexão.')
    const limpo = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '_').slice(-80)
    const caminho = `${perfil?.id}/${Date.now()}_${limpo}`
    const { error } = await supabase.storage.from('certificados').upload(caminho, file, { upsert: false })
    if (error) throw new Error(`Não foi possível anexar o certificado: ${error.message}`)
    return `certificados/${caminho}`
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
    empresas, ensaios, pedidos, usuarios, loading, error,
    enviarPedido, corrigirPedido, reenviarPedido, uploadCertificado,
    recarregar: carregar,
  }
}
