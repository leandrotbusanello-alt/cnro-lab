import { useEffect, useState } from 'react'
import { carregarCadastros } from '../../lib/cadastros'

/**
 * Traços do Cadastro para a lista "Traço de projeto" das fichas de granulometria
 * (FR-IMOB-21 e FR-IMOB-54 — decisão de 08/10/2026):
 *   traços ativos da empresa do pedido + os que estão sem empresa definida.
 * Só carrega quando a ficha tem a lista (indice.traco). Sem internet: a última lista guardada no aparelho.
 * Retorna undefined enquanto não se aplica (a célula vira texto comum).
 */
export function useTracosDaFicha(indice, pedido) {
  const temTraco = !!indice?.traco
  const empresaId = pedido?.empresa_id || null
  const [tracos, setTracos] = useState(undefined)

  useEffect(() => {
    if (!temTraco) { setTracos(undefined); return undefined }
    let ativo = true
    carregarCadastros()
      .then(c => { if (ativo) setTracos(filtrarTracos(c.tracos, empresaId)) })
      .catch(() => { if (ativo) setTracos([]) })
    return () => { ativo = false }
  }, [temTraco, empresaId])

  return tracos
}

export function filtrarTracos(tracos, empresaId) {
  return (tracos || [])
    .filter(t => t.ativo !== false && (!t.empresa_id || t.empresa_id === empresaId))
    .sort((a, b) => (Number(!a.empresa_id) - Number(!b.empresa_id)) || String(a.nome_traco).localeCompare(String(b.nome_traco), 'pt-BR'))
}
