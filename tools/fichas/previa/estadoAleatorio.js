// Estado de teste com todos os campos preenchidos (valores reproduzíveis pela semente).
// Serve para conferir o layout/impressão com a ficha cheia; não tem valores fisicamente coerentes.
export function estadoAleatorio(indice, semente = 12345) {
  let s = semente
  const aleatorio = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
  const entradas = {}
  for (const a of [...indice.papeis.entrada, ...indice.papeis.revisao]) {
    const role = indice.cells[a].role
    if (role.dado === 'data') entradas[a] = 46000 + Math.floor(aleatorio() * 400)
    else if (role.dado === 'hora') entradas[a] = Math.floor(aleatorio() * 1440) / 1440
    else if (role.opcoes?.length) entradas[a] = role.opcoes[Math.floor(aleatorio() * role.opcoes.length)]
    else if (role.dado === 'texto') entradas[a] = `T${Math.floor(aleatorio() * 100)}`
    else entradas[a] = +(1 + aleatorio() * 99).toFixed(2)
  }
  const escolhas = {}
  for (const [g, ops] of Object.entries(indice.gruposEscolha)) escolhas[g] = ops[Math.floor(aleatorio() * ops.length)].opcao
  const verificacoes = {}
  for (const a of indice.papeis.verificacao) if (aleatorio() < 0.7) verificacoes[a] = true
  return { entradas, escolhas, verificacoes }
}
