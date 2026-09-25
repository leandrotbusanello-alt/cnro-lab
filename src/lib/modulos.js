// ─────────────────────────────────────────────────────────────────────────────
// Módulos de acesso por usuário (migração 13)
// Mesma regra de public.modulos_do_usuario() no banco:
//   DEV/GESTOR → todos · demais → usuarios.modulos_acesso se preenchido, senão o padrão do perfil.
// ─────────────────────────────────────────────────────────────────────────────

export const MODULOS_PADRAO = {
  DEV:    ['dashboard', 'campo', 'laboratorio', 'assistente', 'gestor'],
  GESTOR: ['dashboard', 'campo', 'laboratorio', 'assistente', 'gestor'],
  LAB:    ['dashboard', 'campo', 'laboratorio', 'assistente'],
  ASSIST: ['assistente'],
  CAMPO:  ['campo'],
}

/** Módulos efetivos de um registro de `usuarios` */
export function modulosDoUsuario(u) {
  const sigla = String(u?.perfil || '').toUpperCase()
  if (['DEV', 'GESTOR'].includes(sigla) || !(Array.isArray(u?.modulos_acesso) && u.modulos_acesso.length)) {
    return MODULOS_PADRAO[sigla] || []
  }
  return u.modulos_acesso
}
