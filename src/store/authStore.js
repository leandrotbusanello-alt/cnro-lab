import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { cachePerfil, cacheGetAll } from '../lib/offlineDB'
import { chamarGestorUsuarios } from '../lib/gestorUsuarios'

const INTERVALO_VERIFICACAO_MS = 60_000

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

/** Mensagens do Supabase Auth traduzidas */
function traduzirErroLogin(e) {
  const msg = String(e?.message || '')
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/banned/i.test(msg)) return 'Usuário inativo. Procure o Gestor.'
  if (/email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado. Procure o Gestor.'
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  return msg || 'Não foi possível entrar.'
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
  /** Mensagem exibida na tela de login (ex.: acesso desativado pelo Gestor) */
  avisoLogin: '',
  _iniciado: false,

  limparAviso() { set({ avisoLogin: '' }) },

  async init() {
    if (get()._iniciado) return
    set({ _iniciado: true })

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

    // Usuário inativado pelo Gestor perde o acesso sem precisar sair e entrar
    setInterval(() => { get().verificarAcesso() }, INTERVALO_VERIFICACAO_MS)
    window.addEventListener('focus', () => { get().verificarAcesso() })
    window.addEventListener('online', () => { get().verificarAcesso() })
  },

  /** Confere no banco se o usuário logado continua ativo (e se precisa trocar a senha). */
  async verificarAcesso() {
    const atual = get().perfil
    if (!atual?.id || !navigator.onLine) return
    try {
      const { data, error } = await supabase
        .from('usuarios').select('id, status, trocar_senha, perfil').eq('id', atual.id).maybeSingle()
      if (error) return
      if (!data || (data.status || 'Ativo') !== 'Ativo') {
        await supabase.auth.signOut().catch(() => {})
        set({ perfil: null, avisoLogin: 'Seu acesso foi desativado. Procure o Gestor.' })
        return
      }
      if (data.trocar_senha !== atual.trocar_senha || String(data.perfil).toUpperCase() !== atual.perfil) {
        await get().recarregarPerfil()
      }
    } catch { /* sem conexão: tenta de novo depois */ }
  },

  async recarregarPerfil() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return null
    return get().carregarPerfil(session.user.id).catch(() => null)
  },

  /** O próprio usuário define uma nova senha (primeiro acesso, reset ou recuperação). */
  async trocarSenha(nova) {
    await chamarGestorUsuarios('trocar_senha', { nova })
    const p = get().perfil
    if (p) {
      const perfil = { ...p, trocar_senha: false }
      await cachePerfil(perfil).catch(() => {})
      set({ perfil })
    }
  },

  /** Envia o e-mail de recuperação com link para definir uma nova senha. */
  async recuperarSenha(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(String(email).trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    if (error) {
      if (/rate limit|security purposes|seconds/i.test(error.message || '')) {
        throw new Error('Aguarde um pouco antes de pedir outro e-mail.')
      }
      throw new Error(error.message || 'Não foi possível enviar o e-mail.')
    }
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
        set({ perfil: null, carregando: false, avisoLogin: 'Usuário inativo. Procure o Gestor.' })
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
    set({ avisoLogin: '' })
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email).trim().toLowerCase(), password: senha,
    })
    if (error) throw new Error(traduzirErroLogin(error))
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
