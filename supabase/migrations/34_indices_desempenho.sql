-- =============================================================================
-- CNRO Lab Control — Migração 34: índices de desempenho
-- =============================================================================
-- Pré-requisito: migrações 10, 14 e 30. Idempotente. Pode rodar a qualquer momento
-- (antes ou depois de publicar o app): só cria índices, não muda dados nem regras.
--
-- Índices para os filtros que o aplicativo usa a cada carga de tela:
--  • Fila do Laboratório: pedidos finalizados nos últimos 90 dias e reaberturas pedidas
--    (pedidos_ensaio.finalizado_em / reabertura_solicitada_em), ordenados por created_at.
--  • Painel: solicitados / finalizados / cancelados no período (created_at, finalizado_em,
--    updated_at dos cancelados) e ensaios aprovados no período (ensaios_os.aprovado_em).
--  • Campo ("Meus pedidos"): pedidos do solicitante, mais recentes primeiro.
--  • Login e todas as regras de acesso (RLS): usuario_real_id() procura usuarios.auth_id.
-- =============================================================================

begin;

create index if not exists pedidos_ensaio_created_at_idx
  on public.pedidos_ensaio (created_at);

create index if not exists pedidos_ensaio_finalizado_em_idx
  on public.pedidos_ensaio (finalizado_em) where finalizado_em is not null;

create index if not exists pedidos_ensaio_reabertura_idx
  on public.pedidos_ensaio (reabertura_solicitada_em) where reabertura_solicitada_em is not null;

create index if not exists pedidos_ensaio_cancelado_updated_idx
  on public.pedidos_ensaio (updated_at) where status = 'cancelado';

create index if not exists pedidos_ensaio_solicitante_created_idx
  on public.pedidos_ensaio (solicitante_id, created_at desc);

create index if not exists ensaios_os_aprovado_em_idx
  on public.ensaios_os (aprovado_em) where aprovado_em is not null;

create index if not exists usuarios_auth_id_idx
  on public.usuarios (auth_id);

commit;

-- Estatísticas atualizadas para o planejador usar os índices novos
analyze public.pedidos_ensaio;
analyze public.ensaios_os;
analyze public.usuarios;
