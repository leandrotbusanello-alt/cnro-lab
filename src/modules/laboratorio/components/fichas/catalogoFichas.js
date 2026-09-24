// ─────────────────────────────────────────────────────────────────────────────
// Conteúdo fixo das fichas FR-IMOB-04 e FR-IMOB-05 (textos das planilhas Rev00)
// e regras de preenchimento automático.
// ─────────────────────────────────────────────────────────────────────────────

export const CABECALHO = {
  vigencia: '16/02/2026',
  versao: '00',
  fase: 'Vigente',
  nivel: 'Operacional',
  tipo: 'Formulário',
}

export const RESPONSAVEIS_DOC = {
  elaborado: 'Thyago Biasin',
  revisado: 'Samara Rodrigues',
  aprovado: 'Rheno Tormin',
}

// ── FR-IMOB-04 ───────────────────────────────────────────────────────────────

export const ESPECIFICACOES = [
  { campo: 'espec_programar_coleta',     rotulo: 'Programar coleta dos materiais em campo' },
  { campo: 'espec_caract_agregados',     rotulo: 'Caracterização dos agregados (brita, pesdrisco, pó)' },
  { campo: 'espec_caract_ligante',       rotulo: 'Caracterização do ligante' },
  { campo: 'espec_caract_rap',           rotulo: 'Caracterização do RAP' },
  { campo: 'espec_dosagem_asfaltica',    rotulo: 'Estudos de dosagem de misturas asfalticas' },
  { campo: 'espec_investigativos',       rotulo: 'Ensaios investigativos do pavimento' },
  { campo: 'espec_compressao',           rotulo: 'Compreensão Axial / Diametral' },
  { campo: 'espec_controle_campo',       rotulo: 'Controle em campo' },
  { campo: 'espec_misturas_frescas',     rotulo: 'Misturas frescas' },
  { campo: 'espec_misturas_endurecidas', rotulo: 'Misturas endurecidas' },
  { campo: 'espec_outros',               rotulo: 'Outros' },
]

// termos: trechos (sem acento, minúsculos) procurados no nome dos ensaios do pedido
export const ENSAIOS_ASFALTO = [
  { campo: 'ens_rice',                 rotulo: 'Densidade máxima teórica e massa específica máxima teórica - rice test', termos: ['rice', 'densidade maxima teorica'] },
  { campo: 'ens_equiv_areia',          rotulo: 'Determinação da equivalência de areia', termos: ['equivalencia de areia', 'equivalente de areia'] },
  { campo: 'ens_viscosidade',          rotulo: 'Viscosidade usando viscosímetro rotacional brookfield', termos: ['viscosidade', 'brookfield'] },
  { campo: 'ens_penetracao',           rotulo: 'Penetração', termos: ['penetracao'] },
  { campo: 'ens_ponto_fulgor',         rotulo: 'Ponto de fulgor - vaso aberto de cleveland', termos: ['fulgor'] },
  { campo: 'ens_ponto_amolecimento',   rotulo: 'Ponto de amolecimento - método anel e bola', termos: ['amolecimento'] },
  { campo: 'ens_recuperacao_elastica', rotulo: 'Recuperação elástica', termos: ['recuperacao elastica'] },
  { campo: 'ens_ductilidade',          rotulo: 'Ductilidade a 25ºc 5 cm/min', termos: ['ductilidade'] },
  { campo: 'ens_conf_espessuras_asf',  rotulo: 'Conferência de espessuras de amostras indeformadas', termos: ['espessura'], material: 'asfalto' },
  { campo: 'ens_extracao_rotarex',     rotulo: 'Extração de betume (rotarex)', termos: ['rotarex'] },
  { campo: 'ens_extracao_soxhlet',     rotulo: 'Extração de betume (soxhlet)', termos: ['soxhlet'] },
  { campo: 'ens_marshall',             rotulo: 'Ensaios marshall (volumetria, fluencia, estabilidade, tração)', termos: ['marshall'] },
  { campo: 'ens_dano_umidade',         rotulo: 'Dano por umidade induzida', termos: ['dano por umidade', 'umidade induzida', 'lottman'] },
  { campo: 'ens_modulo_resiliencia',   rotulo: 'Ensaio de módulo de resiliência', termos: ['resiliencia'] },
  { campo: 'ens_fadiga',               rotulo: 'Ensaio de fadiga', termos: ['fadiga'] },
  { campo: 'ens_deformacao_perm',      rotulo: 'Ensaio de deformação permanente', termos: ['deformacao permanente', 'flow number'] },
  { campo: 'ens_outros_asfalto',       rotulo: 'Outros (Especificar na observação)', termos: [] },
]

export const ENSAIOS_SOLOS = [
  { campo: 'ens_granulometria',        rotulo: 'Análise granulométrica por peneiramento', termos: ['granulometr'] },
  { campo: 'ens_compactacao_nt',       rotulo: 'Compactação de amostras não trabalhadas', termos: ['nao trabalhada'] },
  { campo: 'ens_compactacao_t',        rotulo: 'Compactação de amostras  trabalhadas', termos: ['amostras trabalhadas', 'proctor', 'compactacao'] },
  { campo: 'ens_teor_umidade',         rotulo: 'Teor de úmidade', termos: ['teor de umidade'] },
  { campo: 'ens_massa_esp_insitu',     rotulo: 'Massa especifica aparente "in situ"', termos: ['in situ', 'frasco de areia', 'densimetro'] },
  { campo: 'ens_resistencia_tracao',   rotulo: 'Resistência à tração', termos: ['resistencia a tracao', 'compressao diametral', 'rtcd'] },
  { campo: 'ens_conf_espessuras_solo', rotulo: 'Conferência de espessuras de amostras indeformadas', termos: ['espessura'], materialNao: 'asfalto' },
  { campo: 'ens_benkelman',            rotulo: 'Verificação deflectométrica - viga benkelman', termos: ['benkelman', 'deflect'] },
  { campo: 'ens_outros_solos',         rotulo: 'Outros (Especificar na observação)', termos: [] },
  { campo: 'ens_dens_agr_graudo',      rotulo: 'Massa específica, densidade relativa, absorção de agregado graúdo', termos: ['graudo'] },
  { campo: 'ens_dens_agr_miudo',       rotulo: 'Massa específica real, densidade realativa real de agregado miúdo', termos: ['miudo'] },
]

export const ENSAIOS_CONCRETO = [
  { campo: 'ens_compressao_axial',     rotulo: 'Compreensão Axial de Corpo de Prova', termos: ['compressao axial', 'rompimento', 'compressao simples'] },
]

export const CAMPOS_BOOLEANOS_OS = [
  ...ESPECIFICACOES, ...ENSAIOS_ASFALTO, ...ENSAIOS_SOLOS, ...ENSAIOS_CONCRETO,
].map(i => i.campo)

// ── FR-IMOB-05 ───────────────────────────────────────────────────────────────

export const TIPOS_SOLICITACAO = [
  { campo: 'tipo_contraprova',  rotulo: 'Contra-prova de ensaios realizados pelas terceiras', valor: 'Contraprova' },
  { campo: 'tipo_investigacao', rotulo: 'Investigação de patologia no pavimento',            valor: 'Investigação' },
  { campo: 'tipo_estudo',       rotulo: 'Estudo de dosagem e/ou de materiais',               valor: 'Estudo' },
  { campo: 'tipo_outros',       rotulo: 'Outros',                                            valor: 'Outros' },
]

/** 3 blocos × 15 linhas, como na planilha */
export const LOCALIZACOES_POR_BLOCO = 15
export const BLOCOS_LOCALIZACAO = 3

// ── Regras ───────────────────────────────────────────────────────────────────

export function semAcento(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Marcação sugerida em "Detalhar ensaios" a partir dos ensaios do pedido.
 * Ensaios sem correspondência marcam "Outros" da coluna do material.
 */
export function sugerirEnsaios(nomesEnsaios, material) {
  const marcados = {}
  const mat = semAcento(material)
  const todos = [...ENSAIOS_ASFALTO, ...ENSAIOS_SOLOS, ...ENSAIOS_CONCRETO]
  for (const nomeOriginal of nomesEnsaios) {
    const nome = semAcento(nomeOriginal)
    let achou = false
    for (const item of todos) {
      if (item.material && item.material !== mat) continue
      if (item.materialNao && item.materialNao === mat) continue
      if (item.campo === 'ens_compactacao_t' && nome.includes('nao trabalhada')) continue
      if (item.termos.some(t => nome.includes(t))) {
        marcados[item.campo] = true
        achou = true
        break
      }
    }
    if (!achou) marcados[mat === 'asfalto' ? 'ens_outros_asfalto' : 'ens_outros_solos'] = true
  }
  return marcados
}

/** Mesma regra da planilha (célula Q12) */
export function calcularIndicador({ entrega_solicitacao, previsao_entrega, repactuacao_data }) {
  if (!entrega_solicitacao) return ''
  const limite = repactuacao_data || previsao_entrega
  if (!limite) return ''
  return entrega_solicitacao <= limite ? 'Entrega no prazo' : 'Entrega fora do prazo'
}

/** Observação padrão (mesmo texto da função gerar_observacao_os do banco) */
export function observacaoPadrao(pedido, amostras, empresaNome) {
  const am = amostras[0] || {}
  const emp = empresaNome || pedido.empresa || '---'
  const lote = pedido.lote || '---'
  const ano = pedido.ano || new Date(pedido.created_at || Date.now()).getFullYear()
  const reg = `. REGISTRADOS COM N° ${String(pedido.sequencial || 0).padStart(4, '0')}/${ano}.`
  switch (pedido.sub_tipo) {
    case 'cps_extraidos_pista':
    case 'cp_pista':
      return `FORAM EXTRAÍDOS PELA EQUIPE DO LABORATÓRIO CNRO CORPOS DE PROVA (CPs) DE C.A.U.Q. PROVENIENTES DA ESTACA ${am.estaca_extracao || am.cpp_km_ini || '---'} — ${emp} / LOTE ${lote}${reg}`
    case 'jazida':
    case 'caixa_emprestimo':
      return `FOI ENTREGUE AO LABORATÓRIO AMOSTRA DE SOLO PARA A CARACTERIZAÇÃO COMPLETA. MATERIAL PROVENIENTE DA ${String(am.jazida || am.jazida_nome || 'JAZIDA').toUpperCase()} / LOTE ${lote}${reg}`
    case 'concreto':
    case 'cp_concreto':
      return `FORAM ENTREGUES AO LABORATÓRIO CORPOS DE PROVA DE CONCRETO. CORPOS DE PROVA PROVENIENTES DO CONSÓRCIO ${emp} / LOTE ${lote}${reg}`
    case 'massa_asfaltica':
    case 'massa':
      return `FOI COLETADA AMOSTRA DE MASSA ASFÁLTICA PARA ENSAIOS DE CONTROLE. MATERIAL PROVENIENTE DO CONSÓRCIO ${emp} / LOTE ${lote}${reg}`
    case 'agregados':
      return `FOI ENTREGUE AO LABORATÓRIO AMOSTRA DE AGREGADO PARA CARACTERIZAÇÃO. MATERIAL PROVENIENTE DA PEDREIRA: ${String(am.origem || am.agr_pedreira || '---').toUpperCase()}. CONSÓRCIO ${emp} / LOTE ${lote}${reg}`
    default:
      return `MATERIAL RECEBIDO NO LABORATÓRIO CNRO. PROVENIENTE DO CONSÓRCIO ${emp} / LOTE ${lote}${reg}`
  }
}

/** Localizações a partir das amostras do pedido ({km, pista, trilho}) */
export function localizacoesDasAmostras(amostras) {
  return amostras
    .map(a => ({
      km: a.km || a.estaca_inicial || a.estaca_extracao || a.estaca || '',
      pista: a.pista || '',
      trilho: a.trilho || a.faixa || '',
    }))
    .filter(l => l.km || l.pista || l.trilho)
}

/** Normaliza localizações salvas (aceita o formato antigo {estaca, faixa}) */
export function normalizarLocalizacoes(lista) {
  return (Array.isArray(lista) ? lista : []).map(l => ({
    km: l.km ?? l.estaca ?? '',
    pista: l.pista ?? '',
    trilho: l.trilho ?? l.faixa ?? '',
  }))
}
