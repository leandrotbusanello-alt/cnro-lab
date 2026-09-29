// ─────────────────────────────────────────────────────────────────────────────
// Quadros de controle (FR-IMOB-39 a 43) — de onde vem cada coluna
//
// Cada linha do quadro é uma AMOSTRA (pedido) do material do quadro, com os ensaios APROVADOS dela.
// Fontes:
//   tabela(…)  → tabelas resultado_* (normalizadas na aprovação)
//   ficha(…)   → dados_resultado de uma ficha online, por código e célula (entradas ou calculados).
//                Célula por revisão: 'H30' (todas) ou { Rev00: 'H30', Rev01: 'H31' }.
//   funções    → dados do pedido/amostra ou conta sobre outras colunas
// Colunas sem fonte (sem ficha online que grave o dado) ficam de fora e saem vazias no quadro.
// Levantamento: claude/CNRO_Lab_Quadros_Controle_Escopo.md (projeto).
// ─────────────────────────────────────────────────────────────────────────────

/** Média dos números de uma ou mais células de uma ficha, em todos os ensaios aprovados da amostra. */
export const ficha = (codigos, celulas, { fator = 1 } = {}) => ({ tipo: 'ficha', codigos: [].concat(codigos), celulas: [].concat(celulas), fator })

/** Média de uma coluna de tabela(s) resultado_* da amostra (filtro opcional por linha). */
export const tabela = (tabelas, campo, { filtro, fator = 1 } = {}) => ({ tipo: 'tabela', tabelas: [].concat(tabelas), campo, filtro, fator })

const procAgregado = l => l.amostra.origem || l.amostra.fornecedor || l.empresaNome || ''
const procLigante = l => l.amostra.fornecedor || l.amostra.origem || l.empresaNome || ''
const procEmpresa = l => l.empresaNome || ''

const locais = a => [a.pista, a.faixa, a.lado, a.estaca && `Est. ${a.estaca}`].filter(Boolean).join(' · ')

// Peneiras da FR-11 (análise granulométrica de agregados): % passante em fração nas colunas H (amostra 1)
// e Q (amostra 2); o quadro mostra a média das duas, em %.
const peneiraFR11 = linha => ficha('FR-IMOB-11', [`H${linha}`, `Q${linha}`], { fator: 100 })
// Peneiras de agregado: FR-11 (colunas H e Q) e FR-53 — análise granulométrica DNIT 031 (colunas F e O, fração) —
// média das amostras das fichas aprovadas da amostra, em %. linha53 = null: peneira que a FR-53 não tem.
const peneiraAgregado = (linha11, linha53) => ({
  tipo: 'funcao',
  fn: l => {
    const v = [...valoresFicha(l, ['FR-IMOB-11'], [`H${linha11}`, `Q${linha11}`]),
      ...(linha53 ? valoresFicha(l, ['FR-IMOB-53'], [`F${linha53}`, `O${linha53}`]) : [])]
    const m = media(v)
    return m === null ? null : m * 100
  },
})
// Peneiras da FR-21 (granulometria da mistura): % passante média (coluna L), já em %.
const peneiraFR21 = linha => ficha('FR-IMOB-21', `L${linha}`)

/** Diâmetro máximo (NBR NM 248): menor abertura em que a % retida acumulada é ≤ 5% — a partir das peneiras do quadro. */
function dmaxDasPeneiras(v, peneiras) {
  let dmax = null
  for (const [col, mm] of peneiras) {           // da maior para a menor
    const passa = v[col]
    if (typeof passa !== 'number') continue
    if (100 - passa <= 5) dmax = mm
    else break
  }
  return dmax
}

const CPS_FR46 = Array.from({ length: 21 }, (_, i) => 19 + i)    // linhas dos CPs na FR-IMOB-46 Rev01

const PENEIRAS_39 = [['E', 25.4], ['F', 19.1], ['G', 12.5], ['H', 9.5], ['I', 4.75], ['J', 2], ['K', 0.42], ['L', 0.18], ['M', 0.075]]

export const QUADROS = {
  'FR-IMOB-39': {
    codigo: 'FR-IMOB-39',
    titulo: 'Caracterização do agregado',
    material: 'solos', subTipo: 'agregados',
    campoTipo: 'tipo_agregado', rotuloTipo: 'Tipo de agregado',
    camposData: ['data_coleta'],
    tabelas: ['resultado_indice_forma', 'resultado_densidade_agregado_graudo', 'resultado_densidade_agregado_miudo'],
    colunas: {
      B: l => l.dataSerial,               // Mês (formato mmm-aa)
      C: l => l.numero,                   // Amostra (nº do registro)
      D: l => l.dataSerial,               // Data da coleta
      E: peneiraAgregado(30, 28), F: peneiraAgregado(31, 29), G: peneiraAgregado(33, 30), H: peneiraAgregado(34, 31),
      I: peneiraAgregado(35, 34), J: peneiraAgregado(36, null), K: peneiraAgregado(37, null), L: peneiraAgregado(38, null),
      M: peneiraAgregado(39, 40),
      // N (fundo): sem definição — vazio
      O: { tipo: 'funcao', depois: true, fn: (l, v) => primeiroNumero(l, 'FR-IMOB-11', ['F41', 'O41']) ?? primeiroNumero(l, 'FR-IMOB-53', ['D42', 'M42']) ?? dmaxDasPeneiras(v, PENEIRAS_39) },
      P: tabela('resultado_indice_forma', 'indice_forma_pct', { filtro: r => r.metodo === 'Paquímetro' }),   // decisão 28/09: paquímetro
      Q: tabela(['resultado_densidade_agregado_graudo', 'resultado_densidade_agregado_miudo'], 'densidade_real'), // massa específica real
      // R (massa unitária): nenhuma ficha online — vazio
      S: tabela(['resultado_densidade_agregado_graudo', 'resultado_densidade_agregado_miudo'], 'absorcao_pct'),
      T: l => l.amostra.local_aplicacao || l.amostra.local || l.amostra.jazida || '',
      U: procAgregado,
    },
    procedencia: procAgregado,
  },

  'FR-IMOB-40': {
    codigo: 'FR-IMOB-40',
    titulo: 'Caracterização do CAP',
    material: 'asfalto', subTipo: 'ligante_asfaltico',
    campoTipo: 'tipo_ligante', rotuloTipo: 'Tipo de ligante',
    camposData: ['data_coleta'],
    tabelas: ['resultado_penetracao', 'resultado_ponto_amolecimento', 'resultado_recuperacao_elastica', 'resultado_viscosidade'],
    colunas: {
      B: l => l.dataSerial, C: l => l.numero, D: l => l.dataSerial,
      E: tabela('resultado_penetracao', 'penetracao_media'),               // 0,1 mm (a planilha diz "mm")
      F: tabela('resultado_ponto_amolecimento', 'media_c'),
      G: tabela('resultado_recuperacao_elastica', 'recuperacao_obtida_pct'), // % (a planilha diz "cm")
      H: ficha(['FR-IMOB-14', 'FR-IMOB-15'], 'G56'),                         // separação de fase (°C)
      I: tabela('resultado_viscosidade', 'viscosidade_135c_cp'),
      J: tabela('resultado_viscosidade', 'viscosidade_150c_cp'),
      K: tabela('resultado_viscosidade', 'viscosidade_177c_cp'),             // banco a 177 °C (planilha: 175 °C)
      L: { tipo: 'funcao', fn: l => media([...valoresFicha(l, ['FR-IMOB-14', 'FR-IMOB-15'], ['G59']), ...valoresFicha(l, ['FR-IMOB-18'], ['F41'])]) }, // RTFOT: variação de massa (%)
      M: l => l.amostra.local || l.amostra.local_aplicacao || '',
      N: procLigante,
    },
    procedencia: procLigante,
  },

  'FR-IMOB-41': {
    codigo: 'FR-IMOB-41',
    titulo: 'Caracterização do CBUQ endurecido',
    material: 'asfalto', subTipo: 'cps_extraidos_pista',
    campoTipo: 'tipo_mistura', rotuloTipo: 'Tipo de mistura',
    camposData: ['data_extracao', 'data_aplicacao'],
    tabelas: ['resultado_teor_betume', 'resultado_densidade_cbuq', 'resultado_rice'],
    colunas: {
      A: l => l.dataSerial, B: l => l.numero, C: l => l.dataSerial,
      D: peneiraFR21(21), E: peneiraFR21(22), F: peneiraFR21(23), G: peneiraFR21(24), H: peneiraFR21(25),
      I: peneiraFR21(26), J: peneiraFR21(27), K: peneiraFR21(28), L: peneiraFR21(29),
      N: tabela('resultado_teor_betume', 'teor_obtido_pct'),
      O: tabela('resultado_densidade_cbuq', 'gmb_obtido'),        // FR-46
      P: tabela('resultado_rice', 'gmm_obtido'),
      R: tabela('resultado_densidade_cbuq', 'va_pct'),
      // FR-46 (densidade aparente e GC de CPs de pista): RT e absorção por CP, lidas da ficha (dados_resultado)
      Q: ficha('FR-IMOB-46', CPS_FR46.map(r => `W${r}`)),
      U: ficha('FR-IMOB-46', CPS_FR46.map(r => `T${r}`)),
      // S (VAM), T (RBV): sem ficha de CP extraído — vazios
      V: { tipo: 'funcao', fn: l => media(valoresTabela(l, ['resultado_densidade_cbuq'], 'espessura_medida_mm').map(x => x / 10)) ?? numero(l.amostra.espessura) }, // cm
      W: tabela('resultado_densidade_cbuq', 'grau_compactacao_pct'),
      X: l => locais(l.amostra),
      Y: procEmpresa,
    },
    procedencia: procEmpresa,
  },

  'FR-IMOB-42': {
    codigo: 'FR-IMOB-42',
    titulo: 'Caracterização do CBUQ fresco',
    material: 'asfalto', subTipo: 'massa_asfaltica',
    campoTipo: 'tipo_mistura', rotuloTipo: 'Tipo de mistura',
    camposData: ['data_aplicacao', 'data_coleta'],
    tabelas: ['resultado_teor_betume', 'resultado_marshall', 'resultado_rice'],
    colunas: {
      B: l => l.dataSerial, C: l => l.numero, D: l => l.dataSerial,
      E: peneiraFR21(21), F: peneiraFR21(22), G: peneiraFR21(23), H: peneiraFR21(24), I: peneiraFR21(25),
      J: peneiraFR21(26), K: peneiraFR21(27), L: peneiraFR21(28), M: peneiraFR21(29),
      O: tabela('resultado_teor_betume', 'teor_obtido_pct'),
      P: tabela('resultado_marshall', 'gmb_obtido'),
      Q: { tipo: 'funcao', fn: l => media(valoresTabela(l, ['resultado_rice'], 'gmm_obtido')) ?? media(valoresTabela(l, ['resultado_marshall'], 'gmm_referencia')) },
      R: tabela('resultado_marshall', 'estabilidade_kgf'),
      S: tabela('resultado_marshall', 'fluencia_mm'),
      T: tabela('resultado_marshall', 'resistencia_tracao_mpa'),
      U: tabela('resultado_marshall', 'va_pct'),
      V: tabela('resultado_marshall', 'vam_pct'),
      W: tabela('resultado_marshall', 'rbv_pct'),
      X: ficha('FR-IMOB-13', ['D34', 'F34', 'H34', 'J34', 'L34', 'N34']),  // água absorvida pelo CP (%)
      Y: l => locais(l.amostra),
      Z: procEmpresa,
    },
    procedencia: procEmpresa,
  },

  'FR-IMOB-43': {
    codigo: 'FR-IMOB-43',
    titulo: 'Controle de qualidade do concreto e argamassa',
    material: 'concreto', subTipo: 'concreto',
    campoTipo: 'tipo_concreto', rotuloTipo: 'Traço / tipo de concreto',
    camposData: ['data_moldagem'],
    tabelas: [],
    procedencia: procEmpresa,
    concreto: true,       // linhas = séries moldadas (FR-50), com estatística ACI 214 — ver motorQuadros.montarConcreto
  },
}

export const LISTA_QUADROS = Object.values(QUADROS)

// ── utilidades usadas nas colunas (implementadas aqui para as funções acima) ─────────────────

export function numero(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(n) && /^-?[\d.,]+$/.test(v.trim())) return n
  }
  return null
}

export function media(nums) {
  const v = (nums || []).filter(x => typeof x === 'number' && Number.isFinite(x))
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}

function celulaDaRevisao(cel, versao) {
  if (typeof cel === 'string') return cel
  return cel[versao] || cel['*'] || null
}

/** Números das células de uma ficha em todos os ensaios aprovados (da amostra) com esse código. */
export function valoresFicha(linha, codigos, celulas) {
  const out = []
  for (const e of linha.ensaios) {
    const d = e.dados
    if (!d || !codigos.includes(d.codigo)) continue
    for (const c of celulas) {
      const a = celulaDaRevisao(c, d.versao)
      if (!a) continue
      const v = numero(d.calculados?.[a] ?? d.entradas?.[a])
      if (v !== null) out.push(v)
    }
  }
  return out
}

export function primeiroNumero(linha, codigo, celulas) {
  for (const c of celulas) {
    const v = valoresFicha(linha, [codigo], [c])
    if (v.length) return media(v)
  }
  return null
}

export function valoresTabela(linha, tabelas, campo, filtro) {
  const out = []
  for (const e of linha.ensaios) {
    for (const t of tabelas) {
      for (const r of e.resultados?.[t] || []) {
        if (filtro && !filtro(r)) continue
        const v = numero(r[campo])
        if (v !== null) out.push(v)
      }
    }
  }
  return out
}
