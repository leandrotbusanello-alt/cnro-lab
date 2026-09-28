// Número sequencial do PE / final da O.S. (migração 16):
// mínimo de 3 dígitos, como no papel (094, 137); a partir de 1000 cresce
// normalmente (1000, 1024…). Sem limite de 9999.
export const MAX_SEQUENCIAL = 99999

export function fmtSeq(n) {
  const s = String(n ?? '').trim()
  if (!/^\d+$/.test(s)) return s
  const v = parseInt(s, 10)
  return v < 1000 ? String(v).padStart(3, '0') : String(v)
}

/** "PE-2026-094" */
export function formatarPE(ano, numero) {
  return `PE-${ano}-${fmtSeq(numero)}`
}
