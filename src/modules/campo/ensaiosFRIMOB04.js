// ─────────────────────────────────────────────────────────────────────────────
// Lista da FR-IMOB-04 (ordem e textos da ficha da concessionária)
//
// • Especificação: não são ensaios. O `id` é a coluna da FR-IMOB-04
//   (fichas_os.espec_*). Vão em pedidos_ensaio.especificacoes e já saem
//   marcadas na FR-IMOB-04 quando a O.S. é gerada (migração 15).
// • Ensaios por material: o `codigo` é a coluna da FR-IMOB-04 (fichas_os.ens_*)
//   e liga o item ao ensaio do catálogo (ensaios.codigo_frimob04). O pedido
//   grava o id do ensaio do catálogo em ensaios_ids — é o que o Laboratório usa
//   para montar a O.S. e escolher a ficha.
// ─────────────────────────────────────────────────────────────────────────────

// ── Seção A: Especificação ────────────────────────────────────────────────
export const ESPECIFICACAO = [
  { id: 'espec_programar_coleta',      nome: 'Programar coleta dos materiais em campo' },
  { id: 'espec_caract_agregados',      nome: 'Caracterização dos agregados (brita, pedrisco, pó)' },
  { id: 'espec_caract_material_asfaltico', nome: 'Caracterização de material asfáltico' },
  { id: 'espec_caract_ligante',        nome: 'Caracterização do ligante' },
  { id: 'espec_caract_rap',            nome: 'Caracterização do RAP' },
  { id: 'espec_dosagem_asfaltica',     nome: 'Estudos de dosagem de misturas asfálticas' },
  { id: 'espec_investigativos',        nome: 'Ensaios investigativos do pavimento' },
  { id: 'espec_compressao',            nome: 'Compressão Axial / Diametral' },
  { id: 'espec_controle_campo',        nome: 'Controle em campo' },
  { id: 'espec_misturas_frescas',      nome: 'Misturas frescas' },
  { id: 'espec_misturas_endurecidas',  nome: 'Misturas endurecidas' },
]

// ── Seção B: Ensaios por material ─────────────────────────────────────────
export const ENSAIOS_ASFALTO = [
  { codigo: 'ens_rice',                 nome: 'Densidade máxima teórica e massa específica máxima teórica - rice test' },
  { codigo: 'ens_equiv_areia',          nome: 'Determinação da equivalência de areia' },
  { codigo: 'ens_viscosidade',          nome: 'Viscosidade usando viscosímetro rotacional brookfield' },
  { codigo: 'ens_penetracao',           nome: 'Penetração' },
  { codigo: 'ens_ponto_fulgor',         nome: 'Ponto de fulgor - vaso aberto de cleveland' },
  { codigo: 'ens_ponto_amolecimento',   nome: 'Ponto de amolecimento - método anel e bola' },
  { codigo: 'ens_recuperacao_elastica', nome: 'Recuperação elástica' },
  { codigo: 'ens_ductilidade',          nome: 'Ductilidade a 25ºC 5 cm/min' },
  { codigo: 'ens_conf_espessuras_asf',  nome: 'Conferência de espessuras de amostras indeformadas' },
  { codigo: 'ens_extracao_rotarex',     nome: 'Extração de betume (rotarex)' },
  { codigo: 'ens_extracao_soxhlet',     nome: 'Extração de betume (soxhlet)' },
  { codigo: 'ens_marshall',             nome: 'Ensaios marshall (volumetria, fluência, estabilidade, tração)' },
  { codigo: 'ens_dano_umidade',         nome: 'Dano por umidade induzida' },
  { codigo: 'ens_modulo_resiliencia',   nome: 'Ensaio de módulo de resiliência' },
  { codigo: 'ens_fadiga',               nome: 'Ensaio de fadiga' },
  { codigo: 'ens_deformacao_perm',      nome: 'Ensaio de deformação permanente' },
  { codigo: 'ens_caract_material_asfaltico', nome: 'Caracterização de material asfáltico' },
]

export const ENSAIOS_SOLOS = [
  { codigo: 'ens_granulometria',        nome: 'Análise granulométrica por peneiramento' },
  { codigo: 'ens_compactacao_nt',       nome: 'Compactação de amostras não trabalhadas' },
  { codigo: 'ens_compactacao_t',        nome: 'Compactação de amostras trabalhadas' },
  { codigo: 'ens_teor_umidade',         nome: 'Teor de umidade' },
  { codigo: 'ens_massa_esp_insitu',     nome: 'Massa específica aparente "in situ"' },
  { codigo: 'ens_resistencia_tracao',   nome: 'Resistência à tração' },
  { codigo: 'ens_conf_espessuras_solo', nome: 'Conferência de espessuras de amostras indeformadas' },
  { codigo: 'ens_benkelman',            nome: 'Verificação deflectométrica - viga benkelman' },
  { codigo: 'ens_dens_agr_graudo',      nome: 'Massa específica, densidade relativa, absorção de agregado graúdo' },
  { codigo: 'ens_dens_agr_miudo',       nome: 'Massa específica real, densidade relativa real de agregado miúdo' },
]

export const ENSAIOS_CONCRETO = [
  { codigo: 'ens_compressao_axial',     nome: 'Compressão Axial de Corpo de Prova' },
]

// Grupos mostrados no pedido: todos os ensaios, independente do material
// (decisão de 06/10/2026 — "Outros" saiu a pedido do auditor)
export const GRUPOS_ENSAIOS = [
  { titulo: 'Asfalto', itens: ENSAIOS_ASFALTO },
  { titulo: 'Solos e Agregados', itens: ENSAIOS_SOLOS },
  { titulo: 'Concreto', itens: ENSAIOS_CONCRETO },
]

/**
 * Liga os itens da FR-IMOB-04 aos ensaios do catálogo (ensaios.codigo_frimob04).
 * Cada item recebe `id` = id do ensaio no banco; sem correspondência, fica
 * `indisponivel` (aparece desabilitado — o DEV precisa cadastrar/ligar no catálogo).
 */
export function resolverEnsaios(lista, catalogo = []) {
  const porCodigo = {}
  for (const e of catalogo) if (e.codigo_frimob04 && e.ativo !== false) porCodigo[e.codigo_frimob04] = e
  return lista.map(item => {
    const e = porCodigo[item.codigo]
    return e ? { ...item, id: e.id } : { ...item, id: `sem_catalogo:${item.codigo}`, indisponivel: true }
  })
}
