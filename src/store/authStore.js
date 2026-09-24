import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { cachePerfil, cacheGetAll } from '../lib/offlineDB'

// ─────────────────────────────────────────────────────────────────────────────
// Módulos liberados por perfil (usado enquanto a coluna usuarios.modulos_acesso
// não existir no banco; se existir e estiver preenchida, ela tem prioridade).
// ─────────────────────────────────────────────────────────────────────────────
export const MODULOS_POR_PERFIL = {
  DEV:    ['dashboard', 'campo', 'laboratorio', 'assistente', 'gestor'],
  GESTOR: ['dashboard', 'campo', 'laboratorio', 'assistente', 'gestor'],
  LAB:    ['dashboard', 'campo', 'laboratorio', 'assistente'],
  ASSIST: ['assistente'],
  CAMPO:  ['campo'],
}

function completarPerfil(u) {
  if (!u) return null
  const sigla = String(u.perfil || '').toUpperCase()
  const modulos = Array.isArray(u.modulos_acesso) && u.modulos_acesso.length
    ? u.modulos_acesso
    : (MODULOS_POR_PERFIL[sigla] || [])
  return { ...u, perfil: sigla, modulos_acesso: modulos }
}

function ehErroDeRede(e) {
  return !navigator.onLine || /fetch|network|Failed to fetch/i.test(e?.message || '')
}

/** Perfil salvo no aparelho (login offline). O vínculo é auth_id; aceita id por compatibilidade. */
async function perfilDoCache(authId) {
  try {
    const todos = await cacheGetAll('perfil_cache')
    return todos.find(p => p.auth_id === authId) || todos.find(p => p.id === authId) || null
  } catch {
    return null
  }
}

export const useAuthStore = create((set, get) => ({
  perfil: null,
  carregando: true,

  async init() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        await get().carregarPerfil(session.user.id).catch(() => {})
      } else {
        set({ carregando: false })
      }
    } catch {
      set({ carregando: false })
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await get().carregarPerfil(session.user.id).catch(() => {})
      } else {
        set({ perfil: null, carregando: false })
      }
    })
  },

  /**
   * Carrega o registro de `usuarios` do login atual.
   * O vínculo com o Supabase Auth é `usuarios.auth_id` (aceita também `usuarios.id`).
   * Lança erro com mensagem amigável se o perfil não existir ou estiver inativo.
   */
  async carregarPerfil(authId) {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .or(`auth_id.eq.${authId},id.eq.${authId}`)
      if (error) throw error

      const registro = (data || []).find(u => u.auth_id === authId) || (data || [])[0]
      if (!registro) {
        set({ perfil: null, carregando: false })
        throw new Error('Login sem perfil cadastrado no sistema. Procure o Gestor.')
      }
      if ((registro.status || 'Ativo') !== 'Ativo') {
        set({ perfil: null, carregando: false })
        throw new Error('Usuário inativo. Procure o Gestor.')
      }

      const perfil = completarPerfil(registro)
      await cachePerfil(perfil).catch(() => {})
      set({ perfil, carregando: false })
      return perfil
    } catch (e) {
      if (ehErroDeRede(e)) {
        // Sem internet: usa o perfil salvo neste aparelho
        const cached = completarPerfil(await perfilDoCache(authId))
        set({ perfil: cached, carregando: false })
        if (cached) return cached
        throw new Error('Sem conexão e nenhum login salvo neste aparelho.')
      }
      set({ carregando: false })
      throw e
    }
  },

  async login(email, senha) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) throw error
    try {
      return await get().carregarPerfil(data.user.id)
    } catch (e) {
      // Login válido mas sem perfil utilizável: encerra a sessão para não ficar "meio logado"
      if (!ehErroDeRede(e)) await supabase.auth.signOut().catch(() => {})
      throw e
    }
  },

  async logout() {
    await supabase.auth.signOut()
    set({ perfil: null })
  },
}))
