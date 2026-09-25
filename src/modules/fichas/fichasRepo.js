// ─────────────────────────────────────────────────────────────────────────────
// Modelos das fichas online (fichas_modelo) — com cópia no aparelho para uso offline
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from '../../lib/supabase'
import { cacheGet, cacheGetAll, cachePut, cachePutVarios } from '../../lib/offlineDB'

const COLUNAS_LISTA = 'id, ficha_ensaio_id, codigo, versao, titulo, ativo, publicado_em, motor, hash'

/** Lista (sem o conteúdo) de todos os modelos. Offline: o que estiver no aparelho. */
export async function listarModelos() {
  if (navigator.onLine) {
    try {
      const { data, error } = await supabase.from('fichas_modelo').select(COLUNAS_LISTA).order('publicado_em', { ascending: false })
      if (error) throw error
      // guarda a lista, preservando o conteúdo já baixado
      const locais = Object.fromEntries((await cacheGetAll('fichas_modelo_cache')).map(m => [m.id, m]))
      await cachePutVarios('fichas_modelo_cache', (data || []).map(m => {
        const l = locais[m.id]
        return l && l.hash === m.hash ? { ...l, ...m } : { ...m, modelo: undefined, mapa_resultados: undefined }
      }))
      return data || []
    } catch { /* segue com o cache */ }
  }
  const locais = await cacheGetAll('fichas_modelo_cache')
  return locais.map(({ modelo, mapa_resultados, ...r }) => r)  // eslint-disable-line no-unused-vars
}

/** Modelo vigente de uma ficha (o ativo publicado por último) */
export function modeloVigente(modelos, fichaEnsaioId) {
  return (modelos || [])
    .filter(m => m.ficha_ensaio_id === fichaEnsaioId && m.ativo !== false)
    .sort((a, b) => String(b.publicado_em).localeCompare(String(a.publicado_em)))[0] || null
}

/** Modelo completo (conteúdo + mapa de resultados). Baixa uma vez e guarda no aparelho. */
export async function obterModelo(id) {
  if (!id) return null
  const local = await cacheGet('fichas_modelo_cache', id)
  if (local?.modelo) return local
  if (!navigator.onLine) return null
  const { data, error } = await supabase.from('fichas_modelo').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (data) await cachePut('fichas_modelo_cache', data)
  return data
}

/** Baixa antecipadamente os modelos informados (para trabalhar offline depois). */
export async function prepararModelos(ids) {
  for (const id of new Set((ids || []).filter(Boolean))) {
    try { await obterModelo(id) } catch { /* tenta de novo na próxima carga */ }
  }
}
