// =============================================================================
// CNRO Lab Control — Edge Function `gestor-usuarios`
// =============================================================================
// Operações que exigem a chave de administrador (service_role), que NUNCA vai
// para o navegador:
//   criar          → cria o login (senha 123456) + registro em `usuarios`
//   editar         → altera dados; se o e-mail mudar, altera também no login
//   status         → Ativo / Inativo (Inativo bloqueia o login na hora)
//   resetar_senha  → volta a senha para 123456 e obriga a troca
//   trocar_senha   → o próprio usuário define a nova senha
//
// As gravações em `usuarios` feitas em nome do Gestor usam o login DELE
// (RLS + guarda do banco valem, e a auditoria registra quem fez).
// =============================================================================

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'

const SENHA_PADRAO = '123456'
const PERFIS = ['DEV', 'GESTOR', 'LAB', 'ASSIST', 'CAMPO']
const BAN_INATIVO = '876000h' // ~100 anos

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

class Falha extends Error {}

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Quem pode gerenciar usuários de cada perfil */
function podeGerenciar(ator: string, perfilAlvo: string) {
  if (ator === 'DEV') return true
  if (ator === 'GESTOR') return ['LAB', 'ASSIST', 'CAMPO'].includes(perfilAlvo)
  return false
}

function traduzirErro(e: any): string {
  const msg = String(e?.message || e || '')
  const code = String(e?.code || '')
  if (code === 'email_exists' || /already (been )?registered|already exists/i.test(msg)) {
    return 'Já existe um login com este e-mail.'
  }
  if (code === 'weak_password' || /password/i.test(msg) && /weak|short|at least|characters/i.test(msg)) {
    return 'Senha recusada pelo Supabase (fraca ou curta demais). Verifique as regras de senha em Authentication → Providers → Email.'
  }
  if (code === 'same_password' || /different from the old/i.test(msg)) {
    return 'A nova senha deve ser diferente da atual.'
  }
  if (/duplicate key.*email/i.test(msg)) return 'Já existe um usuário com este e-mail.'
  if (code === 'P0001') return msg
  return msg || 'Erro inesperado.'
}

function limparEmail(v: unknown) {
  return String(v || '').trim().toLowerCase()
}

function validarEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Falha('E-mail inválido.')
}

function texto(v: unknown) {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}

async function acharLoginPorEmail(admin: SupabaseClient, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const achado = data.users.find(u => (u.email || '').toLowerCase() === email)
    if (achado) return achado
    if (data.users.length < 1000) return null
  }
  return null
}

/** Cria o login (ou reaproveita um login órfão com o mesmo e-mail) com a senha padrão */
async function criarLogin(admin: SupabaseClient, email: string, nome: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: SENHA_PADRAO,
    email_confirm: true,
    user_metadata: { nome },
  })
  if (!error) return { authId: data.user.id, criado: true }

  if (traduzirErro(error) !== 'Já existe um login com este e-mail.') throw error

  // Login já existe no Auth: reaproveita se não estiver ligado a ninguém
  const existente = await acharLoginPorEmail(admin, email)
  if (!existente) throw error
  const { data: ligado } = await admin.from('usuarios').select('id, nome').eq('auth_id', existente.id).maybeSingle()
  if (ligado) throw new Falha(`Este e-mail já é o login de ${ligado.nome}.`)
  const { error: e2 } = await admin.auth.admin.updateUserById(existente.id, {
    password: SENHA_PADRAO, ban_duration: 'none', email_confirm: true,
  })
  if (e2) throw e2
  return { authId: existente.id, criado: false }
}

/** Outro registro de `usuarios` com o mesmo e-mail (sem diferenciar maiúsculas) */
async function usuarioComEmail(admin: SupabaseClient, email: string, excetoId?: string) {
  const padrao = email.replace(/[\\%_]/g, '\\$&')
  let q = admin.from('usuarios').select('id, nome').ilike('email', padrao).limit(1)
  if (excetoId) q = q.neq('id', excetoId)
  const { data, error } = await q
  if (error) throw error
  return (data || [])[0] || null
}

async function carregarUsuario(admin: SupabaseClient, id: unknown) {
  if (!id) throw new Falha('Usuário não informado.')
  const { data, error } = await admin.from('usuarios').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new Falha('Usuário não encontrado.')
  return data
}

async function empresaValida(admin: SupabaseClient, empresaId: unknown) {
  if (!empresaId) return null
  const { data } = await admin.from('empresas').select('id').eq('id', empresaId).maybeSingle()
  if (!data) throw new Falha('Empresa não encontrada.')
  return data.id as string
}

// -----------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return resposta({ ok: false, erro: 'Método não permitido.' })

  try {
    if (!URL_SUPABASE || !SERVICE_KEY || !ANON_KEY) {
      throw new Falha('Função sem configuração (SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY).')
    }

    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return resposta({ ok: false, erro: 'Sessão não informada. Entre novamente.' })

    const admin = createClient(URL_SUPABASE, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    // Cliente com o login de quem chamou (RLS + guarda + auditoria)
    const comoAtor = createClient(URL_SUPABASE, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // ── Quem está chamando ───────────────────────────────────────────────────
    const { data: quem, error: eQuem } = await admin.auth.getUser(token)
    if (eQuem || !quem?.user) return resposta({ ok: false, erro: 'Sessão expirada. Entre novamente.' })

    const { data: linhas } = await admin.from('usuarios').select('*')
      .or(`auth_id.eq.${quem.user.id},id.eq.${quem.user.id}`)
    const ator = (linhas || []).find(u => u.auth_id === quem.user.id) || (linhas || [])[0]
    if (!ator || (ator.status || 'Ativo') !== 'Ativo') {
      return resposta({ ok: false, erro: 'Usuário sem acesso.' })
    }
    const perfilAtor = String(ator.perfil || '').toUpperCase()

    const corpo = await req.json().catch(() => ({}))
    const acao = String(corpo?.acao || '')
    const d = corpo?.dados || {}

    // ── Troca da própria senha (qualquer perfil) ──────────────────────────────
    if (acao === 'trocar_senha') {
      const nova = String(d.nova || '')
      if (nova.length < 6) throw new Falha('A senha deve ter pelo menos 6 caracteres.')
      if (nova === SENHA_PADRAO) throw new Falha('Escolha uma senha diferente da senha padrão.')
      const { error } = await admin.auth.admin.updateUserById(quem.user.id, { password: nova })
      if (error) throw error
      const { error: e2 } = await admin.from('usuarios').update({ trocar_senha: false }).eq('id', ator.id)
      if (e2) throw e2
      return resposta({ ok: true })
    }

    // ── Daqui em diante: só DEV / GESTOR ─────────────────────────────────────
    if (!['DEV', 'GESTOR'].includes(perfilAtor)) {
      return resposta({ ok: false, erro: 'Somente o Gestor pode gerenciar usuários.' })
    }

    // ── Criar ─────────────────────────────────────────────────────────────────
    if (acao === 'criar') {
      const nome = texto(d.nome)
      const email = limparEmail(d.email)
      const perfil = String(d.perfil || '').toUpperCase()
      if (!nome) throw new Falha('Informe o nome.')
      validarEmail(email)
      if (!PERFIS.includes(perfil)) throw new Falha('Perfil inválido.')
      if (!podeGerenciar(perfilAtor, perfil)) throw new Falha(`Somente o DEV pode cadastrar usuários ${perfil}.`)
      const empresaId = await empresaValida(admin, d.empresa_id)

      const mesmo = await usuarioComEmail(admin, email)
      if (mesmo) throw new Falha(`Já existe um usuário com este e-mail (${mesmo.nome}).`)

      const login = await criarLogin(admin, email, nome)
      const { data: novo, error } = await comoAtor.from('usuarios').insert({
        auth_id: login.authId,
        nome, email, perfil,
        cargo: texto(d.cargo),
        empresa_id: empresaId,
        status: 'Ativo',
        trocar_senha: true,
      }).select('*').single()
      if (error) {
        if (login.criado) await admin.auth.admin.deleteUser(login.authId).catch(() => {})
        throw error
      }
      return resposta({ ok: true, usuario: novo, senha: SENHA_PADRAO })
    }

    // ── Editar ────────────────────────────────────────────────────────────────
    if (acao === 'editar') {
      const alvo = await carregarUsuario(admin, d.id)
      const proprio = alvo.id === ator.id
      const nome = texto(d.nome)
      const email = limparEmail(d.email)
      const perfil = String(d.perfil || alvo.perfil).toUpperCase()
      if (!nome) throw new Falha('Informe o nome.')
      validarEmail(email)
      if (!PERFIS.includes(perfil)) throw new Falha('Perfil inválido.')
      if (proprio) {
        if (perfil !== alvo.perfil) throw new Falha('Você não pode alterar o próprio perfil.')
      } else if (!podeGerenciar(perfilAtor, alvo.perfil) || !podeGerenciar(perfilAtor, perfil)) {
        throw new Falha('Somente o DEV pode alterar usuários GESTOR ou DEV.')
      }
      const empresaId = await empresaValida(admin, d.empresa_id)

      const emailMudou = email !== limparEmail(alvo.email)
      if (emailMudou) {
        const mesmo = await usuarioComEmail(admin, email, alvo.id)
        if (mesmo) throw new Falha(`Já existe um usuário com este e-mail (${mesmo.nome}).`)
        if (alvo.auth_id) {
          const { error } = await admin.auth.admin.updateUserById(alvo.auth_id, { email, email_confirm: true })
          if (error) throw error
        }
      }

      const { data: atualizado, error } = await comoAtor.from('usuarios').update({
        nome, email, perfil,
        cargo: texto(d.cargo),
        empresa_id: empresaId,
      }).eq('id', alvo.id).select('*').single()
      if (error) {
        if (emailMudou && alvo.auth_id) {
          await admin.auth.admin.updateUserById(alvo.auth_id, { email: alvo.email, email_confirm: true }).catch(() => {})
        }
        throw error
      }
      return resposta({ ok: true, usuario: atualizado })
    }

    // ── Ativar / inativar ───────────────────────────────────────────────────
    if (acao === 'status') {
      const alvo = await carregarUsuario(admin, d.id)
      const status = d.status === 'Inativo' ? 'Inativo' : 'Ativo'
      if (alvo.id === ator.id) throw new Falha('Você não pode alterar o próprio status.')
      if (!podeGerenciar(perfilAtor, alvo.perfil)) throw new Falha('Somente o DEV pode alterar usuários GESTOR ou DEV.')

      const { data: atualizado, error } = await comoAtor.from('usuarios')
        .update({ status }).eq('id', alvo.id).select('*').single()
      if (error) throw error

      let aviso = null
      if (alvo.auth_id) {
        const { error: eBan } = await admin.auth.admin.updateUserById(alvo.auth_id, {
          ban_duration: status === 'Inativo' ? BAN_INATIVO : 'none',
        })
        if (eBan) aviso = 'Status alterado, mas não foi possível bloquear/desbloquear o login: ' + traduzirErro(eBan)
      }
      return resposta({ ok: true, usuario: atualizado, aviso })
    }

    // ── Resetar senha (ou criar o login de quem ainda não tem) ─────────────
    if (acao === 'resetar_senha') {
      const alvo = await carregarUsuario(admin, d.id)
      if (alvo.id === ator.id) throw new Falha('Para a sua própria senha, use "Trocar minha senha".')
      if (!podeGerenciar(perfilAtor, alvo.perfil)) throw new Falha('Somente o DEV pode alterar usuários GESTOR ou DEV.')

      const mudancas: Record<string, unknown> = { trocar_senha: true }
      let loginCriado = false
      if (alvo.auth_id) {
        const { error } = await admin.auth.admin.updateUserById(alvo.auth_id, { password: SENHA_PADRAO })
        if (error) throw error
      } else {
        const email = limparEmail(alvo.email)
        validarEmail(email)
        const login = await criarLogin(admin, email, alvo.nome)
        mudancas.auth_id = login.authId
        loginCriado = login.criado
        if ((alvo.status || 'Ativo') !== 'Ativo') {
          await admin.auth.admin.updateUserById(login.authId, { ban_duration: BAN_INATIVO }).catch(() => {})
        }
      }

      const { data: atualizado, error } = await comoAtor.from('usuarios')
        .update(mudancas).eq('id', alvo.id).select('*').single()
      if (error) {
        if (loginCriado) await admin.auth.admin.deleteUser(String(mudancas.auth_id)).catch(() => {})
        throw error
      }
      return resposta({ ok: true, usuario: atualizado, senha: SENHA_PADRAO, loginCriado: !alvo.auth_id })
    }

    return resposta({ ok: false, erro: 'Ação desconhecida.' })
  } catch (e) {
    if (!(e instanceof Falha)) console.error('[gestor-usuarios]', e)
    return resposta({ ok: false, erro: traduzirErro(e) })
  }
})
