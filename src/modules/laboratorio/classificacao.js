// ─────────────────────────────────────────────────────────────────────────────
// Classificação dos pedidos nas visões da tela principal (funções puras)
// ─────────────────────────────────────────────────────────────────────────────

const PRE_OS = ['aguardando_lab', 'em_analise']
const POS_OS = ['em_andamento', 'aguardando_revisao']

/** Situação de um pedido do ponto de vista do laboratorista logado */
export function situacao(pedido, ensaiosOs = [], meuId) {
  const resp = pedido.laboratorista_id
  const meu = !!resp && resp === meuId
  const st = pedido.status
  const temRevisao = ensaiosOs.some(e => e.status === 'aguardando_revisao')
  const todosAprovados = ensaiosOs.length > 0 && ensaiosOs.every(e => e.status === 'aprovado')

  let sub = null
  if (meu) {
    if (PRE_OS.includes(st)) sub = 'analise'
    else if (st === 'devolvido_campo') sub = 'campo'
    else if (POS_OS.includes(st) && temRevisao) sub = 'revisao'
    else if (POS_OS.includes(st) && todosAprovados) sub = 'finalizar'
    else if (POS_OS.includes(st)) sub = 'andamento'
    else if (st === 'concluido') sub = 'concluidas'
  }

  return {
    naFila: !resp && PRE_OS.includes(st),
    meu,
    sub,
    correcaoRecebida: meu && st === 'aguardando_lab' && !pedido.lancamento_historico,
    historico: !!pedido.lancamento_historico,
    qtdRevisao: ensaiosOs.filter(e => e.status === 'aguardando_revisao').length,
    qtdDevolvidos: ensaiosOs.filter(e => e.status === 'devolvido').length,
    qtdAprovados: ensaiosOs.filter(e => e.status === 'aprovado').length,
    atribuicaoPendente: POS_OS.includes(st) && ensaiosOs.some(e => !e.assistente_id),
    todosAprovados,
    alteradoOffline: !!(pedido._alteradoOffline || pedido._origemOffline),
  }
}

const porCriacao = (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)

/** Ordenação: fila do mais antigo ao mais novo; nas minhas, correções recebidas primeiro */
export function ordenar(lista, visao, sub) {
  const l = [...lista]
  if (visao === 'minhas' && sub === 'concluidas') {
    return l.sort((a, b) => new Date(b.pedido.finalizado_em || 0) - new Date(a.pedido.finalizado_em || 0))
  }
  if (visao === 'minhas') {
    return l.sort((a, b) =>
      (Number(b.sit.correcaoRecebida) - Number(a.sit.correcaoRecebida)) || porCriacao(a.pedido, b.pedido))
  }
  return l.sort((a, b) => porCriacao(a.pedido, b.pedido))
}
