import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { cachePerfil, getPerfilCache } from '../lib/offlineDB'

export const useAuthStore = create((set, get) => ({
  perfil: null,
  carregando: true,

  async init() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        await get().carregarPerfil(session.user.id)
      } else {
        set({ carregando: false })
      }
    } catch {
      set({ carregando: false })
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await get().carregarPerfil(session.user.id)
      } else {
        set({ perfil: null, carregando: false })
      }
    })
  },

  async carregarPerfil(userId) {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) throw error

      await cachePerfil(data)
      set({ perfil: data, carregando: false })
    } catch {
      // Offline fallback
      const cached = await getPerfilCache(userId)
      set({ perfil: cached || null, carregando: false })
    }
  },

  async login(email, senha) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) throw error
    await get().carregarPerfil(data.user.id)
  },

  async logout() {
    await supabase.auth.signOut()
    set({ perfil: null })
  },
}))
