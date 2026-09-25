// ─────────────────────────────────────────────────────────────────────────────
// Fichas online — configurações
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Módulos cujos usuários podem imprimir / gerar PDF das fichas de ensaio.
 * Hoje só o laboratorista. Para liberar ao assistente no futuro, basta
 * acrescentar 'assistente' aqui.
 */
export const MODULOS_QUE_IMPRIMEM = ['laboratorio']

/** Conformidade informada pelo laboratorista na aprovação (CHECK de `resultados`) */
export const CONFORMIDADES = ['Conforme', 'Não Conforme', 'Parcialmente Conforme', 'Pendente']

/** Largura (px) abaixo da qual a ficha abre na visão em lista */
export const LARGURA_VISAO_LISTA = 760

/** Intervalo do salvamento automático do rascunho no servidor (ms) */
export const INTERVALO_RASCUNHO_SERVIDOR = 20000
