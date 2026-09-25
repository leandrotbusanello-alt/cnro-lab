export const SENHA_PADRAO = '123456'

export const PERFIS = [
  { id: 'DEV',    rotulo: 'Desenvolvedor', descricao: 'Acesso total, inclusive a Gestores' },
  { id: 'GESTOR', rotulo: 'Gestor',        descricao: 'Administra usuários, empresas e todos os módulos' },
  { id: 'LAB',    rotulo: 'Laboratorista', descricao: 'Módulos Laboratório, Assistente e Campo' },
  { id: 'ASSIST', rotulo: 'Assistente',    descricao: 'Módulo Assistente' },
  { id: 'CAMPO',  rotulo: 'Campo',         descricao: 'Módulo Campo (pedidos de ensaio)' },
]

export const PERFIS_POR_ID = Object.fromEntries(PERFIS.map(p => [p.id, p]))

export function rotuloPerfil(id) {
  return PERFIS_POR_ID[String(id || '').toUpperCase()]?.rotulo || id || '—'
}

/** Perfis que o usuário logado pode atribuir/gerenciar (DEV > GESTOR > demais). */
export function perfisGerenciaveis(perfilAtor) {
  if (perfilAtor === 'DEV') return PERFIS.map(p => p.id)
  if (perfilAtor === 'GESTOR') return ['LAB', 'ASSIST', 'CAMPO']
  return []
}

export function podeGerenciar(perfilAtor, perfilAlvo) {
  return perfisGerenciaveis(perfilAtor).includes(String(perfilAlvo || '').toUpperCase())
}

export const LIMITE_ASSINATURA_MB = 1
export const LIMITE_FOTO_MB = 3
