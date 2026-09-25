// Ensaios conforme FR-IMOB-04 — lista fixa da concessionária
// Divididos em duas seções: Especificação e Detalhar Ensaios (por material)

// ── Seção A: Especificação ────────────────────────────────────────────────
// Aplicável a qualquer tipo de pedido
export const ESPECIFICACAO = [
  { id: 'esp_programar_coleta',        nome: 'Programar coleta dos materiais em campo' },
  { id: 'esp_caract_agregados',        nome: 'Caracterização dos agregados (brita, pedrisco, pó)' },
  { id: 'esp_caract_ligante',          nome: 'Caracterização do ligante' },
  { id: 'esp_caract_rap',              nome: 'Caracterização do RAP' },
  { id: 'esp_dosagem_misturas',        nome: 'Estudos de dosagem de misturas asfálticas' },
  { id: 'esp_investigativos',          nome: 'Ensaios investigativos do pavimento' },
  { id: 'esp_compressao_axial',        nome: 'Compressão Axial / Diametral' },
  { id: 'esp_controle_campo',          nome: 'Controle em campo' },
  { id: 'esp_misturas_frescas',        nome: 'Misturas frescas' },
  { id: 'esp_misturas_endurecidas',    nome: 'Misturas endurecidas' },
  { id: 'esp_outros',                  nome: 'Outros' },
]

// ── Seção B: Ensaios por material ─────────────────────────────────────────
export const ENSAIOS_ASFALTO = [
  { id: 'asf_rice_test',               nome: 'Densidade máxima teórica e massa específica máxima teórica - rice test' },
  { id: 'asf_equiv_areia',             nome: 'Determinação da equivalência de areia' },
  { id: 'asf_viscosidade_brookfield',  nome: 'Viscosidade usando viscosímetro rotacional brookfield' },
  { id: 'asf_penetracao',              nome: 'Penetração' },
  { id: 'asf_ponto_fulgor',            nome: 'Ponto de fulgor - vaso aberto de cleveland' },
  { id: 'asf_ponto_amolecimento',      nome: 'Ponto de amolecimento - método anel e bola' },
  { id: 'asf_recuperacao_elastica',    nome: 'Recuperação elástica' },
  { id: 'asf_ductilidade',             nome: 'Ductilidade a 25ºC 5 cm/min' },
  { id: 'asf_espessura_indeformadas',  nome: 'Conferência de espessuras de amostras indeformadas' },
  { id: 'asf_extracao_rotarex',        nome: 'Extração de betume (rotarex)' },
  { id: 'asf_extracao_soxhlet',        nome: 'Extração de betume (soxhlet)' },
  { id: 'asf_marshall',                nome: 'Ensaios marshall (volumetria, fluência, estabilidade, tração)' },
  { id: 'asf_dano_umidade',            nome: 'Dano por umidade induzida' },
  { id: 'asf_modulo_resiliencia',      nome: 'Ensaio de módulo de resiliência' },
  { id: 'asf_fadiga',                  nome: 'Ensaio de fadiga' },
  { id: 'asf_def_permanente',          nome: 'Ensaio de deformação permanente' },
  { id: 'asf_outros',                  nome: 'Outros (Especificar na observação)' },
]

export const ENSAIOS_SOLOS = [
  { id: 'sol_granulometria',           nome: 'Análise granulométrica por peneiramento' },
  { id: 'sol_compactacao_nao_trab',    nome: 'Compactação de amostras não trabalhadas' },
  { id: 'sol_compactacao_trab',        nome: 'Compactação de amostras trabalhadas' },
  { id: 'sol_umidade',                 nome: 'Teor de umidade' },
  { id: 'sol_massa_esp_in_situ',       nome: 'Massa específica aparente "in situ"' },
  { id: 'sol_resistencia_tracao',      nome: 'Resistência à tração' },
  { id: 'sol_espessura_indeformadas',  nome: 'Conferência de espessuras de amostras indeformadas' },
  { id: 'sol_deflectometria_viga',     nome: 'Verificação deflectométrica - viga benkelman' },
  { id: 'sol_massa_esp_graudo',        nome: 'Massa específica, densidade relativa, absorção de agregado graúdo' },
  { id: 'sol_massa_esp_miudo',         nome: 'Massa específica real, densidade relativa real de agregado miúdo' },
  { id: 'sol_outros',                  nome: 'Outros (Especificar na observação)' },
]

export const ENSAIOS_CONCRETO = [
  { id: 'con_compressao_axial',        nome: 'Compressão Axial de Corpo de Prova' },
]

// Mapa por tipo de material
export const ENSAIOS_POR_TIPO = {
  asfalto:  ENSAIOS_ASFALTO,
  solos:    ENSAIOS_SOLOS,
  concreto: ENSAIOS_CONCRETO,
  // Para especiais e outros, exibe solos + asfalto + concreto
  especial: [...ENSAIOS_ASFALTO, ...ENSAIOS_SOLOS, ...ENSAIOS_CONCRETO],
}
