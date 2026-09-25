import { useMemo } from 'react'
import { indexarModelo, calcularFicha, montarDados, linhasResultado, situacaoPreenchimento } from './motor/ficha.js'

/**
 * Ficha calculada a partir do modelo e do que foi preenchido.
 * Recalcula tudo a cada alteração (as fichas têm poucas centenas de fórmulas).
 */
export function useFicha(modeloRegistro, estado, pedidoCampos) {
  const modelo = modeloRegistro?.modelo || null
  const indice = useMemo(() => (modelo ? indexarModelo(modelo) : null), [modelo])
  const motor = useMemo(
    () => (indice ? calcularFicha(indice, estado, pedidoCampos) : null),
    [indice, estado, pedidoCampos],
  )
  const situacao = useMemo(() => (indice ? situacaoPreenchimento(indice, estado) : null), [indice, estado])

  return {
    indice,
    motor,
    situacao,
    /** dados_resultado para salvar/enviar */
    dados: () => montarDados(indice, estado, motor, { modeloId: modeloRegistro?.id }),
    /** linhas para resultado_* (aprovação) */
    resultados: () => linhasResultado(modeloRegistro?.mapa_resultados || [], motor),
  }
}
