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

  async carregarPerfil(userId, emailFallback) {
    try {
      // 1ª tentativa: busca pelo auth_id (coluna que liga auth.users → usuarios)
      let { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('auth_id', userId)
        .maybeSingle()

      // 2ª tentativa: se não achou pelo auth_id, tenta pelo email (usuários antigos)
      if (!data && emailFallback) {
        const res = await supabase
          .from('usuarios')
          .select('*')
          .eq('email', emailFallback)
          .maybeSingle()
        data  = res.data
        error = res.error

        // Se achou pelo email, grava o auth_id para futuras sessões
        if (data && !data.auth_id) {
          await supabase
            .from('usuarios')
            .update({ auth_id: userId })
            .eq('id', data.id)
        }
      }

      if (error) throw error
      if (!data) throw new Error('Usuário não encontrado na tabela usuarios.')

      await cachePerfil(data)
      set({ perfil: data, carregando: false })
    } catch (e) {
      // Offline fallback
      const cached = await getPerfilCache(userId)
      if (cached) {
        set({ perfil: cached, carregando: false })
      } else {
        set({ perfil: null, carregando: false })
        throw e   // propaga para o login mostrar o erro
      }
    }
  },

  async login(email, senha) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) throw error
    // Passa o email como fallback para achar usuários sem auth_id preenchido
    await get().carregarPerfil(data.user.id, email)
  },

  async logout() {
    await supabase.auth.signOut()
    set({ perfil: null })
  },
}))
