import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { modulosDoUsuario } from '../../lib/modulos'
import { PERFIS_GESTAO } from '../laboratorio/constants'
import * as repo from './dashboardRepo'
import { navegarPeriodo, ehPeriodoAtual } from './periodo'

/**
 * Estado do Painel Interno: período selecionado, contadores calculados e
 * atualização automática (tempo real + volta da conexão), seguindo o mesmo
 * padrão de useLaboratorio/useAssistente.
 */
export function useDashboard() {
  const { perfil } = useAuthStore()
  const [tipoPeriodo, setTipoPeriodo] = useState('mes')
  const [referencia, setReferencia] = useState(() => new Date())
  const [resultado, setResultado] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const carregandoRef = useRef(false)
  const pendenteRef = useRef(false)

  const modulos = useMemo(() => (perfil ? modulosDoUsuario(perfil) : []), [perfil])
  const perfilSigla = String(perfil?.perfil || '').toUpperCase()
  const ehGestor = PERFIS_GESTAO.includes(perfilSigla)

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    if (!perfil) return
    if (carregandoRef.current) { pendenteRef.current = true; return }
    carregandoRef.current = true
    if (!silencioso) setLoading(true)
    try {
      const r = await repo.carregar({ tipoPeriodo, referencia, comCancelados: ehGestor })
      setResultado(r)
      setErro(null)
    } catch (e) {
      setErro(e.message || 'Erro ao carregar o painel.')
    } finally {
      carregandoRef.current = false
      setLoading(false)
      if (pendenteRef.current) { pendenteRef.current = false; carregar({ silencioso: true }) }
    }
  }, [perfil, tipoPeriodo, referencia, ehGestor])

  useEffect(() => { carregar() }, [carregar])

  // Atualização automática: tempo real, volta da conexão, foco na aba
  useEffect(() => {
    if (!perfil) return undefined
    let timer = null
    const agendar = () => { clearTimeout(timer); timer = setTimeout(() => carregar({ silencioso: true }), 800) }
    let canal = null
    try {
      canal = supabase.channel('dashboard-painel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_ensaio' }, agendar)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ensaios_os' }, agendar)
        .subscribe()
    } catch { /* realtime indisponível */ }
    const onOnline = () => agendar()
    const onFoco = () => { if (document.visibilityState === 'visible') agendar() }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onFoco)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onFoco)
      if (canal) supabase.removeChannel(canal)
    }
  }, [perfil, carregar])

  // ── Navegação de período ─────────────────────────────────────────────────
  // Só pode avançar se o período atual da tela já ficou no passado
  // (não faz sentido "ver o mês que vem").
  const podeAvancar = !ehPeriodoAtual(tipoPeriodo, referencia)

  function mudarTipoPeriodo(tipo) { setTipoPeriodo(tipo); setReferencia(new Date()) }
  function irParaPeriodoAtual() { setReferencia(new Date()) }
  function navegar(direcao) {
    if (direcao > 0 && !podeAvancar) return
    setReferencia(navegarPeriodo(tipoPeriodo, referencia, direcao))
  }

  return {
    perfil, modulos, ehGestor,
    tipoPeriodo, referencia,
    mudarTipoPeriodo, navegar, irParaPeriodoAtual,
    podeAvancar,
    dados: resultado?.dados || null,
    fonte: resultado?.fonte || 'servidor',
    atualizadoEm: resultado?.atualizadoEm || null,
    semDadosDoPeriodo: resultado?.semDadosDoPeriodo || false,
    loading, erro,
    recarregar: carregar,
  }
}
