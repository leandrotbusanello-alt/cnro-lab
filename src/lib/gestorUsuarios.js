import { supabase } from './supabase'

/**
 * Chama a Edge Function `gestor-usuarios` (operações de login que exigem a
 * chave de administrador, que fica só no servidor).
 *   acao: 'criar' | 'editar' | 'status' | 'resetar_senha' | 'trocar_senha'
 * Retorna o corpo da resposta ({ ok: true, ... }) ou lança Error com mensagem amigável.
 */
export async function chamarGestorUsuarios(acao, dados = {}) {
  if (!navigator.onLine) throw new Error('Sem conexão. Esta ação precisa de internet.')

  const { data, error } = await supabase.functions.invoke('gestor-usuarios', {
    body: { acao, dados },
  })

  if (error) {
    // Resposta HTTP de erro com corpo JSON
    let corpo = null
    try { corpo = await error.context?.json?.() } catch { /* corpo não é JSON */ }
    if (corpo?.erro) throw new Error(corpo.erro)
    if (/Failed to send|fetch|NetworkError/i.test(error.message || '')) {
      throw new Error('Não foi possível falar com o servidor. Verifique a internet ou se a função "gestor-usuarios" foi publicada no Supabase.')
    }
    throw new Error(error.message || 'Erro ao chamar o servidor.')
  }

  if (!data?.ok) throw new Error(data?.erro || 'Não foi possível concluir a operação.')
  return data
}
