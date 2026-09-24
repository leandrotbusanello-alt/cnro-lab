import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { onFilaMudou } from '../../lib/syncQueue'
import { useAuthStore } from '../../store/authStore'
import * as repo from './labRepo'
import { PERFIS_GESTAO, STATUS_ABERTOS } from './constants'
import { porId } from './utils'

// ─────────────────────────────────────────────────────────────────────────────
// Estado do Módulo Laboratório (compartilhado entre a lista e o detalhe)
// ─────────────────────────────────────────────────────────────────────────────

const LabContext = createContext(null)

export function useLab() {
  const ctx = useContext(LabContext)
  if (!ctx) throw new Error('useLab deve ser usado dentro de <LabProvider>')
  return ctx
}

export { LabContext }

export function useLaboratorio() {
  const { perfil } = useAuthStore()
  const [dados, setDados] = useState({
    pedidos: [], ensaiosOs: [], usuarios: [], ensaios: [], empresas: [], fichas: [],
  })
  const [fonte, setFonte] = useState('servidor')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [atualizadoEm, setAtualizadoEm] = useState(null)
  const carregandoRef = useRef(false)
  const pendenteRef = useRef(false)

  // ── Carregar ──────────────────────────────────────────────────────────────
  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    if (carregandoRef.current) { pendenteRef.current = true; return }
    carregandoRef.current = true
    if (!silencioso) setLoading(true)
    try {
      const r = await repo.carregarDados()
      setDados({
        pedidos: r.pedidos, ensaiosOs: r.ensaiosOs, usuarios: r.usuarios,
        ensaios: r.ensaios, empresas: r.empresas, fichas: r.fichas,
      })
      setFonte(r.fonte)
      setErro(null)
      setAtualizadoEm(new Date())
    } catch (e) {
      setErro(e.message || 'Erro ao carregar dados.')
    } finally {
      carregandoRef.current = false
      setLoading(false)
      if (pendenteRef.current) {
        pendenteRef.current = false
        carregar({ silencioso: true })
      }
    }
  }, [])

  useEffect(() => { if (perfil) carregar() }, [perfil, carregar])

  // ── Atualização automática ───────────────────────────────────────────────
  useEffect(() => {
    let timer = null
    const agendar = () => {
      clearTimeout(timer)
      timer = setTimeout(() => carregar({ silencioso: true }), 700)
    }

    // Tempo real (novos pedidos, ensaios enviados pelos assistentes etc.)
    let canal = null
    try {
      canal = supabase.channel('lab-fila')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_ensaio' }, agendar)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ensaios_os' }, agendar)
        .subscribe()
    } catch { /* realtime indisponível: segue com as demais atualizações */ }

    // Fila offline terminou de enviar → recarrega
    const pararFila = onFilaMudou(ev => { if (ev.tipo === 'fim' && ev.enviados > 0) agendar() })

    const onOnline = () => agendar()
    const onOffline = () => carregar({ silencioso: true })
    const onFoco = () => { if (document.visibilityState === 'visible') agendar() }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onFoco)
    const intervalo = setInterval(() => { if (navigator.onLine) agendar() }, 120000)

    return () => {
      clearTimeout(timer)
      clearInterval(intervalo)
      pararFila()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onFoco)
      if (canal) supabase.removeChannel(canal)
    }
  }, [carregar])

  // ── Índices ──────────────────────────────────────────────────────────────
  const indices = useMemo(() => {
    const ensaiosOsPorPedido = {}
    for (const eo of dados.ensaiosOs) {
      (ensaiosOsPorPedido[eo.pedido_id] ||= []).push(eo)
    }
    Object.values(ensaiosOsPorPedido).forEach(l => l.sort((a, b) =>
      (a.nome_ensaio || '').localeCompare(b.nome_ensaio || '', 'pt-BR')))
    return {
      pedidosPorId: porId(dados.pedidos),
      usuariosPorId: porId(dados.usuarios),
      ensaiosPorId: porId(dados.ensaios),
      empresasPorId: porId(dados.empresas),
      fichasPorId: porId(dados.fichas),
      ensaiosOsPorPedido,
    }
  }, [dados])

  const perfilSigla = String(perfil?.perfil || '').toUpperCase()
  const ehGestor = PERFIS_GESTAO.includes(perfilSigla)

  // ── Regras de permissão (espelham as regras do banco) ────────────────────
  const permissoes = useCallback((pedido) => {
    if (!pedido || !perfil) return {}
    const souResp = pedido.laboratorista_id === perfil.id
    const livre = !pedido.laboratorista_id
    const aberto = STATUS_ABERTOS.includes(pedido.status)
    const preOS = ['aguardando_lab', 'em_analise'].includes(pedido.status)
    const posOS = ['em_andamento', 'aguardando_revisao'].includes(pedido.status)
    return {
      souResp,
      livre,
      podeAnalisar: preOS && (souResp || livre),
      podeGerenciarOS: posOS && souResp,
      podeTransferir: aberto && pedido.status !== 'devolvido_campo' && !livre && (souResp || ehGestor),
      somenteLeitura: !(souResp || livre) || !aberto,
    }
  }, [perfil, ehGestor])

  // ── Ações (recarregam ao terminar) ───────────────────────────────────────
  const ctxAcao = useMemo(() => ({
    perfil,
    ensaiosPorId: indices.ensaiosPorId,
    usuariosPorId: indices.usuariosPorId,
    empresasPorId: indices.empresasPorId,
  }), [perfil, indices])

  const acoes = useMemo(() => {
    const embrulhar = fn => async (...args) => {
      try {
        return await fn(ctxAcao, ...args)
      } finally {
        await carregar({ silencioso: true })
      }
    }
    return {
      salvarEdicao:         embrulhar(repo.salvarEdicao),
      devolverAoCampo:      embrulhar(repo.devolverAoCampo),
      gerarOS:              embrulhar(repo.gerarOS),
      transferirOS:         embrulhar(repo.transferirOS),
      atualizarAtribuicao:  embrulhar(repo.atualizarAtribuicao),
      adicionarEnsaioNaOS:  embrulhar(repo.adicionarEnsaioNaOS),
      removerEnsaioDaOS:    embrulhar(repo.removerEnsaioDaOS),
      aprovarEnsaio:        embrulhar(repo.aprovarEnsaio),
      devolverAoAssistente: embrulhar(repo.devolverAoAssistente),
      alterarVisibilidade:  embrulhar(repo.alterarVisibilidade),
      finalizarOS:          embrulhar(repo.finalizarOS),
      salvarFichaSolicitacao: embrulhar(repo.salvarFichaSolicitacao),
      salvarFichaOS:          embrulhar(repo.salvarFichaOS),
    }
  }, [ctxAcao, carregar])

  return {
    perfil, ehGestor,
    ...dados, ...indices,
    fonte, loading, erro, atualizadoEm,
    recarregar: carregar,
    permissoes,
    acoes,
    urlAssinatura: repo.urlAssinatura,
    urlArquivo: repo.urlArquivo,
    carregarResultadoDetalhado: repo.carregarResultadoDetalhado,
  }
}
