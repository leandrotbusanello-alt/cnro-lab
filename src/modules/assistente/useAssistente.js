import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { onFilaMudou } from '../../lib/syncQueue'
import { useAuthStore } from '../../store/authStore'
import { porId } from '../laboratorio/utils'
import * as repo from './assistenteRepo'
import { ehHistorico, exigirOnlineHistorico } from '../../lib/historico'

// ─────────────────────────────────────────────────────────────────────────────
// Estado do Módulo Assistente (compartilhado entre a fila e a execução)
// ─────────────────────────────────────────────────────────────────────────────

export const AssistenteContext = createContext(null)

export function useAssist() {
  const ctx = useContext(AssistenteContext)
  if (!ctx) throw new Error('useAssist deve ser usado dentro do Módulo Assistente')
  return ctx
}

/** Fila: devolvidos primeiro (mais antigos antes), depois os atribuídos há mais tempo */
export function ordenarFila(lista) {
  const t = v => (v ? new Date(v).getTime() : 0)
  return [...lista].sort((a, b) => {
    const da = a.status === 'devolvido' ? 0 : 1
    const db = b.status === 'devolvido' ? 0 : 1
    if (da !== db) return da - db
    if (da === 0) return t(a.devolvido_em) - t(b.devolvido_em)
    return (t(a.data_atribuicao) || t(a.created_at)) - (t(b.data_atribuicao) || t(b.created_at))
  })
}

export function useAssistente() {
  const { perfil } = useAuthStore()
  const [dados, setDados] = useState({
    ensaiosOs: [], pedidos: [], usuarios: [], ensaios: [], empresas: [], fichas: [], modelos: [],
  })
  const [fonte, setFonte] = useState('servidor')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const carregandoRef = useRef(false)
  const pendenteRef = useRef(false)

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    if (!perfil) return
    if (carregandoRef.current) { pendenteRef.current = true; return }
    carregandoRef.current = true
    if (!silencioso) setLoading(true)
    try {
      const r = await repo.carregarDados(perfil)
      setDados({
        ensaiosOs: r.ensaiosOs, pedidos: r.pedidos, usuarios: r.usuarios, ensaios: r.ensaios,
        empresas: r.empresas, fichas: r.fichas, modelos: r.modelos,
      })
      setFonte(r.fonte)
      setErro(null)
    } catch (e) {
      setErro(e.message || 'Erro ao carregar dados.')
    } finally {
      carregandoRef.current = false
      setLoading(false)
      if (pendenteRef.current) { pendenteRef.current = false; carregar({ silencioso: true }) }
    }
  }, [perfil])

  useEffect(() => { carregar() }, [carregar])

  // Atualização automática: tempo real, fila offline, volta da conexão, foco
  useEffect(() => {
    if (!perfil) return undefined
    let timer = null
    const agendar = () => { clearTimeout(timer); timer = setTimeout(() => carregar({ silencioso: true }), 700) }
    let canal = null
    try {
      canal = supabase.channel(`assistente-${perfil.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ensaios_os', filter: `assistente_id=eq.${perfil.id}` }, agendar)
        .subscribe()
    } catch { /* realtime indisponível */ }
    const pararFila = onFilaMudou(ev => { if (ev.tipo === 'fim' && ev.enviados > 0) agendar() })
    const onFoco = () => { if (document.visibilityState === 'visible') agendar() }
    window.addEventListener('online', agendar)
    window.addEventListener('offline', agendar)
    document.addEventListener('visibilitychange', onFoco)
    const intervalo = setInterval(() => { if (navigator.onLine) agendar() }, 120000)
    return () => {
      clearTimeout(timer)
      clearInterval(intervalo)
      pararFila()
      window.removeEventListener('online', agendar)
      window.removeEventListener('offline', agendar)
      document.removeEventListener('visibilitychange', onFoco)
      if (canal) supabase.removeChannel(canal)
    }
  }, [perfil, carregar])

  const indices = useMemo(() => ({
    pedidosPorId: porId(dados.pedidos),
    usuariosPorId: porId(dados.usuarios),
    ensaiosPorId: porId(dados.ensaios),
    empresasPorId: porId(dados.empresas),
    fichasPorId: porId(dados.fichas),
    modelosPorId: porId(dados.modelos),
  }), [dados])

  const fila = useMemo(() => ordenarFila(
    dados.ensaiosOs.filter(eo => ['pendente', 'em_andamento', 'devolvido'].includes(eo.status)
      && !['concluido', 'cancelado'].includes(indices.pedidosPorId[eo.pedido_id]?.status)),
  ), [dados.ensaiosOs, indices.pedidosPorId])

  // Registro do próprio usuário (assinatura cadastrada?)
  const eu = indices.usuariosPorId[perfil?.id] || perfil

  /** Quem executa/assina um ensaio. Lançamento histórico: o assistente atribuído (o DEV age em nome dele). */
  const executorDe = useCallback(eo => {
    const pedido = eo ? indices.pedidosPorId[eo.pedido_id] : null
    return ehHistorico(pedido) ? (indices.usuariosPorId[eo.assistente_id] || null) : eu
  }, [indices, eu])

  const ctxAcao = useMemo(() => ({ perfil, modelos: dados.modelos }), [perfil, dados.modelos])
  const acoes = useMemo(() => {
    const embrulhar = (fn, recarregar = true) => async (...args) => {
      exigirOnlineHistorico(indices.pedidosPorId[args[0]?.pedido_id])   // 1º argumento = ensaio da O.S.
      try { return await fn(ctxAcao, ...args) } finally { if (recarregar) await carregar({ silencioso: true }) }
    }
    return {
      iniciar: embrulhar(repo.iniciarEnsaio),
      salvarRascunho: embrulhar(repo.salvarRascunhoServidor, false),
      enviar: embrulhar(repo.enviarParaRevisao),
    }
  }, [ctxAcao, carregar, indices])

  return {
    perfil, eu, executorDe, ...dados, ...indices, fila, fonte, loading, erro,
    recarregar: carregar, acoes,
  }
}
