export const TIPOS_SOLICITACAO = [
  { value: 'rotina',   label: 'Rotina de Obra' },
  { value: 'especial', label: 'Ensaio Especial' },
]

export const TIPOS_AMOSTRA = [
  { value: 'solos',    label: '🪨 Solos e Granulares' },
  { value: 'asfalto',  label: '🛣️ Asfalto / Misturas Asfálticas' },
  { value: 'concreto', label: '🏗️ Concreto' },
  { value: 'especial', label: '🔬 Ensaios Especiais in Loco' },
]

export const SUBCATEGORIAS = {
  solos: [
    { value: 'jazida',           label: 'Jazida' },
    { value: 'caixa_emprestimo', label: 'Caixa de Empréstimo' },
    { value: 'segmento',         label: 'Segmento / Aterro / Sub-base / Base' },
    { value: 'cps_solo_cimento', label: 'CPs Solo-Cimento' },
    { value: 'agregados',        label: 'Agregados / Brita / Areia' },
  ],
  asfalto: [
    { value: 'massa_asfaltica',     label: 'Massa Asfáltica (Usina / Pista)' },
    { value: 'cps_extraidos_pista', label: 'CPs Extraídos de Pista' },
    { value: 'ligante_asfaltico',   label: 'Ligante Asfáltico (CAP / Emulsão)' },
  ],
  concreto: [
    { value: 'concreto', label: 'Concreto (Estrutural / Pavimento)' },
  ],
  especial: [
    { value: 'deflectometria',    label: 'Deflectometria (Viga Benkelman / FWD)' },
    { value: 'mancha_areia',      label: 'Mancha de Areia' },
    { value: 'pendulo_britanico', label: 'Pêndulo Britânico' },
    { value: 'densimetro',        label: 'Densímetro Nuclear' },
    { value: 'outros',            label: 'Outros' },
  ],
}

// Camadas por categoria de material
export const OPCOES_CAMADA_SOLO = [
  'Corpo de Aterro', '1ª CFT', '2ª CFT', '3ª CFT',
  'Subleito', 'Reforço do Subleito', 'Sub-base', 'Sub-base Melhorada',
  'Base', 'Base Melhorada',
]

export const OPCOES_CAMADA_ASFALTO = [
  'Binder', '1ª Camada', '2ª Camada', 'Capa',
]

export const OPCOES_PISTA  = ['Norte', 'Sul', 'Marginal Norte', 'Marginal Sul']
export const OPCOES_FAIXA  = ['1ª Faixa', '2ª Faixa', '3ª Faixa', 'Acostamento', 'Rua de Serviço']
export const OPCOES_LADO   = ['LD', 'LE', 'EX']
export const OPCOES_PROCTOR = ['Normal (PN)', 'Intermediário (PI)', 'Modificado (PM)']
export const OPCOES_LANCAMENTO = ['Bombeado', 'Grua', 'Manual', 'Calha', 'Carrinho', 'Outro']
export const OPCOES_IDADE_RUPTURA = ['03', '07', '14', '28', '63']

export const STATUS_LABELS = {
  pendente_sync:    'Aguardando envio',
  aguardando_lab:   'Aguardando laboratório',
  em_analise:       'Em análise',
  aprovado:         'Aprovado',
  devolvido:        'Devolvido para correção',
  cancelado:        'Cancelado',
}
