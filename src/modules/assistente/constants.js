// ─────────────────────────────────────────────────────────────────────────────
// Módulo Assistente — constantes
// ─────────────────────────────────────────────────────────────────────────────

/** Status de ensaio que aparecem na fila do assistente (enviados somem até serem devolvidos) */
export const STATUS_NA_FILA = ['pendente', 'em_andamento', 'devolvido']

export const STATUS_ASSISTENTE = {
  devolvido:    { label: 'Devolvido para correção', tom: 'erro' },
  em_andamento: { label: 'Em execução',             tom: 'info' },
  pendente:     { label: 'A iniciar',               tom: 'pendente' },
}

/** Espera após a última digitação para guardar o rascunho no aparelho (ms) */
export const ESPERA_RASCUNHO_LOCAL = 700
