import { supabase } from '../../lib/supabase'
import { chamarGestorUsuarios } from '../../lib/gestorUsuarios'

// ─── Leitura ────────────────────────────────────────────────────────────────
export async function listarUsuarios() {
  const { data, error } = await supabase.from('usuarios').select('*').order('nome')
  if (error) throw error
  return data || []
}

export async function listarEmpresas() {
  const { data, error } = await supabase.from('empresas').select('*').order('nome').order('lote')
  if (error) throw error
  return data || []
}

// ─── Usuários (Edge Function: mexe no login) ───────────────────────────────
export const criarUsuario   = dados => chamarGestorUsuarios('criar', dados)
export const editarUsuario  = dados => chamarGestorUsuarios('editar', dados)
export const alterarStatus  = (id, status) => chamarGestorUsuarios('status', { id, status })
export const resetarSenha   = id => chamarGestorUsuarios('resetar_senha', { id })

// ─── Assinatura e foto (Storage privado) ───────────────────────────────────
const ARQUIVOS = {
  assinatura: { bucket: 'assinaturas', coluna: 'assinatura_url', prefixo: 'assinatura' },
  foto:       { bucket: 'fotos',       coluna: 'foto_url',       prefixo: 'foto' },
}

function extensao(file) {
  const porNome = (file.name.split('.').pop() || '').toLowerCase()
  if (['png', 'jpg', 'jpeg', 'webp'].includes(porNome)) return porNome === 'jpeg' ? 'jpg' : porNome
  return file.type === 'image/png' ? 'png' : 'jpg'
}

/**
 * Envia o arquivo com nome novo a cada troca (evita imagem antiga em cache nos
 * aparelhos), grava o caminho no usuário e apaga o arquivo anterior.
 */
export async function enviarArquivoUsuario(usuario, tipo, file) {
  const cfg = ARQUIVOS[tipo]
  const caminho = `${usuario.id}/${cfg.prefixo}-${Date.now()}.${extensao(file)}`
  const { error: eUp } = await supabase.storage.from(cfg.bucket)
    .upload(caminho, file, { contentType: file.type || undefined, upsert: false })
  if (eUp) throw new Error('Falha ao enviar o arquivo: ' + eUp.message)

  const { data, error } = await supabase.from('usuarios')
    .update({ [cfg.coluna]: caminho }).eq('id', usuario.id).select('*').single()
  if (error) {
    await supabase.storage.from(cfg.bucket).remove([caminho]).catch(() => {})
    throw error
  }
  const anterior = usuario[cfg.coluna]
  if (anterior && anterior !== caminho && !/^https?:/i.test(anterior)) {
    await supabase.storage.from(cfg.bucket).remove([anterior]).catch(() => {})
  }
  return data
}

export async function removerArquivoUsuario(usuario, tipo) {
  const cfg = ARQUIVOS[tipo]
  const anterior = usuario[cfg.coluna]
  const { data, error } = await supabase.from('usuarios')
    .update({ [cfg.coluna]: null }).eq('id', usuario.id).select('*').single()
  if (error) throw error
  if (anterior && !/^https?:/i.test(anterior)) {
    await supabase.storage.from(cfg.bucket).remove([anterior]).catch(() => {})
  }
  return data
}

/** URL temporária (1 h) para exibir a imagem. Aceita URL completa (legado). */
export async function urlArquivo(usuario, tipo) {
  const cfg = ARQUIVOS[tipo]
  const caminho = usuario?.[cfg.coluna]
  if (!caminho) return null
  if (/^https?:/i.test(caminho)) return caminho
  const { data, error } = await supabase.storage.from(cfg.bucket).createSignedUrl(caminho, 3600)
  if (error) return null
  return data?.signedUrl || null
}

/** URLs das fotos de vários usuários de uma vez: { [usuarioId]: url } */
export async function urlsFotos(usuarios) {
  const comFoto = usuarios.filter(u => u.foto_url)
  const mapa = {}
  comFoto.filter(u => /^https?:/i.test(u.foto_url)).forEach(u => { mapa[u.id] = u.foto_url })
  const caminhos = comFoto.filter(u => !/^https?:/i.test(u.foto_url))
  if (!caminhos.length) return mapa
  const { data } = await supabase.storage.from('fotos')
    .createSignedUrls(caminhos.map(u => u.foto_url), 3600)
  ;(data || []).forEach((item, i) => { if (item?.signedUrl) mapa[caminhos[i].id] = item.signedUrl })
  return mapa
}

// ─── Empresas (direto no banco; RLS: só Gestor/DEV) ────────────────────────
export async function salvarEmpresa(empresa) {
  const dados = {
    nome: empresa.nome.trim(),
    lote: empresa.lote?.trim() || null,
    rodovia: empresa.rodovia?.trim() || null,
    ativo: empresa.ativo !== false,
  }
  const q = empresa.id
    ? supabase.from('empresas').update(dados).eq('id', empresa.id)
    : supabase.from('empresas').insert(dados)
  const { data, error } = await q.select('*').single()
  if (error) throw error
  return data
}
