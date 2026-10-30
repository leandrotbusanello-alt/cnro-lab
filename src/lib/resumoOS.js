// ─────────────────────────────────────────────────────────────────────────────
// Resumo da O.S. para o Campo (migração 38)
// Um arquivo por O.S. (imagem ou PDF) com o resumo dos resultados de todos os ensaios,
// anexado pelo laboratorista responsável ou pelo Gestor. O solicitante vê junto com os
// resultados, quando algum ensaio da O.S. já foi liberado para o Campo.
//   tabela os_resumos (pedido_id) · bucket privado "resumos": <pedido_id>/<arquivo>
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase'

export const TAMANHO_MAX = 5 * 1024 * 1024          // 5 MB
const LADO_MAX = 2200                                // px: imagens maiores são reduzidas
export const TIPOS_ACEITOS = 'image/png,image/jpeg,image/webp,application/pdf'

export const ehImagem = r => /^image\//.test(r?.tipo || '')

/** Resumo da O.S. (ou null) com uma URL temporária (1 h) para exibir/baixar */
export async function obterResumo(pedidoId) {
  if (!pedidoId || !navigator.onLine) return null
  const { data, error } = await supabase.from('os_resumos').select('*').eq('pedido_id', pedidoId).maybeSingle()
  if (error || !data) return null
  const { data: url } = await supabase.storage.from('resumos').createSignedUrl(data.caminho, 3600)
  return { ...data, url: url?.signedUrl || null }
}

/** Reduz imagens grandes (mantém PNG com transparência; fotos viram JPEG) */
async function prepararArquivo(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return file
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height))
  if (escala === 1 && file.size <= TAMANHO_MAX) return file
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const tipo = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await new Promise(res => canvas.toBlob(res, tipo, 0.85))
  if (!blob) return file
  const ext = tipo === 'image/png' ? 'png' : 'jpg'
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: tipo })
}

/** Anexa (ou troca) o resumo da O.S. Devolve o registro novo. */
export async function anexarResumo(pedido, file, usuarioId) {
  if (!navigator.onLine) throw new Error('Anexar o resumo só pode ser feito com internet.')
  if (!TIPOS_ACEITOS.split(',').includes(file.type)) throw new Error('Envie uma imagem (PNG, JPG) ou um PDF.')
  const arquivo = await prepararArquivo(file)
  if (arquivo.size > TAMANHO_MAX) throw new Error('O arquivo passa de 5 MB. Reduza o tamanho e tente de novo.')

  const anterior = await supabase.from('os_resumos').select('caminho').eq('pedido_id', pedido.id).maybeSingle()
  const ext = (arquivo.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
  const caminho = `${pedido.id}/resumo-${Date.now()}.${ext}`
  const { error: eUp } = await supabase.storage.from('resumos').upload(caminho, arquivo, { contentType: arquivo.type })
  if (eUp) throw new Error(eUp.message || 'Não foi possível enviar o arquivo.')

  const registro = {
    pedido_id: pedido.id, caminho, nome: file.name, tipo: arquivo.type, tamanho: arquivo.size,
    enviado_por: usuarioId || null, enviado_em: new Date().toISOString(),
  }
  const { error } = await supabase.from('os_resumos').upsert(registro, { onConflict: 'pedido_id' })
  if (error) {
    await supabase.storage.from('resumos').remove([caminho]).catch(() => {})
    throw new Error(error.message || 'Não foi possível salvar o resumo.')
  }
  if (anterior.data?.caminho && anterior.data.caminho !== caminho) {
    await supabase.storage.from('resumos').remove([anterior.data.caminho]).catch(() => {})
  }
  return obterResumo(pedido.id)
}

/** Exclui o resumo da O.S. (registro e arquivo) */
export async function removerResumo(pedidoId) {
  if (!navigator.onLine) throw new Error('Excluir o resumo só pode ser feito com internet.')
  const { data } = await supabase.from('os_resumos').select('caminho').eq('pedido_id', pedidoId).maybeSingle()
  const { error } = await supabase.from('os_resumos').delete().eq('pedido_id', pedidoId)
  if (error) throw new Error(error.message || 'Não foi possível excluir o resumo.')
  if (data?.caminho) await supabase.storage.from('resumos').remove([data.caminho]).catch(() => {})
}
