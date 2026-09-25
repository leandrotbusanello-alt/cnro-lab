export const SENHA_PADRAO = '123456'

export const PERFIS = [
  { id: 'DEV',    rotulo: 'Desenvolvedor', descricao: 'Acesso total, inclusive ao cadastro de Gestores' },
  { id: 'GESTOR', rotulo: 'Gestor',        descricao: 'Todos os módulos; administra usuários e empresas' },
  { id: 'LAB',    rotulo: 'Laboratorista', descricao: 'Valida pedidos, gera e revisa O.S.' },
  { id: 'ASSIST', rotulo: 'Assistente',    descricao: 'Executa os ensaios' },
  { id: 'CAMPO',  rotulo: 'Campo',         descricao: 'Faz os pedidos de ensaio' },
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

// ─── Módulos de acesso (usuarios.modulos_acesso — migração 13) ─────────────
export { MODULOS_PADRAO, modulosDoUsuario } from '../../lib/modulos'

export const MODULOS = [
  { id: 'dashboard',   rotulo: 'Dashboard' },
  { id: 'campo',       rotulo: 'Campo' },
  { id: 'laboratorio', rotulo: 'Laboratório' },
  { id: 'assistente',  rotulo: 'Assistente' },
  { id: 'gestor',      rotulo: 'Gestor' },
]

/** Módulos que podem ser marcados para LAB / ASSIST / CAMPO (Gestor é exclusivo de GESTOR/DEV) */
export const MODULOS_ATRIBUIVEIS = ['dashboard', 'campo', 'laboratorio', 'assistente']

export const rotuloModulo = id => MODULOS.find(m => m.id === id)?.rotulo || id

/** GESTOR e DEV têm sempre todos os módulos */
export const perfilTemTodos = perfil => ['DEV', 'GESTOR'].includes(String(perfil || '').toUpperCase())

/**
 * Assinatura obrigatória: quem executa ou revisa ensaios (módulo Laboratório ou Assistente).
 * Gestor e Dev não precisam (não executam ensaios).
 */
export function exigeAssinatura(perfil, modulos) {
  if (perfilTemTodos(perfil)) return false
  return (modulos || []).some(m => m === 'laboratorio' || m === 'assistente')
}
