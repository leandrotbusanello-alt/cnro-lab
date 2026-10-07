-- =============================================================================
-- CNRO Lab Control — Migração 18: ajustes de 07/10/2026
-- =============================================================================
-- Pré-requisito: migração 17. Rodar no SQL Editor. Idempotente, transação única.
--
--  1. Ensaio "Caracterização de Material Asfáltico" (pedido do auditor): entra no catálogo
--     (Asfalto) e na FR-IMOB-04, em "Detalhar ensaios" (coluna Asfalto). Sem norma por enquanto.
--  2. Empresas: o Laboratório também cadastra, altera e exclui (tela Cadastros).
--     O cadastro de usuários continua só com Gestor e DEV.
-- =============================================================================

begin;

-- 1. Ensaio novo -------------------------------------------------------------
alter table public.fichas_os add column if not exists ens_caract_material_asfaltico boolean not null default false;

insert into public.ensaios (nome, categoria, norma, ordem, ativo, codigo_frimob04)
select 'Caracterização de Material Asfáltico', 'Asfalto', null, 0, true, 'ens_caract_material_asfaltico'
 where not exists (select 1 from public.ensaios where codigo_frimob04 = 'ens_caract_material_asfaltico');

-- 2. Empresas: Laboratório e Gestor/DEV ---------------------------------------
drop policy if exists empresas_manage on public.empresas;
create policy empresas_manage on public.empresas for all to authenticated
  using (public.eh_lab()) with check (public.eh_lab());

notify pgrst, 'reload schema';

commit;

-- Fim da migração 18.
