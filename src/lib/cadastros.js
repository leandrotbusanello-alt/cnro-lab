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

// ── Peneiras (granulometria dos traços) ─────────────────────────────────────
// Abertura em mm e o nome usado no laboratório (polegadas ou número da peneira).
export const PENEIRAS = [
  { mm: 76.2, nome: '3"' }, { mm: 63.5, nome: '2 1/2"' }, { mm: 50.8, nome: '2"' }, { mm: 38.1, nome: '1 1/2"' },
  { mm: 25.4, nome: '1"' }, { mm: 19.1, nome: '3/4"' }, { mm: 12.7, nome: '1/2"' }, { mm: 9.5, nome: '3/8"' },
  { mm: 6.3, nome: '1/4"' }, { mm: 4.8, nome: 'nº 4' }, { mm: 2.36, nome: 'nº 8' }, { mm: 2.0, nome: 'nº 10' },
  { mm: 1.18, nome: 'nº 16' }, { mm: 0.6, nome: 'nº 30' }, { mm: 0.42, nome: 'nº 40' }, { mm: 0.3, nome: 'nº 50' },
  { mm: 0.18, nome: 'nº 80' }, { mm: 0.15, nome: 'nº 100' }, { mm: 0.075, nome: 'nº 200' },
]
/** Séries prontas para começar a tabela (todas editáveis depois) */
// (o laboratório confere com a norma do traço — DNIT ou DER-SP — e ajusta)
export const SERIES_PENEIRAS = {
  'Série da FR-IMOB-54 (DNIT 031/24)': [38.1, 25.4, 19.1, 12.7, 9.5, 6.3, 4.8, 2.36, 1.18, 0.6, 0.3, 0.15, 0.075],
  'Série com nº 10, 40 e 80': [50.8, 38.1, 25.4, 19.1, 12.7, 9.5, 4.8, 2.0, 0.42, 0.18, 0.075],
  'Série com nº 8, 16, 30, 50 e 100': [25.4, 19.1, 12.7, 9.5, 4.8, 2.36, 1.18, 0.6, 0.3, 0.15, 0.075],
}

export function nomePeneira(mm) {
  const p = PENEIRAS.find(x => Math.abs(x.mm - Number(mm)) < 1e-6)
  return p ? p.nome : ''
}

/** "nº 200 (0,075 mm)" · "1/2\" (12,7 mm)" */
export function rotuloPeneira(mm) {
  const nome = nomePeneira(mm)
  const txt = `${String(mm).replace('.', ',')} mm`
  return nome ? `${nome} (${txt})` : txt
}
