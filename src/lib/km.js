// Km e estaca com vírgula (decisão de 06/10/2026):
//   545+970 → 545,970 · 280+40 → 280,040 (depois do "+" são metros)
//   545,9   → 545,900 (depois da vírgula completa à direita) · 545 → 545,000
// Mesma regra de public._km_fmt() no banco.
export function normalizarKm(valor) {
  if (valor === null || valor === undefined) return valor
  let t = String(valor).trim().toUpperCase()
  if (!t) return ''
  t = t.replace(/^(KM|EST\.?|ESTACA)\s*/, '')
  let m = t.match(/^(\d+)\s*\+\s*(\d+)$/)
  if (m) return `${m[1]},${m[2].length >= 3 ? m[2] : m[2].padStart(3, '0')}`
  m = t.match(/^(\d+)\s*[,.]\s*(\d+)$/)
  if (m) return `${m[1]},${m[2].length >= 3 ? m[2] : m[2].padEnd(3, '0')}`
  if (/^\d+$/.test(t)) return `${t},000`
  return String(valor).trim()
}

/** "KM 545,970" (exibição) */
export function rotuloKm(valor) {
  const n = normalizarKm(valor)
  return n ? `KM ${n}` : ''
}
