-- =============================================================================
-- CNRO Lab Control — Migração 32: resultados liberados no Módulo Campo
-- =============================================================================
-- Pré-requisito: migrações 13 e 14. Rodar no SQL Editor ANTES de publicar o app. Idempotente.
-- Decisões de 21/10/2026:
--  • O inspetor vê, em "Meus pedidos", os ensaios dos pedidos que ELE abriu (tudo individual).
--  • Ensaio aprovado e liberado ao campo → resumo + ficha completa (leitura) + impressão.
--    Os demais → só o status. A liberação vale por ensaio (não precisa finalizar a O.S.).
--  • No banco: quem é só do Campo (sem Laboratório/Assistente/Gestor) passa a ler apenas
--      - os próprios pedidos;
--      - os ensaios/resultados dos próprios pedidos que estão APROVADOS e LIBERADOS;
--      - as assinaturas (imagens) de quem executou/aprovou esses ensaios (para a ficha impressa).
--    O status de todos os ensaios dos próprios pedidos vem pela função ensaios_status_campo().
--    Laboratório, Assistente, Gestor e DEV continuam lendo tudo (eh_equipe_lab).
--    O GestLab lê com a service role (não passa por RLS) — não muda.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Funções de apoio (security definer: sem recursão de RLS)
-- -----------------------------------------------------------------------------
create or replace function public._pedido_e_meu(p_pedido_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.pedidos_ensaio p
                  where p.id = p_pedido_id and p.solicitante_id = public.usuario_atual_id())
$$;

create or replace function public._ensaio_liberado_para_mim(p_ensaio_os_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1
                   from public.ensaios_os e
                   join public.pedidos_ensaio p on p.id = e.pedido_id
                  where e.id = p_ensaio_os_id
                    and e.status = 'aprovado' and coalesce(e.visivel_campo, false)
                    and p.solicitante_id = public.usuario_atual_id())
$$;

create or replace function public._resultado_liberado_para_mim(p_resultado_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1
                   from public.resultados r
                   join public.ensaios_os e on e.id = r.ensaio_os_id or e.resultado_id = r.id
                   join public.pedidos_ensaio p on p.id = e.pedido_id
                  where r.id = p_resultado_id
                    and e.status = 'aprovado' and coalesce(e.visivel_campo, false)
                    and p.solicitante_id = public.usuario_atual_id())
$$;

-- imagem de assinatura de quem executou/aprovou um ensaio liberado ao usuário
create or replace function public._assinatura_liberada_para_mim(p_caminho text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1
                   from public.ensaios_os e
                   join public.pedidos_ensaio p on p.id = e.pedido_id
                   join public.usuarios u on u.id in (e.assistente_id, e.aprovado_por_id,
                                                     (e.assinatura_executor ->> 'usuario_id')::uuid,
                                                     (e.assinatura_calculista ->> 'usuario_id')::uuid)
                  where e.status = 'aprovado' and coalesce(e.visivel_campo, false)
                    and p.solicitante_id = public.usuario_atual_id()
                    and u.assinatura_url = p_caminho)
$$;

-- -----------------------------------------------------------------------------
-- 2. Leitura (RLS)
-- -----------------------------------------------------------------------------
drop policy if exists pedidos_ensaio_select on public.pedidos_ensaio;
create policy pedidos_ensaio_select on public.pedidos_ensaio for select to authenticated
  using ((select public.eh_equipe_lab())
         or solicitante_id = (select public.usuario_atual_id()));

drop policy if exists ensaios_os_select on public.ensaios_os;
create policy ensaios_os_select on public.ensaios_os for select to authenticated
  using ((select public.eh_equipe_lab()) or public._ensaio_liberado_para_mim(id));

drop policy if exists resultados_select on public.resultados;
create policy resultados_select on public.resultados for select to authenticated
  using ((select public.eh_equipe_lab()) or public._resultado_liberado_para_mim(id));

do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
      join pg_tables pt on pt.schemaname = 'public' and pt.tablename = c.table_name
     where c.table_schema = 'public' and c.table_name like 'resultado\_%' and c.column_name = 'resultado_id'
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated
                    using ((select public.eh_equipe_lab()) or public._resultado_liberado_para_mim(resultado_id))',
                   t || '_select', t);
  end loop;
end $$;

drop policy if exists assinaturas_select on storage.objects;
create policy assinaturas_select on storage.objects for select to authenticated
  using (bucket_id = 'assinaturas'
         and (public.eh_equipe_lab() or public._assinatura_liberada_para_mim(name)));

-- -----------------------------------------------------------------------------
-- 3. Status dos ensaios dos meus pedidos (Campo) — sem os dados dos não liberados
-- -----------------------------------------------------------------------------
create or replace function public.ensaios_status_campo()
returns table (id uuid, pedido_id uuid, nome_ensaio text, status text, liberado boolean, aprovado_em timestamptz)
language sql stable security definer
set search_path = public
as $$
  select e.id, e.pedido_id, e.nome_ensaio, e.status,
         (e.status = 'aprovado' and coalesce(e.visivel_campo, false)) as liberado,
         case when e.status = 'aprovado' and coalesce(e.visivel_campo, false) then e.aprovado_em end
    from public.ensaios_os e
    join public.pedidos_ensaio p on p.id = e.pedido_id
   where p.solicitante_id = public.usuario_atual_id()
     and not coalesce(p.lancamento_historico, false)
   order by e.created_at
$$;

revoke all on function public.ensaios_status_campo() from public, anon;
grant execute on function public.ensaios_status_campo() to authenticated;

commit;
