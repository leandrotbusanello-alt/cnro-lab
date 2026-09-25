export const TIPOS_AMOSTRA = [
  { value: 'solos',    label: 'Solos e Granulares' },
  { value: 'asfalto',  label: 'Asfalto / Misturas Asfálticas' },
  { value: 'concreto', label: 'Concreto' },
  { value: 'especial', label: 'Ensaios Especiais' },
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
    { value: 'deflectometria',  label: 'Deflectometria (Viga Benkelman / FWD)' },
    { value: 'mancha_areia',    label: 'Mancha de Areia' },
    { value: 'pendulo_britanico', label: 'Pêndulo Britânico' },
    { value: 'densimetro',      label: 'Densímetro Nuclear' },
  ],
}

export const OPCOES_CAMADA = [
  'Subleito', 'Regularização', 'Reforço do Subleito',
  'Sub-base', 'Base', 'Binder', 'Capa',
  'Macadame Betuminoso', 'Tratamento Superficial', 'Outro',
]
export const OPCOES_PISTA = ['Norte', 'Sul', 'Leste', 'Oeste', 'Única', 'Retorno']
export const OPCOES_FAIXA = ['1ª Faixa', '2ª Faixa', '3ª Faixa', 'Acostamento', 'Rua de Serviço']
export const OPCOES_LADO  = ['Direito', 'Esquerdo', 'Eixo', 'Central']
export const OPCOES_PROCTOR = ['Normal (PN)', 'Intermediário (PI)', 'Modificado (PM)']
export const OPCOES_LANCAMENTO = ['Bombeado', 'Grua', 'Manual', 'Calha', 'Carrinho', 'Outro']

// Status do pedido (seção 7 da Referência Técnica — CHECK no banco)
export const STATUS_LABELS = {
  pendente_sync:      'Aguardando envio',
  aguardando_lab:     'Aguardando laboratório',
  em_analise:         'Em análise',
  devolvido_campo:    'Devolvido para correção',
  em_andamento:       'Em andamento',
  aguardando_revisao: 'Em revisão',
  concluido:          'Concluído',
  cancelado:          'Cancelado',
}
