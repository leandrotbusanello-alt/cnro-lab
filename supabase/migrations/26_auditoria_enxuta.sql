-- =============================================================================
-- CNRO Lab Control — Migração 26: auditoria enxuta + painel de uso do banco
-- =============================================================================
-- Pré-requisito: migração 14. Rodar no SQL Editor. Idempotente, transação única.
--
-- Motivo (19/10/2026): a auditoria (audit_log) ocupava 2/3 dos dados do banco. Cada
-- salvamento automático do rascunho (a cada 20 s enquanto a ficha está sendo digitada) e
-- cada linha nova no histórico do pedido gravavam DUAS cópias completas do registro.
--
-- O que muda em public.tg_auditoria():
--   1. Rascunho não é mais auditado: em ensaios_os, um UPDATE que só troca
--      dados_resultado/rascunho_em (status continua 'em_andamento') é ignorado.
--      Continuam auditados: iniciar, enviar para revisão, aprovar, devolver, troca de
--      ficha, atribuição, correções na revisão etc.
--   2. Linha nova no histórico do pedido não é mais auditada: o próprio
--      pedidos_ensaio.historico já é o registro dessa movimentação.
--   3. UPDATE grava só o que mudou: dados_antes/dados_depois passam a ter apenas as
--      colunas alteradas (sem updated_at e sem historico). INSERT e DELETE continuam
--      com a cópia completa do registro (inclusive o preenchimento antigo da ficha em
--      exclusões e trocas de ficha).
--
-- Novo: public.painel_uso_banco() — conferência mensal do espaço (ver LEIA-ME_ENTREGA_26).
--   No SQL Editor:  select * from public.painel_uso_banco();
--   Só roda pelo SQL Editor (não fica disponível para os usuários do sistema).
-- =============================================================================

begin;

create or replace function public.tg_auditoria()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid     uuid := public.usuario_real_id();
  v_ator    uuid := public.usuario_atual_id();
  v_nome    text;
  v_nome_de uuid := case when v_ator is distinct from v_uid then v_ator end;
  v_old     jsonb;
  v_new     jsonb;
  v_antes   jsonb;
  v_depois  jsonb;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);

    -- 1. Rascunho automático da ficha (salvar_rascunho_ensaio): não audita.
    if tg_table_name = 'ensaios_os'
       and v_new->>'status' = 'em_andamento'
       and v_old->>'status' = 'em_andamento'
       and (v_new->'rascunho_em') is distinct from (v_old->'rascunho_em')
       and (v_new - array['dados_resultado','rascunho_em','updated_at'])
         = (v_old - array['dados_resultado','rascunho_em','updated_at']) then
      return new;
    end if;

    -- 3. Só as colunas alteradas (sem updated_at / historico).
    select jsonb_object_agg(n.key, v_old->n.key), jsonb_object_agg(n.key, n.value)
      into v_antes, v_depois
      from jsonb_each(v_new) n
     where n.key not in ('updated_at', 'historico')
       and n.value is distinct from v_old->n.key;

    -- 2. Nada além de updated_at/historico mudou: não audita.
    if v_depois is null then return new; end if;
  end if;

  select nome into v_nome from public.usuarios where id = v_uid;

  if tg_op = 'DELETE' then
    insert into public.audit_log (tabela, registro_id, acao, usuario_id, usuario_nome, dados_antes, em_nome_de)
    values (tg_table_name, old.id, tg_op, v_uid, v_nome, to_jsonb(old), v_nome_de);
    return old;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (tabela, registro_id, acao, usuario_id, usuario_nome, dados_antes, dados_depois, em_nome_de)
    values (tg_table_name, new.id, tg_op, v_uid, v_nome, v_antes, v_depois, v_nome_de);
    return new;
  else
    insert into public.audit_log (tabela, registro_id, acao, usuario_id, usuario_nome, dados_depois, em_nome_de)
    values (tg_table_name, new.id, tg_op, v_uid, v_nome, to_jsonb(new), v_nome_de);
    return new;
  end if;
end $$;

comment on column public.audit_log.dados_antes is
  'INSERT: nulo. DELETE: registro completo. UPDATE (a partir da migração 26): só as colunas alteradas (valor anterior).';
comment on column public.audit_log.dados_depois is
  'INSERT: registro completo. DELETE: nulo. UPDATE (a partir da migração 26): só as colunas alteradas (valor novo).';

-- -----------------------------------------------------------------------------
-- Painel de uso do banco (conferência mensal)
-- -----------------------------------------------------------------------------
create or replace function public.painel_uso_banco()
returns table (secao text, item text, valor text, detalhe text)
language plpgsql security definer
set search_path = public
as $$
declare
  v_db   bigint := pg_database_size(current_database());
  v_lim  bigint := 500::bigint * 1024 * 1024;   -- plano Free: 500 MB
  v_n    bigint;
  r      record;
begin
  return query
  select '1. Banco'::text, 'Tamanho total'::text, pg_size_pretty(v_db),
         round(100.0 * v_db / v_lim, 1)::text || '% do limite do plano Free (500 MB)';

  for r in
    select c.oid, c.relname
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
     where c.relkind = 'r'
     order by pg_total_relation_size(c.oid) desc
     limit 8
  loop
    execute format('select count(*) from public.%I', r.relname) into v_n;
    secao := '2. Tabelas'; item := r.relname::text;
    valor := pg_size_pretty(pg_total_relation_size(r.oid)); detalhe := v_n::text || ' linhas';
    return next;
  end loop;

  return query
  select '3. Auditoria por dia (últimos 30 dias)'::text, to_char(d.mes, 'YYYY-MM-DD'),
         pg_size_pretty(d.bytes), d.n::text || ' registros'
    from (select date_trunc('day', a.created_at) as mes, count(*) as n,
                 sum(pg_column_size(a.*))::bigint as bytes
            from public.audit_log a
           where a.created_at >= now() - interval '30 days'
           group by 1) d
   order by d.mes desc;

  return query
  select '4. Movimento por mês'::text, to_char(m.mes, 'YYYY-MM'),
         m.n::text || ' pedidos',
         (select count(*) from public.ensaios_os e
           where date_trunc('month', e.created_at) = m.mes)::text || ' ensaios'
    from (select date_trunc('month', p.created_at) as mes, count(*) as n
            from public.pedidos_ensaio p group by 1) m
   order by m.mes desc
   limit 6;

  if exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'objects' and column_name = 'metadata') then
    return query execute $q$
      select '5. Arquivos (Storage)'::text, o.bucket_id::text,
             pg_size_pretty(coalesce(sum((o.metadata->>'size')::bigint), 0)),
             count(*)::text || ' arquivos — limite Free: 1 GB no total'
        from storage.objects o
       group by o.bucket_id
       order by sum((o.metadata->>'size')::bigint) desc nulls last $q$;
  end if;
end $$;

revoke all on function public.painel_uso_banco() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.painel_uso_banco() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.painel_uso_banco() from authenticated';
  end if;
end $$;

commit;
