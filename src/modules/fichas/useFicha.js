import { useMemo } from 'react'
import { indexarModelo } from './motor/ficha.js'
import { motoresDasFolhas, montarDadosFolhas, linhasResultadoFolhas, situacaoFolhas } from './motor/folhas.js'

/**
 * Ficha calculada a partir do modelo e do que foi preenchido.
 * Recalcula a cada alteração (as fichas têm poucas centenas de fórmulas); com folhas adicionais
 * (estado.extras), cada folha tem o seu cálculo e só a folha alterada é recalculada.
 */
export function useFicha(modeloRegistro, estado, pedidoCampos) {
  const modelo = modeloRegistro?.modelo || null
  const indice = useMemo(() => (modelo ? indexarModelo(modelo) : null), [modelo])
  const cache = useMemo(() => new WeakMap(), [indice])   // cálculo por folha (objeto do estado da folha)
  const motores = useMemo(
    () => (indice ? motoresDasFolhas(indice, estado, pedidoCampos, cache) : []),
    [indice, estado, pedidoCampos, cache],
  )
  const situacao = useMemo(() => (indice ? situacaoFolhas(indice, estado) : null), [indice, estado])

  return {
    indice,
    /** cálculo da folha 1 (o de sempre) */
    motor: motores[0] || null,
    /** cálculo de cada folha (folha 1 + folhas adicionais) */
    motores,
    situacao,
    /** dados_resultado para salvar/enviar (estadoAtual: p.ex. com fotos recém-enviadas; não muda os cálculos) */
    dados: (estadoAtual = estado) => montarDadosFolhas(indice, estadoAtual, motores, { modeloId: modeloRegistro?.id }),
    /** linhas para resultado_* (aprovação) — todas as folhas */
    resultados: () => linhasResultadoFolhas(modeloRegistro?.mapa_resultados || [], motores, { indice, estado }),
  }
}
