// Gravação dos cadastros (migração 17). Só com internet.
import { supabase } from '../../lib/supabase'
import { TIPOS_CADASTRO } from '../../lib/cadastros'

function exigirOnline() {
  if (!navigator.onLine) throw new Error('Os cadastros só podem ser alterados com internet.')
}

function erroAmigavel(error) {
  const m = error?.message || ''
  if (/duplicate key|_nome_uq|unique/i.test(m)) return 'Já existe um cadastro com esse nome.'
  if (/row-level security|permission/i.test(m)) return 'Somente o Laboratório e o Gestor podem alterar os cadastros.'
  return m || 'Não foi possível salvar.'
}

const limpar = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() || null) : v]))

export async function salvarCadastro(tipo, registro) {
  exigirOnline()
  const { tabela } = TIPOS_CADASTRO[tipo]
  const { id, ...dados } = limpar(registro)
  const q = id
    ? supabase.from(tabela).update(dados).eq('id', id).select().single()
    : supabase.from(tabela).insert(dados).select().single()
  const { data, error } = await q
  if (error) throw new Error(erroAmigavel(error))
  return data
}

/** Documento do traço: bucket privado `tracos` (tracos/<traco_id>/<arquivo>) */
export async function enviarDocumentoTraco(tracoId, file) {
  exigirOnline()
  const limpo = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80)
  const caminho = `${tracoId}/${Date.now()}_${limpo}`
  const { error } = await supabase.storage.from('tracos').upload(caminho, file, { upsert: false })
  if (error) throw new Error(`Não foi possível enviar o documento: ${error.message}`)
  return `tracos/${caminho}`
}

export async function abrirDocumento(caminho) {
  if (!caminho) return
  if (!navigator.onLine) throw new Error('Para abrir o documento é preciso internet.')
  const [bucket, ...resto] = caminho.split('/')
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(resto.join('/'), 300)
  if (error) throw new Error('Não foi possível abrir o documento.')
  window.open(data.signedUrl, '_blank', 'noopener')
}

export async function historicoTraco(tracoId) {
  const { data, error } = await supabase.from('tracos_validacoes')
    .select('*').eq('traco_id', tracoId).order('registrado_em', { ascending: false })
  if (error) throw new Error(erroAmigavel(error))
  return data || []
}

export async function listarEmpresas() {
  const { data } = await supabase.from('empresas').select('id, nome, ativo').order('nome')
  return data || []
}

export async function listarUsuariosNomes() {
  const { data } = await supabase.from('usuarios').select('id, nome')
  return Object.fromEntries((data || []).map(u => [u.id, u.nome]))
}
