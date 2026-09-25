// ─────────────────────────────────────────────────────────────────────────────
// Painel interno — cálculo de períodos (Dia · Semana · Mês · Ano)
//
// Fuso fixo America/Cuiaba (UTC-04:00, sem horário de verão desde 2019 — Lei nº
// 13.972/2019). Os limites do período são calculados nesse fuso e convertidos
// para instantes UTC, para comparar com as colunas timestamptz do banco.
// ─────────────────────────────────────────────────────────────────────────────

export const TIMEZONE = 'America/Cuiaba'
const OFFSET_HORAS = 4 // America/Cuiaba = UTC-04:00 (fixo)

export const TIPOS_PERIODO = {
  dia:    { label: 'Dia' },
  semana: { label: 'Semana' },
  mes:    { label: 'Mês' },
  ano:    { label: 'Ano' },
}

/** Ano/mês/dia locais (Cuiabá) de um instante qualquer */
function partesLocais(data) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(data).split('-').map(Number)
  return { y, m, d }
}

/** Instante UTC correspondente à meia-noite local (Cuiabá) de y-m-d */
function meiaNoiteLocalUTC(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d, OFFSET_HORAS, 0, 0, 0))
}

/** 1 = segunda-feira … 7 = domingo (ISO) */
function diaSemanaISO(y, m, d) {
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=domingo
  return dow === 0 ? 7 : dow
}

/**
 * Limites [inicio, fim) do período, em instantes UTC, para uma data de
 * referência (em geral "agora"). `fim` é exclusivo.
 */
export function limitesPeriodo(tipo, referencia = new Date()) {
  const { y, m, d } = partesLocais(referencia)

  if (tipo === 'dia') {
    const inicio = meiaNoiteLocalUTC(y, m, d)
    const fim = new Date(inicio.getTime() + 86400000)
    return { inicio, fim }
  }
  if (tipo === 'semana') {
    const iso = diaSemanaISO(y, m, d)
    const inicioDia = meiaNoiteLocalUTC(y, m, d)
    const inicio = new Date(inicioDia.getTime() - (iso - 1) * 86400000)
    const fim = new Date(inicio.getTime() + 7 * 86400000)
    return { inicio, fim }
  }
  if (tipo === 'mes') {
    const inicio = meiaNoiteLocalUTC(y, m, 1)
    const fim = meiaNoiteLocalUTC(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1)
    return { inicio, fim }
  }
  // ano
  const inicio = meiaNoiteLocalUTC(y, 1, 1)
  const fim = meiaNoiteLocalUTC(y + 1, 1, 1)
  return { inicio, fim }
}

/** Move a data de referência um período para trás/frente (direcao = -1 | 1) */
export function navegarPeriodo(tipo, referencia, direcao) {
  const { y, m, d } = partesLocais(referencia)
  if (tipo === 'dia')    return new Date(meiaNoiteLocalUTC(y, m, d).getTime() + direcao * 86400000 + 43200000)
  if (tipo === 'semana') return new Date(meiaNoiteLocalUTC(y, m, d).getTime() + direcao * 7 * 86400000 + 43200000)
  if (tipo === 'mes') {
    const novoMes = m - 1 + direcao
    const novoAno = y + Math.floor(novoMes / 12)
    const mesFinal = ((novoMes % 12) + 12) % 12
    return meiaNoiteLocalUTC(novoAno, mesFinal + 1, Math.min(d, 28))
  }
  return meiaNoiteLocalUTC(y + direcao, m, Math.min(d, 28))
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** Texto exibido para o período selecionado (ex.: "Setembro de 2026", "22 a 28/09/2026") */
export function rotuloPeriodo(tipo, referencia = new Date()) {
  const { y, m, d } = partesLocais(referencia)
  if (tipo === 'dia') return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
  if (tipo === 'mes') return `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} de ${y}`
  if (tipo === 'ano') return String(y)
  // semana
  const { inicio, fim } = limitesPeriodo('semana', referencia)
  const fimInclusive = new Date(fim.getTime() - 86400000)
  const pi = partesLocais(inicio)
  const pf = partesLocais(fimInclusive)
  const dd = p => `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}`
  return pi.y === pf.y ? `${dd(pi)} a ${dd(pf)}/${pf.y}` : `${dd(pi)}/${pi.y} a ${dd(pf)}/${pf.y}`
}

/** Não deixa navegar para períodos futuros (não faz sentido no painel) */
export function ehPeriodoAtual(tipo, referencia) {
  const { fim } = limitesPeriodo(tipo, referencia)
  return fim.getTime() > Date.now()
}
