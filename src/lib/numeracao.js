// Número do pedido / final da O.S. (migrações 16 e 17):
// mínimo de 3 dígitos, como no papel (094, 137); a partir de 1000 cresce
// normalmente (1000, 1024…). Sem limite de 9999. Exibição: "145/2026".
export const MAX_SEQUENCIAL = 99999

export function fmtSeq(n) {
  const s = String(n ?? '').trim()
  if (!/^\d+$/.test(s)) return s
  const v = parseInt(s, 10)
  return v < 1000 ? String(v).padStart(3, '0') : String(v)
}

/** "145/2026" */
export function formatarPE(ano, numero) {
  return `${fmtSeq(numero)}/${ano}`
}
