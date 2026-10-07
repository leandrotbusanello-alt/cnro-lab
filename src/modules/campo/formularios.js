// ─────────────────────────────────────────────────────────────────────────────
// Formulário do pedido por tipo de amostra (apontamentos do teste de 06/10/2026,
// págs. 8–11). Cada subcategoria tem:
//   geral   → "Informações gerais", preenchidas uma vez
//   amostra → campos de cada amostra (com herança e "+ Nova amostra"); null = amostra única
//
// Gravação (pedidos_ensaio.dados_amostra): uma linha por amostra com os campos gerais
// + os da amostra, e `info_geral` com o original (para reabrir na correção).
// O Laboratório, as fichas e a observação da FR-IMOB-04/05 leem esses nomes.
//
// Tipos de campo: texto · numero · data · hora · km · lista · opcoes (botões) ·
//                 cadastro (jazidas/pedreiras/fornecedores/tracos) · arquivo (certificado)
// ─────────────────────────────────────────────────────────────────────────────

export const PISTAS          = ['Norte', 'Sul', 'Marginal Norte', 'Marginal Sul']
export const CAMADAS_SOLO    = ['Corpo de Aterro', '1ª CFT', '2ª CFT', '3ª CFT', 'Subleito', 'Reforço do Subleito',
                                'Sub-base', 'Sub-base Melhorada', 'Base', 'Base Melhorada']
export const CAMADAS_ASFALTO = ['1ª Camada', '2ª Camada', 'Camada Única']
export const CAMADAS_ESPECIAL = ['Subleito', 'Sub-base', 'Base', 'CBUQ 1ª Camada', 'CBUQ 2ª Camada', 'CBUQ Camada Única']
export const PROCTOR         = ['Normal', 'Intermediário', 'Modificado']
export const FAIXAS          = ['1ª Faixa', '2ª Faixa', 'Acostamento', 'Alça de Aceleração', 'Alça de Desaceleração', 'Retorno']
export const FAIXAS_SOLO_CIMENTO = ['Pista', ...FAIXAS]
export const FAIXAS_ESPECIAL = [...FAIXAS, 'Intercalada']
export const LADOS           = ['LD', 'LE', 'EX']
export const LADOS_ESPECIAL  = [...LADOS, 'Intercalado']
export const IDADES_RUPTURA  = ['03', '07', '14', '28', '63']
export const TIPOS_RUPTURA   = ['Axial', 'Diametral']
export const DIMENSOES_CP    = ['10x20', '15x30', 'Outro']
export const RESP_MOLDAGEM   = ['Supervisão', 'CNRO', 'Construtora']
export const LOCAIS_MASSA    = ['Usina', 'Pista']

// ── Campos reaproveitados ────────────────────────────────────────────────────
const kmIni   = { nome: 'km_inicial', rotulo: 'Estaca/Km inicial', tipo: 'km' }
const kmFim   = { nome: 'km_final',   rotulo: 'Estaca/Km final',   tipo: 'km' }
const pista   = { nome: 'pista',  rotulo: 'Pista',  tipo: 'lista', opcoes: PISTAS }
const proctor = { nome: 'proctor', rotulo: 'Proctor / Energia', tipo: 'lista', opcoes: PROCTOR }
const idade   = { nome: 'idade_ruptura', rotulo: 'Idade de ruptura (dias)', tipo: 'lista', opcoes: IDADES_RUPTURA }
const ruptura = { nome: 'tipo_ruptura',  rotulo: 'Tipo de ruptura', tipo: 'lista', opcoes: TIPOS_RUPTURA }
const projeto = { nome: 'projeto', rotulo: 'Projeto adotado (traço)', tipo: 'cadastro', fonte: 'tracos', idCampo: 'traco_id' }

const SOLO_GRANULAR_GERAL = [
  { nome: 'data_coleta', rotulo: 'Data da coleta', tipo: 'data' },
  { nome: 'camada', rotulo: 'Camada', tipo: 'lista', opcoes: CAMADAS_SOLO },
  pista, kmIni, kmFim,
  { nome: 'km_coleta', rotulo: 'Estaca/Km da coleta', tipo: 'km' },
  proctor,
]
const SOLO_GRANULAR_AMOSTRA = [
  { nome: 'identificacao', rotulo: 'Identificação da amostra', tipo: 'texto', herda: false, obrigatorio: true },
  { nome: 'quantidade_kg', rotulo: 'Quantidade de material (kg)', tipo: 'numero' },
  { nome: 'tipo_material', rotulo: 'Tipo de material', tipo: 'texto' },
]

// Massa asfáltica: os campos dependem de "Material aplicado?"
const aplicado = g => g.material_aplicado === 'Sim'
const naoAplicado = g => g.material_aplicado === 'Não'

export const FORMULARIOS = {
  // ── Solos e granulares ─────────────────────────────────────────────────────
  jazida: {
    geral: [
      { nome: 'jazida', rotulo: 'Identificação da jazida', tipo: 'cadastro', fonte: 'jazidas', idCampo: 'jazida_id', obrigatorio: true },
      { nome: 'municipio', rotulo: 'Município', tipo: 'texto' },
      kmIni, kmFim, pista,
      { nome: 'data_coleta', rotulo: 'Data da coleta', tipo: 'data' },
      { nome: 'camada', rotulo: 'Camada de aplicação', tipo: 'lista', opcoes: CAMADAS_SOLO },
      proctor,
    ],
    amostra: [
      { nome: 'identificacao', rotulo: 'Identificação da amostra', tipo: 'texto', herda: false, obrigatorio: true },
      { nome: 'profundidade', rotulo: 'Profundidade', tipo: 'texto', placeholder: 'Ex.: 0,60 m' },
    ],
  },
  caixa_emprestimo: { geral: SOLO_GRANULAR_GERAL, amostra: SOLO_GRANULAR_AMOSTRA },
  segmento:         { geral: SOLO_GRANULAR_GERAL, amostra: SOLO_GRANULAR_AMOSTRA },
  cps_solo_cimento: {
    geral: [
      { nome: 'data_moldagem', rotulo: 'Data da moldagem', tipo: 'data' },
      { nome: 'camada', rotulo: 'Camada', tipo: 'lista', opcoes: CAMADAS_SOLO },
      pista, kmIni, kmFim,
      { nome: 'faixa', rotulo: 'Faixa', tipo: 'lista', opcoes: FAIXAS_SOLO_CIMENTO },
      { nome: 'teor_cimento', rotulo: 'Teor de cimento (%)', tipo: 'numero' },
    ],
    amostra: [
      { nome: 'identificacao_cp', rotulo: 'Identificação do CP', tipo: 'texto', herda: false, obrigatorio: true },
      { nome: 'km_coleta', rotulo: 'Estaca/Km da coleta', tipo: 'km' },
      { nome: 'lado', rotulo: 'Lado', tipo: 'lista', opcoes: LADOS },
      idade, ruptura,
    ],
  },
  agregados: {
    geral: [
      { nome: 'pedreira', rotulo: 'Origem / pedreira', tipo: 'cadastro', fonte: 'pedreiras', idCampo: 'pedreira_id', obrigatorio: true },
      { nome: 'data_coleta', rotulo: 'Data da coleta', tipo: 'data' },
    ],
    amostra: [
      { nome: 'tipo_agregado', rotulo: 'Tipo de agregado', tipo: 'texto', placeholder: 'Ex.: Brita 1, Pó de pedra' },
      { nome: 'granulometria', rotulo: 'Granulometria', tipo: 'texto' },
      { nome: 'quantidade_kg', rotulo: 'Quantidade (kg)', tipo: 'numero' },
    ],
  },

  // ── Asfalto ────────────────────────────────────────────────────────────────
  massa_asfaltica: {
    geral: [
      { nome: 'material_aplicado', rotulo: 'Material aplicado?', tipo: 'opcoes', opcoes: ['Sim', 'Não'], obrigatorio: true },
      { nome: 'local', rotulo: 'Local da coleta', tipo: 'lista', opcoes: LOCAIS_MASSA, visivel: aplicado, obrigatorio: true },
      { nome: 'local', rotulo: 'Local da coleta', tipo: 'fixo', valor: 'Usina', visivel: naoAplicado },
      { nome: 'data_usinagem', rotulo: 'Data de usinagem', tipo: 'data', visivel: g => !!g.material_aplicado },
      { nome: 'hora_coleta', rotulo: 'Hora da coleta', tipo: 'hora', visivel: g => !!g.material_aplicado },
      { ...projeto, visivel: g => !!g.material_aplicado },
      { nome: 'teor_ligante', rotulo: 'Teor de ligante (%)', tipo: 'numero', visivel: g => !!g.material_aplicado },
      { nome: 'temp_usinagem', rotulo: 'Temperatura de usinagem (°C)', tipo: 'numero', visivel: g => !!g.material_aplicado },
      { nome: 'camada', rotulo: 'Camada', tipo: 'lista', opcoes: CAMADAS_ASFALTO, visivel: naoAplicado },
    ],
    amostra: g => (aplicado(g) ? [
      { nome: 'identificacao_caminhao', rotulo: 'Identificação do caminhão', tipo: 'texto', herda: false },
      { nome: 'temp_aplicacao', rotulo: 'Temperatura de aplicação (°C)', tipo: 'numero' },
      pista,
      { nome: 'faixa', rotulo: 'Faixa', tipo: 'lista', opcoes: FAIXAS },
      { nome: 'camada', rotulo: 'Camada', tipo: 'lista', opcoes: CAMADAS_ASFALTO },
      kmIni, kmFim,
    ] : null),
  },
  cps_extraidos_pista: {
    geral: [
      { nome: 'data_aplicacao', rotulo: 'Data de aplicação da massa asfáltica', tipo: 'data', obrigatorio: true },
      { nome: 'data_extracao', rotulo: 'Data de extração', tipo: 'data' },
      pista,
      { nome: 'faixa', rotulo: 'Faixa', tipo: 'lista', opcoes: FAIXAS },
      { nome: 'espessura_projeto', rotulo: 'Espessura de projeto (cm)', tipo: 'numero' },
      projeto, kmIni, kmFim,
    ],
    amostra: [
      { nome: 'identificacao_cp', rotulo: 'Identificação / número do CP', tipo: 'texto', herda: false, obrigatorio: true },
      { nome: 'camada', rotulo: 'Camada', tipo: 'lista', opcoes: CAMADAS_ASFALTO },
      { nome: 'lado', rotulo: 'Lado', tipo: 'lista', opcoes: LADOS },
      { nome: 'km_extracao', rotulo: 'Estaca/Km de extração', tipo: 'km', herda: false },
      idade, ruptura,
    ],
  },
  ligante_asfaltico: {
    geral: [
      { nome: 'tipo_ligante', rotulo: 'Tipo de ligante', tipo: 'texto', placeholder: 'Ex.: CAP 50/70, CAP 60/85, RR-1C', obrigatorio: true },
      { nome: 'fornecedor', rotulo: 'Fornecedor / origem', tipo: 'cadastro', fonte: 'fornecedores', idCampo: 'fornecedor_id' },
      { nome: 'data_chegada', rotulo: 'Data de chegada da carreta', tipo: 'data' },
      { nome: 'data_inicio_uso', rotulo: 'Data de início de uso', tipo: 'data' },
      { nome: 'data_coleta', rotulo: 'Data da coleta', tipo: 'data' },
      { nome: 'certificado', rotulo: 'Certificado de qualidade', tipo: 'arquivo', largo: true },
    ],
    amostra: null,
  },

  // ── Concreto ───────────────────────────────────────────────────────────────
  concreto: {
    geral: [
      { nome: 'local_concretagem', rotulo: 'Local da concretagem', tipo: 'texto' },
      { nome: 'data_moldagem', rotulo: 'Data de moldagem', tipo: 'data', obrigatorio: true },
      { nome: 'hora_moldagem', rotulo: 'Hora de moldagem', tipo: 'hora' },
      { nome: 'elemento', rotulo: 'Peça / elemento concretado', tipo: 'texto', placeholder: 'Ex.: Viga longarina' },
      { nome: 'fck_projeto', rotulo: 'fck de projeto (MPa)', tipo: 'numero' },
      { nome: 'slump_projeto', rotulo: 'Slump de projeto (mm)', tipo: 'numero' },
      { nome: 'responsavel_moldagem', rotulo: 'Executante / responsável pela moldagem', tipo: 'lista', opcoes: RESP_MOLDAGEM },
    ],
    amostra: [
      { nome: 'identificacao_cp', rotulo: 'Identificação / número do CP', tipo: 'texto', herda: false, obrigatorio: true },
      { nome: 'identificacao_caminhao', rotulo: 'Caminhão / romaneio', tipo: 'texto' },
      { nome: 'temp_concreto', rotulo: 'Temperatura do concreto (°C)', tipo: 'numero' },
      { nome: 'slump_obtido', rotulo: 'Slump obtido (mm)', tipo: 'numero' },
      { nome: 'dimensoes_cp', rotulo: 'Dimensões do CP (cm)', tipo: 'lista', opcoes: DIMENSOES_CP, outroCampo: 'dimensoes_cp_outro' },
      idade, ruptura,
    ],
  },
}

// ── Ensaios especiais in loco (mesmo formulário para os quatro) ──────────────
const ESPECIAL = {
  geral: [
    { nome: 'data_solicitacao', rotulo: 'Data da solicitação', tipo: 'data', padrao: 'hoje' },
    kmIni, kmFim,
    { nome: 'camada', rotulo: 'Camada', tipo: 'lista', opcoes: CAMADAS_ESPECIAL },
    pista,
    { nome: 'faixa', rotulo: 'Faixa', tipo: 'lista', opcoes: FAIXAS_ESPECIAL },
    { nome: 'lado', rotulo: 'Lado', tipo: 'lista', opcoes: LADOS_ESPECIAL },
    { nome: 'qtd_pontos', rotulo: 'Quantidade de pontos', tipo: 'numero' },
    { nome: 'data_desejada', rotulo: 'Data desejada para o ensaio', tipo: 'data' },
  ],
  amostra: null,
}
for (const s of ['deflectometria', 'mancha_areia', 'pendulo_britanico', 'densimetro']) FORMULARIOS[s] = ESPECIAL

// ── Funções ──────────────────────────────────────────────────────────────────

export function formularioDe(subcategoria) {
  return FORMULARIOS[subcategoria] || null
}

/** Campos gerais visíveis (alguns dependem do que já foi escolhido) */
export function camposGerais(subcategoria, geral = {}) {
  const f = formularioDe(subcategoria)
  return (f?.geral || []).filter(c => !c.visivel || c.visivel(geral))
}

/** Campos de cada amostra; null = amostra única (sem a seção "Amostras") */
export function camposAmostra(subcategoria, geral = {}) {
  const f = formularioDe(subcategoria)
  if (!f) return null
  const a = typeof f.amostra === 'function' ? f.amostra(geral) : f.amostra
  return a && a.length ? a : null
}

/** Valores iniciais dos campos gerais (padrões e campos fixos) */
export function geralInicial(subcategoria, hojeISO) {
  const g = {}
  for (const c of formularioDe(subcategoria)?.geral || []) {
    if (c.padrao === 'hoje' && hojeISO) g[c.nome] = hojeISO
  }
  return g
}

/** Nova amostra herdando da anterior (menos os campos de identificação) */
export function herdarAmostra(subcategoria, geral, anterior = {}) {
  const campos = camposAmostra(subcategoria, geral) || []
  const nova = {}
  for (const c of campos) {
    if (c.herda === false) continue
    if (anterior[c.nome] !== undefined && anterior[c.nome] !== '') nova[c.nome] = anterior[c.nome]
    if (c.outroCampo && anterior[c.outroCampo]) nova[c.outroCampo] = anterior[c.outroCampo]
  }
  return nova
}

const vazio = v => v === undefined || v === null || String(v).trim() === ''

/** Campos obrigatórios em branco → mensagem (ou null) */
export function validarFormulario(subcategoria, geral, amostras) {
  if (!formularioDe(subcategoria)) return null
  for (const c of camposGerais(subcategoria, geral)) {
    if (c.obrigatorio && c.tipo !== 'fixo' && vazio(geral[c.nome])) return `Informe "${c.rotulo}".`
  }
  const campos = camposAmostra(subcategoria, geral)
  if (campos) {
    for (let i = 0; i < amostras.length; i++) {
      for (const c of campos) {
        if (c.obrigatorio && vazio(amostras[i]?.[c.nome])) return `Amostra ${i + 1}: informe "${c.rotulo}".`
      }
    }
  }
  return null
}

function limpar(obj) {
  return Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => !vazio(v)))
}

const nomesDe = campos => (campos || []).flatMap(c => [c.nome, c.idCampo, c.outroCampo].filter(Boolean))

/**
 * Monta dados_amostra: campos gerais + campos da amostra em cada linha.
 * Campos do formulário que ficaram ocultos (ex.: trocou "Material aplicado?") saem;
 * campos de pedidos antigos que o formulário não conhece são mantidos.
 */
export function montarDadosAmostra(subcategoria, geral, amostras) {
  const f = formularioDe(subcategoria)
  const g = limpar(geral)
  const visiveisG = camposGerais(subcategoria, geral)
  for (const c of visiveisG) if (c.tipo === 'fixo') g[c.nome] = c.valor
  const ocultosG = new Set(nomesDe(f?.geral).filter(n => !nomesDe(visiveisG).includes(n)))
  const gFinal = Object.fromEntries(Object.entries(g).filter(([k]) => !ocultosG.has(k)))

  const campos = camposAmostra(subcategoria, geral)
  const todosA = typeof f?.amostra === 'function'
    ? [...nomesDe(f.amostra({ material_aplicado: 'Sim' })), ...nomesDe(f.amostra({ material_aplicado: 'Não' }))]
    : nomesDe(f?.amostra)
  const ocultosA = new Set(todosA.filter(n => !nomesDe(campos).includes(n)))
  const linhas = campos ? amostras : [amostras[0] || {}]
  return linhas.map(a => {
    const propria = Object.fromEntries(Object.entries(limpar(a)).filter(([k]) => !ocultosA.has(k) && k !== 'info_geral'))
    return { ...gFinal, ...propria, info_geral: gFinal }
  })
}

/** Reabre dados_amostra no formulário: { geral, amostras } */
export function separarDadosAmostra(subcategoria, dados) {
  const lista = Array.isArray(dados) ? dados : []
  if (!lista.length) return { geral: {}, amostras: [{}] }
  const geral = lista[0]?.info_geral ? { ...lista[0].info_geral } : {}
  if (!lista[0]?.info_geral) {
    // pedido antigo: os campos gerais conhecidos saem da primeira amostra
    for (const c of formularioDe(subcategoria)?.geral || []) {
      for (const k of [c.nome, c.idCampo, c.outroCampo].filter(Boolean)) {
        if (!vazio(lista[0][k])) geral[k] = lista[0][k]
      }
    }
  }
  const amostras = lista.map(a => {
    const { info_geral: _ig, ...resto } = a // eslint-disable-line no-unused-vars
    for (const k of Object.keys(geral)) if (resto[k] === geral[k]) delete resto[k]
    return resto
  })
  return { geral, amostras: amostras.length ? amostras : [{}] }
}

// ── Rótulos e formatação para quem lê o pedido (Laboratório, fichas) ────────
const _todos = []
for (const f of new Set(Object.values(FORMULARIOS))) {
  _todos.push(...(f.geral || []))
  const a = typeof f.amostra === 'function'
    ? [...(f.amostra({ material_aplicado: 'Sim' }) || []), ...(f.amostra({ material_aplicado: 'Não' }) || [])]
    : (f.amostra || [])
  _todos.push(...a)
}
export const ROTULOS_FORMULARIO = Object.fromEntries([
  ..._todos.map(c => [c.nome, c.rotulo]),
  ..._todos.filter(c => c.outroCampo).map(c => [c.outroCampo, `${c.rotulo} — outra medida`]),
])
export const CAMPOS_KM = new Set([..._todos.filter(c => c.tipo === 'km').map(c => c.nome),
  'estaca', 'estaca_inicial', 'estaca_final', 'estaca_extracao', 'km'])
/** Campos internos (ids dos cadastros, cópia das informações gerais) que não aparecem na tela */
export const CAMPOS_OCULTOS = new Set(['info_geral', ..._todos.filter(c => c.idCampo).map(c => c.idCampo)])

/** Ordem dos campos para exibição (gerais e depois os da amostra) */
export function ordemCampos(subcategoria) {
  const f = formularioDe(subcategoria)
  if (!f) return []
  const a = typeof f.amostra === 'function'
    ? [...(f.amostra({ material_aplicado: 'Sim' }) || []), ...(f.amostra({ material_aplicado: 'Não' }) || [])]
    : (f.amostra || [])
  return [...new Set([...(f.geral || []), ...a].flatMap(c => [c.nome, c.outroCampo].filter(Boolean)))]
}
