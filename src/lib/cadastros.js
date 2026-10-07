// ─────────────────────────────────────────────────────────────────────────────
// Cadastros (migração 17): traços aprovados, jazidas, pedreiras e fornecedores de ligante.
// Lidos por todos (o Campo escolhe nas listas); alterados pelo Laboratório e Gestor/DEV.
// A última leitura fica guardada no aparelho (dashboard_cache, chave "cadastros")
// para o Campo preencher pedidos sem internet.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { cacheGet, cachePut } from './offlineDB'

const CHAVE_CACHE = 'cadastros'
export const DIAS_ALERTA_TRACO = 30

export const TIPOS_CADASTRO = {
  tracos:       { tabela: 'tracos_aprovados',     titulo: 'Traços aprovados',        singular: 'traço' },
  jazidas:      { tabela: 'jazidas',              titulo: 'Jazidas',                 singular: 'jazida' },
  pedreiras:    { tabela: 'pedreiras',            titulo: 'Pedreiras',               singular: 'pedreira' },
  fornecedores: { tabela: 'fornecedores_ligante', titulo: 'Fornecedores de ligante', singular: 'fornecedor' },
}

const VAZIO = { tracos: [], jazidas: [], pedreiras: [], fornecedores: [] }

export async function carregarCadastros() {
  if (!navigator.onLine) {
    const c = await cacheGet('dashboard_cache', CHAVE_CACHE).catch(() => null)
    return { ...VAZIO, ...(c?.dados || {}), offline: true }
  }
  const ler = (tabela, ordem) => supabase.from(tabela).select('*').order(ordem)
    .then(r => { if (r.error) throw r.error; return r.data || [] })
  const [tracos, jazidas, pedreiras, fornecedores] = await Promise.all([
    ler('tracos_aprovados', 'nome_traco'), ler('jazidas', 'nome'), ler('pedreiras', 'nome'), ler('fornecedores_ligante', 'nome'),
  ])
  const dados = { tracos, jazidas, pedreiras, fornecedores }
  await cachePut('dashboard_cache', { chave: CHAVE_CACHE, dados, em: new Date().toISOString() }).catch(() => {})
  return dados
}

/** Hook: cadastros + recarregar. Falha de rede cai no que está guardado no aparelho. */
export function useCadastros() {
  const [dados, setDados] = useState(VAZIO)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  const recarregar = useCallback(async () => {
    setLoading(true)
    try {
      setDados(await carregarCadastros())
      setErro(null)
    } catch (e) {
      const c = await cacheGet('dashboard_cache', CHAVE_CACHE).catch(() => null)
      if (c?.dados) setDados({ ...VAZIO, ...c.dados })
      setErro(e.message || 'Não foi possível carregar os cadastros.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { recarregar() }, [recarregar])
  return { ...dados, loading, erro, recarregar }
}

// ── Validade dos traços ──────────────────────────────────────────────────────

function hoje() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * { codigo, rotulo, dias }
 *   vigente · vence (até 30 dias) · vencido · sem_validade
 */
export function statusTraco(t) {
  if (!t?.valido_ate) return { codigo: 'sem_validade', rotulo: 'Validade não informada', dias: null }
  const fim = new Date(`${String(t.valido_ate).slice(0, 10)}T00:00:00`)
  const dias = Math.round((fim - hoje()) / 86400000)
  if (dias < 0) return { codigo: 'vencido', rotulo: `Vencido há ${-dias} dia(s)`, dias }
  if (dias <= DIAS_ALERTA_TRACO) return { codigo: 'vence', rotulo: dias === 0 ? 'Vence hoje' : `Vence em ${dias} dia(s)`, dias }
  return { codigo: 'vigente', rotulo: 'Vigente', dias }
}

/** aprovado_em + 6 meses (AAAA-MM-DD) */
export function validadePadrao(aprovadoEm) {
  if (!aprovadoEm) return ''
  const [a, m, d] = aprovadoEm.split('-').map(Number)
  const r = new Date(a, m - 1 + 6, d)
  return `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, '0')}-${String(r.getDate()).padStart(2, '0')}`
}

/** Traços oferecidos no pedido: ativos, da empresa escolhida (ou sem empresa) */
export function tracosDaEmpresa(tracos, empresaId) {
  return (tracos || [])
    .filter(t => t.ativo !== false)
    .filter(t => !empresaId || !t.empresa_id || t.empresa_id === empresaId)
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA' */
export function dataBR(iso) {
  if (!iso) return '—'
  const [a, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
