-- =============================================================================
-- CNRO Lab Control — Migração 29: contagem soma as folhas adicionais da ficha
-- =============================================================================
-- Pré-requisito: migração 27 (e 28). Rodar no SQL Editor. Idempotente, transação única.
-- Decisão de 20/10/2026: quando o ensaio não cabe numa ficha (ex.: FR-IMOB-46 com mais de 21 CPs),
-- o assistente acrescenta folhas da mesma ficha — gravadas em dados_resultado.folhas_extras.
-- A view contagem_atividades passa a contar as unidades de todas as folhas.
-- Não muda dados: só recria a view (mesmas colunas).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- View
-- -----------------------------------------------------------------------------
-- Entradas de cada folha da ficha: a folha 1 (dados_resultado.entradas) e as folhas adicionais
-- (dados_resultado.folhas_extras[].entradas — 20/10/2026).
create or replace function public._contagem_folhas(p_dados jsonb)
returns table (entradas jsonb)
language sql immutable
as $$
  select coalesce(p_dados -> 'entradas', '{}'::jsonb)
  union all
  select coalesce(f -> 'entradas', '{}'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p_dados -> 'folhas_extras') = 'array'
                                   then p_dados -> 'folhas_extras' else '[]'::jsonb end) f
$$;

drop view if exists public.contagem_atividades;
create view public.contagem_atividades
with (security_invoker = true) as
with os as (
  select p.*
    from public.pedidos_ensaio p
   where p.numero_os is not null
     and p.status <> 'cancelado'
),
amostras as (
  select os.id as pedido_id, a
    from os, jsonb_array_elements(case when jsonb_typeof(os.dados_amostra) = 'array'
                                       then os.dados_amostra else '[]'::jsonb end) a
),
por_ficha as (
  -- cada folha da ficha (folha 1 + folhas_extras — 20/10/2026) conta; 'uma' vale 1 por ensaio
  select e.pedido_id, e.id as ensaio_os_id, e.status as status_ensaio,
         f.codigo as ficha, r.atividade, r.ordem,
         case
           when r.modo = 'uma' and jsonb_array_length(r.unidades) = 0 then
             case when e.status in ('aguardando_revisao', 'aprovado') then 1 else 0 end
           when r.modo = 'uma' then
             case when exists (select 1 from public._contagem_folhas(e.dados_resultado) fl,
                                             jsonb_array_elements(r.unidades) u
                                where public._contagem_preenchida(fl.entradas, u))
                  then 1 else 0 end
           else
             (select count(*)::int from public._contagem_folhas(e.dados_resultado) fl,
                                        jsonb_array_elements(r.unidades) u
               where public._contagem_preenchida(fl.entradas, u))
         end as quantidade
    from public.ensaios_os e
    join os on os.id = e.pedido_id
    join public.fichas_modelo m on m.id = e.ficha_modelo_id
    join public.fichas_ensaio f on f.id = m.ficha_ensaio_id
    join public.contagem_regras r on r.ficha_codigo = f.codigo
),
moldagem as (
  -- concreto: só os CPs moldados pela CNRO
  select am.pedido_id, null::uuid as ensaio_os_id, null::text as status_ensaio, null::text as ficha,
         'CP''s de concreto'::text as atividade, 1000 as ordem, count(*)::int as quantidade
    from amostras am
    join os on os.id = am.pedido_id
   where os.material = 'concreto'
     and coalesce(am.a ->> 'responsavel_moldagem', am.a -> 'info_geral' ->> 'responsavel_moldagem') = 'CNRO'
   group by am.pedido_id
  union all
  -- solo-cimento: sempre moldado no laboratório
  select am.pedido_id, null, null, null, 'CP''s solo cimento', 1001, count(*)::int
    from amostras am
    join os on os.id = am.pedido_id
   where os.sub_tipo = 'cps_solo_cimento'
   group by am.pedido_id
)
select os.id            as pedido_id,
       os.numero_os,
       os.empresa,
       os.empresa_id,
       os.lote,
       os.material,
       os.status        as status_pedido,
       os.aberto_em,
       os.finalizado_em,
       x.ensaio_os_id,
       x.status_ensaio,
       x.ficha,
       x.atividade,
       x.quantidade,
       x.ordem
  from (select * from por_ficha union all select * from moldagem) x
  join os on os.id = x.pedido_id
 where x.quantidade > 0;

comment on view public.contagem_atividades is
  'Contagem de ensaios por atividade (CP, determinação, ponto…) por O.S. — migração 27, regras em contagem_regras.';

grant select on public.contagem_atividades to authenticated;

commit;
