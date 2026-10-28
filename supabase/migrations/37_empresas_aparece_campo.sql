-- =============================================================================
-- CNRO Lab Control — Migração 37: empresa "Aparece no Campo"
-- =============================================================================
-- Pré-requisitos: migrações até a 36. Rodar no SQL Editor do Supabase. Idempotente.
--
-- Algumas empresas são cadastradas só para vincular usuários (CNRO Lote 01/02/03,
-- fiscalizadoras etc.) e não devem aparecer na lista de empresas do pedido no Campo.
--   • aparece_campo = true  → aparece no Campo (se estiver ativa)
--   • aparece_campo = false → "Só cadastro": continua ativa para usuários, traços,
--     concreteiras e pedidos antigos, mas não aparece para novos pedidos no Campo.
-- Todas as empresas começam marcadas (nada some do Campo até alguém desmarcar).
-- Quem altera: Laboratório e Gestor (mesma regra de hoje para editar empresas).
-- =============================================================================

alter table public.empresas
  add column if not exists aparece_campo boolean not null default true;

comment on column public.empresas.aparece_campo is
  'Aparece na lista de empresas do pedido no Campo (false = só cadastro). Migração 37.';

-- Conferência:
-- select nome, lote, ativo, aparece_campo from public.empresas order by nome, lote;
