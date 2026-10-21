// ─────────────────────────────────────────────────────────────────────────────
// Resultados no Módulo Campo (migração 32 — 21/10/2026)
//
// O inspetor vê, nos pedidos que ELE abriu:
//   • o status de todos os ensaios (função ensaios_status_campo — sem dados dos não liberados);
//   • os ensaios APROVADOS e LIBERADOS pelo laboratorista: o registro completo (ficha) e a
//     conformidade/observação do resultado. O banco (RLS) só entrega esses ao usuário de campo.
// Só com internet (resultado é consulta; não fica guardado no aparelho).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const VAZIO = { porPedido: {}, liberados: {}, resultados: {}, usuarios: {} }

export function useResultadosCampo(pedidos) {
  const [dados, setDados] = useState(VAZIO)
  const [erro, setErro] = useState(null)
  const chave = (pedidos || []).filter(p => p.numero_os).map(p => p.id).join(',')

  const carregar = useCallback(async () => {
    if (!navigator.onLine || !chave) { setDados(VAZIO); return }
    try {
      setErro(null)
      const { data: status, error } = await supabase.rpc('ensaios_status_campo')
      if (error) throw error
      const porPedido = {}
      for (const s of status || []) (porPedido[s.pedido_id] ||= []).push(s)

      const idsLib = (status || []).filter(s => s.liberado).map(s => s.id)
      let liberados = {}
      let resultados = {}
      let usuarios = {}
      if (idsLib.length) {
        const { data: eos, error: e2 } = await supabase.from('ensaios_os')
          .select('id, pedido_id, nome_ensaio, status, ficha_modelo_id, dados_resultado, aprovado_em, aprovado_por_id, assistente_id, assinatura_executor, assinatura_calculista, resultado_id')
          .in('id', idsLib)
        if (e2) throw e2
        liberados = Object.fromEntries((eos || []).map(e => [e.id, e]))
        const { data: res } = await supabase.from('resultados')
          .select('id, ensaio_os_id, conformidade, observacoes, data_revisao').in('ensaio_os_id', idsLib)
        resultados = Object.fromEntries((res || []).map(r => [r.ensaio_os_id, r]))
        const idsUsu = [...new Set((eos || []).flatMap(e => [
          e.assistente_id, e.aprovado_por_id, e.assinatura_executor?.usuario_id, e.assinatura_calculista?.usuario_id,
        ]).filter(Boolean))]
        if (idsUsu.length) {
          const { data: us } = await supabase.from('usuarios').select('id, nome, assinatura_url').in('id', idsUsu)
          usuarios = Object.fromEntries((us || []).map(u => [u.id, u]))
        }
      }
      setDados({ porPedido, liberados, resultados, usuarios })
    } catch (e) {
      setErro(e.message || 'Não foi possível carregar os resultados.')
    }
  }, [chave])

  useEffect(() => { carregar() }, [carregar])

  return { ...dados, erro, recarregar: carregar }
}

/** Rótulo do ensaio para o inspetor */
export function situacaoEnsaioCampo(s) {
  if (s.liberado) return { label: 'Resultado liberado', cls: 'success' }
  if (s.status === 'aprovado') return { label: 'Concluído — aguardando liberação', cls: 'info' }
  if (s.status === 'aguardando_revisao') return { label: 'Em revisão', cls: 'info' }
  if (s.status === 'em_andamento' || s.status === 'devolvido') return { label: 'Em execução', cls: 'info' }
  return { label: 'Pendente', cls: 'pending' }
}
