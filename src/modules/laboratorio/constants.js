// ─────────────────────────────────────────────────────────────────────────────
// Módulo Laboratório — constantes
// Status conforme migração 10 (CHECK no banco).
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_PEDIDO = {
  aguardando_lab:     { label: 'Aguardando laboratório', tom: 'pendente' },
  em_analise:         { label: 'Em análise',             tom: 'info'     },
  em_andamento:       { label: 'Em andamento',           tom: 'info'     },
  aguardando_revisao: { label: 'Aguardando revisão',     tom: 'alerta'   },
  devolvido_campo:    { label: 'Devolvido ao campo',     tom: 'erro'     },
  concluido:          { label: 'Concluído',              tom: 'ok'       },
  cancelado:          { label: 'Cancelado',              tom: 'neutro'   },
}

export const STATUS_ENSAIO = {
  pendente:           { label: 'Pendente',            tom: 'pendente' },
  em_andamento:       { label: 'Em execução',         tom: 'info'     },
  aguardando_revisao: { label: 'Aguardando revisão',  tom: 'alerta'   },
  aprovado:           { label: 'Aprovado',            tom: 'ok'       },
  devolvido:          { label: 'Devolvido ao assist.', tom: 'erro'    },
}

export const STATUS_ABERTOS = ['aguardando_lab', 'em_analise', 'em_andamento', 'aguardando_revisao', 'devolvido_campo']

/** Visões da tela principal */
export const VISOES = {
  fila:   { label: 'Fila geral' },
  minhas: { label: 'Minhas O.S.' },
  todas:  { label: 'Todas' },
}

/** Sub-filtros de "Minhas O.S." */
export const SUBVISOES_MINHAS = [
  { id: 'analise',    label: 'Em análise' },
  { id: 'campo',      label: 'Com o campo' },
  { id: 'andamento',  label: 'Em andamento' },
  { id: 'revisao',    label: 'Para revisar' },
  { id: 'finalizar',  label: 'Para finalizar' },
  { id: 'concluidas', label: 'Concluídas' },
]

/** Perfis que aparecem como opção de executor de ensaio */
export const PERFIS_EXECUTORES = ['ASSIST', 'LAB', 'GESTOR', 'DEV']
/** Perfis que podem ser responsáveis por O.S. */
export const PERFIS_LABORATORISTAS = ['LAB', 'GESTOR', 'DEV']
export const PERFIS_GESTAO = ['GESTOR', 'DEV']

/** Pedidos concluídos carregados (dias para trás) */
export const DIAS_CONCLUIDAS = 90

export const TIMEZONE = 'America/Cuiaba'
