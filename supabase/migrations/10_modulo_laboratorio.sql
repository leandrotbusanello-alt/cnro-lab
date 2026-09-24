-- =============================================================================
-- CNRO Lab Control — Migração 10: Módulo Laboratório
-- =============================================================================
-- Rodar no SQL Editor do Supabase (projeto xydmajjwfnfvzwlugzlk).
-- Idempotente: pode ser executada mais de uma vez sem efeito colateral.
-- Tudo roda numa única transação: se algo falhar, nada é aplicado.
--
-- Conteúdo
--   0. Funções auxiliares (usuário atual, perfil)
--   1. Colunas novas (pedidos_ensaio, ensaios_os)
--   2. Normalização de status + CHECK
--   3. Numeração automática do PE (sequencial global por ano)
--   4. Preenchimento de empresa/lote a partir de empresa_id
--   5. Guardas (O.S. finalizada bloqueada, numeração protegida, regras do assistente)
--   6. Status do pedido derivado dos ensaios + sincronização com `resultados`
--   7. Auditoria automática (audit_log)
--   8. Observação padrão da O.S. (gerar_observacao_os reescrita)
--   9. RPCs do laboratório (assumir, histórico, gerar O.S., transferir, finalizar)
--  10. RLS (segurança)
--  11. Storage: bucket privado `assinaturas`
--  12. Realtime
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Funções auxiliares
-- -----------------------------------------------------------------------------
-- O vínculo com o login é usuarios.auth_id. Por tolerância, aceita também
-- usuarios.id = auth.uid() (caso algum usuário tenha sido criado assim).
-- Usuários com status 'Inativo' não são reconhecidos (perdem o acesso).

create or replace function public.usuario_atual_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select u.id
    from public.usuarios u
   where (u.auth_id = auth.uid() or u.id = auth.uid())
     and coalesce(u.status, 'Ativo') = 'Ativo'
   order by (u.auth_id = auth.uid()) desc nulls last
   limit 1
$$;

create or replace function public.usuario_atual_perfil()
returns text
language sql stable security definer
set search_path = public
as $$
  select upper(u.perfil) from public.usuarios u where u.id = public.usuario_atual_id()
$$;

create or replace function public.eh_gestor()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.usuario_atual_perfil() in ('DEV','GESTOR'), false)
$$;

create or replace function public.eh_lab()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.usuario_atual_perfil() in ('DEV','GESTOR','LAB'), false)
$$;

create or replace function public.eh_equipe_lab()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.usuario_atual_perfil() in ('DEV','GESTOR','LAB','ASSIST'), false)
$$;

-- Evento padrão do histórico (quem, quando)
create or replace function public._evento(p_acao text, p_extra jsonb default '{}'::jsonb)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
           'acao', p_acao,
           'usuario_id', public.usuario_atual_id(),
           'usuario', (select nome from public.usuarios where id = public.usuario_atual_id()),
           'data', now()
         ) || coalesce(p_extra, '{}'::jsonb)
$$;

-- dados_amostra → sempre um array de amostras.
-- Aceita: array (formato atual do Campo), {amostras:[...]}, {cabecario:{...}} (legado).
create or replace function public._amostras(p_dados jsonb)
returns jsonb
language sql immutable
as $$
  select case
    when p_dados is null then '[]'::jsonb
    when jsonb_typeof(p_dados) = 'array' then p_dados
    when jsonb_typeof(p_dados->'amostras') = 'array' then p_dados->'amostras'
    when jsonb_typeof(p_dados->'cabecario') = 'object' then jsonb_build_array(p_dados->'cabecario')
    when jsonb_typeof(p_dados) = 'object' and p_dados <> '{}'::jsonb then jsonb_build_array(p_dados)
    else '[]'::jsonb
  end
$$;

-- -----------------------------------------------------------------------------
-- 1. Colunas novas
-- -----------------------------------------------------------------------------
alter table public.pedidos_ensaio
  add column if not exists laboratorista_id uuid references public.usuarios(id),
  add column if not exists assumido_em      timestamptz,
  add column if not exists data_validacao   date,
  add column if not exists offline_id       text,
  add column if not exists empresa_id       uuid references public.empresas(id);

create unique index if not exists pedidos_ensaio_offline_id_uq
  on public.pedidos_ensaio (offline_id) where offline_id is not null;
create index if not exists pedidos_ensaio_status_idx        on public.pedidos_ensaio (status);
create index if not exists pedidos_ensaio_laboratorista_idx on public.pedidos_ensaio (laboratorista_id);

alter table public.ensaios_os
  add column if not exists updated_at      timestamptz not null default now(),
  add column if not exists aprovado_por_id uuid references public.usuarios(id),
  add column if not exists aprovado_em     timestamptz;

create index if not exists ensaios_os_pedido_idx     on public.ensaios_os (pedido_id);
create index if not exists ensaios_os_assistente_idx on public.ensaios_os (assistente_id);

-- Um mesmo ensaio só aparece uma vez por pedido (se ainda não houver índice equivalente)
do $$
begin
  if not exists (
    select 1
      from pg_index i
      join pg_class c on c.oid = i.indrelid
     where c.relname = 'ensaios_os' and i.indisunique
       and (select array_agg(a.attname::text order by a.attname)
              from pg_attribute a
             where a.attrelid = c.oid and a.attnum = any(i.indkey)) = array['ensaio_id','pedido_id']
  ) then
    if exists (select 1 from public.ensaios_os group by pedido_id, ensaio_id having count(*) > 1) then
      raise notice 'ensaios_os possui duplicidades (pedido_id, ensaio_id): índice único NÃO criado.';
    else
      create unique index ensaios_os_pedido_ensaio_uq on public.ensaios_os (pedido_id, ensaio_id);
    end if;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Normalização de status + CHECK
-- -----------------------------------------------------------------------------
-- Pedido:  aguardando_lab → em_analise → em_andamento → aguardando_revisao → concluido
--          + devolvido_campo, cancelado
-- Ensaio:  pendente → em_andamento → aguardando_revisao → aprovado  (+ devolvido)
--
-- Nomes alternativos usados por versões anteriores do app são convertidos
-- automaticamente (ex.: 'aguardando_analise' → 'aguardando_lab').

create or replace function public._normalizar_status_pedido(p text)
returns text language sql immutable as $$
  select case p
    when 'aguardando_analise'   then 'aguardando_lab'
    when 'devolvido'            then 'devolvido_campo'
    when 'devolvido_assist'     then 'em_andamento'
    when 'devolvido_assistente' then 'em_andamento'
    when 'pendente_sync'        then 'aguardando_lab'
    else p end
$$;

create or replace function public._normalizar_status_ensaio(p text)
returns text language sql immutable as $$
  select case p
    when 'aguardando'           then 'pendente'
    when 'em_execucao'          then 'em_andamento'
    when 'concluido'            then 'aguardando_revisao'
    when 'devolvido_assist'     then 'devolvido'
    when 'devolvido_assistente' then 'devolvido'
    else p end
$$;

update public.pedidos_ensaio
   set status = public._normalizar_status_pedido(status)
 where status is distinct from public._normalizar_status_pedido(status);

update public.ensaios_os
   set status = public._normalizar_status_ensaio(status)
 where status is distinct from public._normalizar_status_ensaio(status);

alter table public.pedidos_ensaio drop constraint if exists pedidos_ensaio_status_check;
alter table public.pedidos_ensaio add constraint pedidos_ensaio_status_check
  check (status in ('aguardando_lab','em_analise','em_andamento','aguardando_revisao',
                    'concluido','devolvido_campo','cancelado')) not valid;

alter table public.ensaios_os drop constraint if exists ensaios_os_status_check;
alter table public.ensaios_os add constraint ensaios_os_status_check
  check (status in ('pendente','em_andamento','aguardando_revisao','aprovado','devolvido')) not valid;

create or replace function public.tg_pedido_normalizar()
returns trigger language plpgsql as $$
begin
  new.status := public._normalizar_status_pedido(coalesce(new.status, 'aguardando_lab'));
  return new;
end $$;

drop trigger if exists a10_pedido_normalizar on public.pedidos_ensaio;
create trigger a10_pedido_normalizar
  before insert or update on public.pedidos_ensaio
  for each row execute function public.tg_pedido_normalizar();

-- -----------------------------------------------------------------------------
-- 3. Numeração automática do PE
-- -----------------------------------------------------------------------------
-- numero_pe  = '0047' (texto com 4 dígitos)  → exibido como PE-2026-0047
-- sequencial = 47  |  ano = 2026
-- Sempre atribuída pelo banco no INSERT (valores enviados pelo app são ignorados).
-- Pedidos criados offline recebem o próximo número no momento da sincronização.

create table if not exists public.contadores_pedido (
  ano    integer primary key,
  ultimo integer not null default 0
);
alter table public.contadores_pedido enable row level security;  -- sem policies: só via funções

create or replace function public.tg_pedido_numero_pe()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_ano integer := extract(year from (coalesce(new.created_at, now()) at time zone 'America/Cuiaba'))::int;
  v_seq integer;
begin
  insert into public.contadores_pedido as c (ano, ultimo) values (v_ano, 1)
  on conflict (ano) do update set ultimo = c.ultimo + 1
  returning ultimo into v_seq;

  new.ano        := v_ano;
  new.sequencial := v_seq;
  new.numero_pe  := lpad(v_seq::text, 4, '0');
  return new;
end $$;

drop trigger if exists a20_pedido_numero_pe on public.pedidos_ensaio;
create trigger a20_pedido_numero_pe
  before insert on public.pedidos_ensaio
  for each row execute function public.tg_pedido_numero_pe();

-- Contador inicia a partir do maior sequencial já existente
insert into public.contadores_pedido (ano, ultimo)
select ano, max(sequencial) from public.pedidos_ensaio
 where ano is not null and sequencial is not null
 group by ano
on conflict (ano) do update
  set ultimo = greatest(public.contadores_pedido.ultimo, excluded.ultimo);

-- Pedidos antigos sem número recebem numeração (ordem de criação)
do $$
declare r record; v_seq integer; v_ano integer;
begin
  for r in select id, created_at from public.pedidos_ensaio where sequencial is null order by created_at loop
    v_ano := extract(year from (coalesce(r.created_at, now()) at time zone 'America/Cuiaba'))::int;
    insert into public.contadores_pedido as c (ano, ultimo) values (v_ano, 1)
    on conflict (ano) do update set ultimo = c.ultimo + 1
    returning ultimo into v_seq;
    update public.pedidos_ensaio
       set ano = v_ano, sequencial = v_seq, numero_pe = lpad(v_seq::text, 4, '0')
     where id = r.id;
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_indexes where indexname = 'pedidos_ensaio_ano_seq_uq') then
    if exists (select 1 from public.pedidos_ensaio where sequencial is not null
                group by ano, sequencial having count(*) > 1) then
      raise notice 'pedidos_ensaio possui (ano, sequencial) duplicados: índice único NÃO criado.';
    else
      create unique index pedidos_ensaio_ano_seq_uq on public.pedidos_ensaio (ano, sequencial);
    end if;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. empresa / lote a partir de empresa_id
-- -----------------------------------------------------------------------------
create or replace function public.tg_pedido_empresa()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare v_emp record;
begin
  if new.empresa_id is not null
     and (tg_op = 'INSERT' or new.empresa_id is distinct from old.empresa_id) then
    select nome, lote into v_emp from public.empresas where id = new.empresa_id;
    if found then
      new.empresa := v_emp.nome;
      if coalesce(trim(new.lote), '') = '' then new.lote := v_emp.lote; end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists a15_pedido_empresa on public.pedidos_ensaio;
create trigger a15_pedido_empresa
  before insert or update on public.pedidos_ensaio
  for each row execute function public.tg_pedido_empresa();

-- -----------------------------------------------------------------------------
-- 5. Guardas
-- -----------------------------------------------------------------------------
create or replace function public.tg_pedido_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;  -- SQL Editor / service_role (manutenção)
  if not public.eh_gestor() then
    -- O.S. finalizada é imutável (só Gestor/Dev reabrem)
    if old.status = 'concluido' then
      raise exception 'O.S. finalizada: somente o Gestor pode reabrir.' using errcode = 'P0001';
    end if;
    -- Finalizar apenas pela função finalizar_os (que valida os ensaios)
    if new.status = 'concluido' and coalesce(current_setting('cnro.finalizando', true), '') <> 'on' then
      raise exception 'Use a ação "Finalizar O.S." para concluir.' using errcode = 'P0001';
    end if;
    -- Numeração não pode ser alterada pelo app
    new.numero_pe  := old.numero_pe;
    new.sequencial := old.sequencial;
    new.ano        := old.ano;
  end if;
  return new;
end $$;

drop trigger if exists a30_pedido_guard on public.pedidos_ensaio;
create trigger a30_pedido_guard
  before update on public.pedidos_ensaio
  for each row execute function public.tg_pedido_guard();

-- Ensaios da O.S.
create or replace function public.tg_ensaio_os_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_ped public.pedidos_ensaio;
  v_eh_resp boolean;
begin
  select * into v_ped from public.pedidos_ensaio
   where id = case when tg_op = 'DELETE' then old.pedido_id else new.pedido_id end;

  if auth.uid() is null then   -- SQL Editor / service_role (manutenção)
    if tg_op = 'DELETE' then return old; end if;
    new.status := public._normalizar_status_ensaio(coalesce(new.status, 'pendente'));
    return new;
  end if;

  if v_ped.status = 'concluido' and not public.eh_gestor() then
    raise exception 'O.S. finalizada: somente o Gestor pode reabrir.' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; end if;

  new.status := public._normalizar_status_ensaio(coalesce(new.status, 'pendente'));

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    v_eh_resp := public.eh_gestor() or v_ped.laboratorista_id = public.usuario_atual_id();
    if not v_eh_resp then
      -- Assistente: só executa o próprio ensaio e envia para revisão
      if new.pedido_id        is distinct from old.pedido_id
         or new.ensaio_id       is distinct from old.ensaio_id
         or new.assistente_id   is distinct from old.assistente_id
         or new.ficha_ensaio_id is distinct from old.ficha_ensaio_id
         or new.visivel_campo   is distinct from old.visivel_campo
         or new.aprovado_por_id is distinct from old.aprovado_por_id
         or new.aprovado_em     is distinct from old.aprovado_em then
        raise exception 'Somente o laboratorista responsável pela O.S. pode alterar atribuição, aprovação ou visibilidade.'
          using errcode = 'P0001';
      end if;
      if new.status is distinct from old.status
         and new.status not in ('em_andamento','aguardando_revisao') then
        raise exception 'Status "%" só pode ser definido pelo laboratorista responsável.', new.status
          using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists a30_ensaio_os_guard on public.ensaios_os;
create trigger a30_ensaio_os_guard
  before insert or update or delete on public.ensaios_os
  for each row execute function public.tg_ensaio_os_guard();

-- Usuários: ninguém altera o próprio perfil/status/vínculo (só Gestor/Dev)
create or replace function public.tg_usuario_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;  -- SQL Editor / service_role
  if not public.eh_gestor() then
    if new.perfil  is distinct from old.perfil
       or new.status  is distinct from old.status
       or new.auth_id is distinct from old.auth_id
       or new.email   is distinct from old.email then
      raise exception 'Somente o Gestor pode alterar perfil, status, e-mail ou vínculo de login.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists a30_usuario_guard on public.usuarios;
create trigger a30_usuario_guard
  before update on public.usuarios
  for each row execute function public.tg_usuario_guard();

-- -----------------------------------------------------------------------------
-- 6. Status do pedido derivado dos ensaios + tabela resultados
-- -----------------------------------------------------------------------------
create or replace function public.tg_ensaio_os_apos()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_pid   uuid := case when tg_op = 'DELETE' then old.pedido_id else new.pedido_id end;
  v_atual text;
  v_novo  text;
begin
  -- Pedido: 'aguardando_revisao' enquanto houver ensaio aguardando revisão
  select status into v_atual from public.pedidos_ensaio where id = v_pid;
  if v_atual in ('em_andamento','aguardando_revisao') then
    v_novo := case when exists (select 1 from public.ensaios_os
                                 where pedido_id = v_pid and status = 'aguardando_revisao')
                   then 'aguardando_revisao' else 'em_andamento' end;
    if v_novo <> v_atual then
      update public.pedidos_ensaio set status = v_novo where id = v_pid;
    end if;
  end if;

  -- resultados acompanha a aprovação/devolução
  if tg_op = 'UPDATE' and new.resultado_id is not null and new.status is distinct from old.status then
    if new.status = 'aprovado' then
      update public.resultados
         set status = 'aprovado', laboratorista_id = new.aprovado_por_id, data_revisao = current_date
       where id = new.resultado_id;
    elsif new.status = 'devolvido' then
      update public.resultados set status = 'em_execucao' where id = new.resultado_id;
    end if;
  end if;

  return null;
end $$;

drop trigger if exists z10_ensaio_os_apos on public.ensaios_os;
create trigger z10_ensaio_os_apos
  after insert or update or delete on public.ensaios_os
  for each row execute function public.tg_ensaio_os_apos();

-- -----------------------------------------------------------------------------
-- 7. Auditoria automática
-- -----------------------------------------------------------------------------
create or replace function public.tg_auditoria()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid  uuid := public.usuario_atual_id();
  v_nome text;
begin
  select nome into v_nome from public.usuarios where id = v_uid;
  if tg_op = 'DELETE' then
    insert into public.audit_log (tabela, registro_id, acao, usuario_id, usuario_nome, dados_antes)
    values (tg_table_name, old.id, tg_op, v_uid, v_nome, to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    if to_jsonb(new) - 'updated_at' = to_jsonb(old) - 'updated_at' then return new; end if;
    insert into public.audit_log (tabela, registro_id, acao, usuario_id, usuario_nome, dados_antes, dados_depois)
    values (tg_table_name, new.id, tg_op, v_uid, v_nome, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.audit_log (tabela, registro_id, acao, usuario_id, usuario_nome, dados_depois)
    values (tg_table_name, new.id, tg_op, v_uid, v_nome, to_jsonb(new));
    return new;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['pedidos_ensaio','ensaios_os','resultados','fichas_os','fichas_solicitacao','usuarios'] loop
    execute format('drop trigger if exists z90_auditoria on public.%I', t);
    execute format('create trigger z90_auditoria after insert or update or delete on public.%I
                    for each row execute function public.tg_auditoria()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 8. Observação padrão da O.S.
-- -----------------------------------------------------------------------------
create or replace function public.gerar_observacao_os(p_pedido_id uuid)
returns text
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_p     public.pedidos_ensaio;
  v_am    jsonb;
  v_emp   text;
  v_lote  text;
  v_reg   text;
begin
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id;
  if not found then return null; end if;

  v_am   := coalesce(public._amostras(v_p.dados_amostra)->0, '{}'::jsonb);
  v_emp  := coalesce(v_p.empresa, (select nome from public.empresas where id = v_p.empresa_id), '---');
  v_lote := coalesce(v_p.lote, '---');
  v_reg  := '. REGISTRADOS COM N° ' || lpad(coalesce(v_p.sequencial, 0)::text, 4, '0')
            || '/' || coalesce(v_p.ano::text, extract(year from v_p.created_at)::text) || '.';

  return case
    when v_p.sub_tipo in ('cps_extraidos_pista','cp_pista') then
      'FORAM EXTRAÍDOS PELA EQUIPE DO LABORATÓRIO CNRO CORPOS DE PROVA (CPs) DE C.A.U.Q. PROVENIENTES DA ESTACA '
      || coalesce(v_am->>'estaca_extracao', v_am->>'cpp_km_ini', '---')
      || ' — ' || v_emp || ' / LOTE ' || v_lote || v_reg
    when v_p.sub_tipo in ('jazida','caixa_emprestimo') then
      'FOI ENTREGUE AO LABORATÓRIO AMOSTRA DE SOLO PARA A CARACTERIZAÇÃO COMPLETA. MATERIAL PROVENIENTE DA '
      || upper(coalesce(v_am->>'jazida', v_am->>'jazida_nome', 'JAZIDA'))
      || ' / LOTE ' || v_lote || v_reg
    when v_p.sub_tipo in ('concreto','cp_concreto') then
      'FORAM ENTREGUES AO LABORATÓRIO CORPOS DE PROVA DE CONCRETO. CORPOS DE PROVA PROVENIENTES DO CONSÓRCIO '
      || v_emp || ' / LOTE ' || v_lote || v_reg
    when v_p.sub_tipo in ('massa_asfaltica','massa') then
      'FOI COLETADA AMOSTRA DE MASSA ASFÁLTICA PARA ENSAIOS DE CONTROLE. MATERIAL PROVENIENTE DO CONSÓRCIO '
      || v_emp || ' / LOTE ' || v_lote || v_reg
    when v_p.sub_tipo = 'agregados' then
      'FOI ENTREGUE AO LABORATÓRIO AMOSTRA DE AGREGADO PARA CARACTERIZAÇÃO. MATERIAL PROVENIENTE DA PEDREIRA: '
      || upper(coalesce(v_am->>'origem', v_am->>'agr_pedreira', '---'))
      || '. CONSÓRCIO ' || v_emp || ' / LOTE ' || v_lote || v_reg
    else
      'MATERIAL RECEBIDO NO LABORATÓRIO CNRO. PROVENIENTE DO CONSÓRCIO '
      || v_emp || ' / LOTE ' || v_lote || v_reg
  end;
end $$;

-- -----------------------------------------------------------------------------
-- 9. RPCs do laboratório
-- -----------------------------------------------------------------------------

-- 9.1 Assumir pedido (o laboratorista vira responsável; atômico)
create or replace function public.assumir_pedido(p_pedido_id uuid)
returns public.pedidos_ensaio
language plpgsql security definer
set search_path = public
as $$
declare
  v_me   uuid := public.usuario_atual_id();
  v_p    public.pedidos_ensaio;
  v_nome text;
begin
  if not public.eh_lab() then
    raise exception 'Apenas laboratoristas podem assumir pedidos.' using errcode = 'P0001';
  end if;

  select * into v_p from public.pedidos_ensaio where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;

  if v_p.laboratorista_id is not null and v_p.laboratorista_id <> v_me then
    select nome into v_nome from public.usuarios where id = v_p.laboratorista_id;
    raise exception 'Pedido já assumido por %.', coalesce(v_nome, 'outro laboratorista')
      using errcode = 'P0001';
  end if;
  if v_p.status in ('concluido','cancelado') then
    raise exception 'Pedido % não pode ser assumido.', v_p.status using errcode = 'P0001';
  end if;

  if v_p.laboratorista_id = v_me and v_p.status <> 'aguardando_lab' then
    return v_p;   -- já é o responsável (idempotente)
  end if;

  update public.pedidos_ensaio
     set laboratorista_id = v_me,
         assumido_em      = coalesce(assumido_em, now()),
         aberto_por       = coalesce(aberto_por, v_me),
         aberto_em        = coalesce(aberto_em, now()),
         status           = case when status = 'aguardando_lab' then 'em_analise' else status end,
         historico        = coalesce(historico, '[]'::jsonb) || jsonb_build_array(
                              public._evento(case when v_p.laboratorista_id is null
                                                  then 'Pedido assumido' else 'Análise retomada' end))
   where id = p_pedido_id
  returning * into v_p;

  return v_p;
end $$;

-- 9.2 Registrar evento no histórico (append atômico)
create or replace function public.adicionar_historico(p_pedido_id uuid, p_evento jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_p public.pedidos_ensaio;
begin
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if not (public.eh_gestor()
          or v_p.laboratorista_id = public.usuario_atual_id()
          or v_p.solicitante_id  = public.usuario_atual_id()
          or exists (select 1 from public.ensaios_os
                      where pedido_id = p_pedido_id and assistente_id = public.usuario_atual_id())) then
    raise exception 'Sem permissão para registrar histórico neste pedido.' using errcode = 'P0001';
  end if;

  update public.pedidos_ensaio
     set historico = coalesce(historico, '[]'::jsonb) || jsonb_build_array(
           public._evento(coalesce(p_evento->>'acao', 'Evento'), p_evento - 'acao' - 'usuario' - 'usuario_id')
           || case when p_evento ? 'data' then jsonb_build_object('data', p_evento->'data') else '{}'::jsonb end)
   where id = p_pedido_id;
end $$;

-- 9.3 Validar pedido e gerar O.S.
--   Número: AAAA.MM.DD.LL.SSSS (data da validação . lote . sequencial do PE)
--   Cria as linhas de ensaios_os e as fichas FR-IMOB-04 / FR-IMOB-05.
--   Idempotente: se a O.S. definitiva já existe, apenas retorna o pedido.
create or replace function public.gerar_os(p_pedido_id uuid, p_data date default null, p_lote text default null)
returns public.pedidos_ensaio
language plpgsql security definer
set search_path = public
as $$
declare
  v_me       uuid := public.usuario_atual_id();
  v_p        public.pedidos_ensaio;
  v_lote     text;
  v_lote_num text;
  v_data     date;
  v_num      text;
  v_sol      text;
  v_obra     text;
  v_ficha_os uuid;
  v_ficha_sl uuid;
begin
  if not public.eh_lab() then
    raise exception 'Apenas laboratoristas podem gerar O.S.' using errcode = 'P0001';
  end if;

  select * into v_p from public.pedidos_ensaio where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;

  if v_p.laboratorista_id is not null and v_p.laboratorista_id <> v_me and not public.eh_gestor() then
    raise exception 'Somente o laboratorista responsável pode gerar a O.S.' using errcode = 'P0001';
  end if;

  if v_p.numero_os is not null and v_p.numero_os not like 'PROV-%' then
    return v_p;   -- já gerada
  end if;

  if v_p.status not in ('aguardando_lab','em_analise') then
    raise exception 'Não é possível gerar O.S. com o pedido em "%".', v_p.status using errcode = 'P0001';
  end if;

  v_lote := coalesce(nullif(trim(p_lote), ''), nullif(trim(v_p.lote), ''));
  if v_lote is null then
    raise exception 'Informe o lote para gerar a O.S.' using errcode = 'P0001';
  end if;
  v_lote_num := regexp_replace(v_lote, '\D', '', 'g');
  if v_lote_num = '' then
    raise exception 'O lote "%" não contém número.', v_lote using errcode = 'P0001';
  end if;
  if coalesce(array_length(v_p.ensaios_ids, 1), 0) = 0 then
    raise exception 'O pedido não possui ensaios.' using errcode = 'P0001';
  end if;

  v_data := coalesce(p_data, (now() at time zone 'America/Cuiaba')::date);
  v_num  := to_char(v_data, 'YYYY.MM.DD') || '.' || lpad(v_lote_num, 2, '0') || '.'
            || lpad(v_p.sequencial::text, 4, '0');

  -- Ensaios da O.S. (um por ensaio solicitado)
  insert into public.ensaios_os (pedido_id, ensaio_id, nome_ensaio, status)
  select v_p.id, e.id, e.nome, 'pendente'
    from public.ensaios e
   where e.id::text = any(v_p.ensaios_ids)
     and not exists (select 1 from public.ensaios_os x where x.pedido_id = v_p.id and x.ensaio_id = e.id);

  -- Dados para as fichas
  select nome into v_sol from public.usuarios where id = v_p.solicitante_id;
  select rodovia into v_obra from public.empresas
   where id = v_p.empresa_id or (v_p.empresa_id is null and nome = v_p.empresa)
   limit 1;

  update public.pedidos_ensaio set lote = v_lote where id = v_p.id;  -- observação usa o lote final

  -- FR-IMOB-05 — Solicitação de Ensaios
  v_ficha_sl := v_p.ficha_sol_id;
  if v_ficha_sl is null then
    insert into public.fichas_solicitacao (pedido_id, obra, lote, solicitante, localizacoes, observacao, status, criado_por)
    values (
      v_p.id, v_obra, v_lote, v_sol,
      (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                'estaca',       coalesce(a->>'estaca_inicial', a->>'estaca_extracao', a->>'estaca'),
                'estaca_final', a->>'estaca_final',
                'pista',        a->>'pista',
                'faixa',        a->>'faixa',
                'lado',         a->>'lado',
                'camada',       a->>'camada'))), '[]'::jsonb)
         from jsonb_array_elements(public._amostras(v_p.dados_amostra)) a),
      v_p.observacoes, 'emitida', v_me)
    returning id into v_ficha_sl;
  end if;

  -- FR-IMOB-04 — Ordem de Serviço
  v_ficha_os := v_p.ficha_os_id;
  if v_ficha_os is null then
    insert into public.fichas_os (pedido_id, numero_os, data_solicitacao, obra, lote, solicitante,
                                  observacao, status, criado_por)
    values (v_p.id, v_num, (v_p.created_at at time zone 'America/Cuiaba')::date, v_obra, v_lote, v_sol,
            public.gerar_observacao_os(v_p.id), 'emitida', v_me)
    returning id into v_ficha_os;
  else
    update public.fichas_os set numero_os = v_num where id = v_ficha_os;
  end if;

  update public.pedidos_ensaio
     set numero_os        = v_num,
         data_validacao   = v_data,
         status           = 'em_andamento',
         laboratorista_id = coalesce(laboratorista_id, v_me),
         assumido_em      = coalesce(assumido_em, now()),
         aberto_por       = coalesce(aberto_por, v_me),
         aberto_em        = coalesce(aberto_em, now()),
         ficha_os_id      = v_ficha_os,
         ficha_sol_id     = v_ficha_sl,
         motivo_devolucao = null,
         historico        = coalesce(historico, '[]'::jsonb) || jsonb_build_array(
                              public._evento('O.S. gerada', jsonb_build_object(
                                'numero_os', v_num,
                                'provisorio', v_p.numero_os)))
   where id = v_p.id
  returning * into v_p;

  return v_p;
end $$;

-- 9.4 Transferir O.S. para outro laboratorista
create or replace function public.transferir_os(p_pedido_id uuid, p_para uuid, p_motivo text default null)
returns public.pedidos_ensaio
language plpgsql security definer
set search_path = public
as $$
declare
  v_me   uuid := public.usuario_atual_id();
  v_p    public.pedidos_ensaio;
  v_dest public.usuarios;
begin
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if not (public.eh_gestor() or v_p.laboratorista_id = v_me) then
    raise exception 'Somente o responsável (ou o Gestor) pode transferir.' using errcode = 'P0001';
  end if;
  if v_p.status in ('concluido','cancelado') then
    raise exception 'Pedido % não pode ser transferido.', v_p.status using errcode = 'P0001';
  end if;

  select * into v_dest from public.usuarios where id = p_para;
  if not found or upper(v_dest.perfil) not in ('LAB','GESTOR','DEV') or coalesce(v_dest.status,'Ativo') <> 'Ativo' then
    raise exception 'Destino inválido: escolha um laboratorista ativo.' using errcode = 'P0001';
  end if;

  update public.pedidos_ensaio
     set laboratorista_id = p_para,
         historico = coalesce(historico, '[]'::jsonb) || jsonb_build_array(
           public._evento('O.S. transferida', jsonb_strip_nulls(jsonb_build_object(
             'para', v_dest.nome, 'para_id', v_dest.id, 'motivo', nullif(trim(p_motivo), '')))))
   where id = p_pedido_id
  returning * into v_p;
  return v_p;
end $$;

-- 9.5 Finalizar O.S. (todos os ensaios aprovados)
create or replace function public.finalizar_os(p_pedido_id uuid)
returns public.pedidos_ensaio
language plpgsql security definer
set search_path = public
as $$
declare
  v_me        uuid := public.usuario_atual_id();
  v_p         public.pedidos_ensaio;
  v_total     integer;
  v_pendentes integer;
  v_assin     text;
begin
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if not (public.eh_gestor() or v_p.laboratorista_id = v_me) then
    raise exception 'Somente o laboratorista responsável pode finalizar a O.S.' using errcode = 'P0001';
  end if;
  if v_p.status = 'concluido' then return v_p; end if;
  if v_p.numero_os is null or v_p.numero_os like 'PROV-%' then
    raise exception 'A O.S. ainda não foi gerada/sincronizada.' using errcode = 'P0001';
  end if;

  select count(*), count(*) filter (where status <> 'aprovado')
    into v_total, v_pendentes
    from public.ensaios_os where pedido_id = p_pedido_id;

  if v_total = 0 then
    raise exception 'A O.S. não possui ensaios.' using errcode = 'P0001';
  end if;
  if v_pendentes > 0 then
    raise exception 'Ainda há % ensaio(s) não aprovado(s).', v_pendentes using errcode = 'P0001';
  end if;

  select assinatura_url into v_assin from public.usuarios where id = v_me;

  perform set_config('cnro.finalizando', 'on', true);

  update public.pedidos_ensaio
     set status          = 'concluido',
         finalizado_por  = v_me,
         finalizado_em   = now(),
         revisado_por_id = v_me,
         revisado_em     = now(),
         historico       = coalesce(historico, '[]'::jsonb) || jsonb_build_array(
                             public._evento('O.S. finalizada', jsonb_build_object(
                               'assinatura', v_assin is not null)))
   where id = p_pedido_id
  returning * into v_p;

  perform set_config('cnro.finalizando', 'off', true);

  if v_p.ficha_os_id is not null then
    update public.fichas_os f
       set inicio_ensaios  = coalesce(f.inicio_ensaios,
                               (select min(data_atribuicao)::date from public.ensaios_os where pedido_id = p_pedido_id)),
           fim_ensaios     = coalesce(f.fim_ensaios,
                               (select max(data_conclusao)::date from public.ensaios_os where pedido_id = p_pedido_id)),
           analise_ensaios = (now() at time zone 'America/Cuiaba')::date
     where f.id = v_p.ficha_os_id;
  end if;

  return v_p;
end $$;

-- Permissões de execução
do $$
declare f text;
begin
  foreach f in array array[
    'assumir_pedido(uuid)', 'adicionar_historico(uuid, jsonb)', 'gerar_os(uuid, date, text)',
    'transferir_os(uuid, uuid, text)', 'finalizar_os(uuid)', 'gerar_observacao_os(uuid)',
    'usuario_atual_id()', 'usuario_atual_perfil()', 'eh_gestor()', 'eh_lab()', 'eh_equipe_lab()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 10. RLS
-- -----------------------------------------------------------------------------
-- Remove todas as policies antigas das tabelas abaixo e recria.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
     where schemaname = 'public'
       and (tablename in ('usuarios','empresas','ensaios','pedidos_ensaio','ensaios_os','resultados',
                          'fichas_os','fichas_solicitacao','fichas_ensaio','tracos_aprovados',
                          'audit_log','ensaio_resultado_map')
            or tablename like 'resultado\_%')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Garante RLS ligado
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
     where schemaname = 'public'
       and (tablename in ('usuarios','empresas','ensaios','pedidos_ensaio','ensaios_os','resultados',
                          'fichas_os','fichas_solicitacao','fichas_ensaio','tracos_aprovados',
                          'audit_log','ensaio_resultado_map')
            or tablename like 'resultado\_%')
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Leitura: somente usuários logados (antes era pública)
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
     where schemaname = 'public'
       and (tablename in ('usuarios','empresas','ensaios','pedidos_ensaio','ensaios_os','resultados',
                          'fichas_os','fichas_solicitacao','fichas_ensaio','tracos_aprovados',
                          'ensaio_resultado_map')
            or tablename like 'resultado\_%')
  loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
  end loop;
end $$;

-- usuarios
create policy usuarios_insert on public.usuarios for insert to authenticated
  with check (public.eh_gestor());
create policy usuarios_update on public.usuarios for update to authenticated
  using (public.eh_gestor() or auth_id = auth.uid() or id = auth.uid())
  with check (public.eh_gestor() or auth_id = auth.uid() or id = auth.uid());
create policy usuarios_delete on public.usuarios for delete to authenticated
  using (public.eh_gestor());

-- Cadastros gerenciados pelo Gestor
create policy empresas_manage on public.empresas for all to authenticated
  using (public.eh_gestor()) with check (public.eh_gestor());
create policy ensaios_manage on public.ensaios for all to authenticated
  using (public.eh_gestor()) with check (public.eh_gestor());
create policy fichas_ensaio_manage on public.fichas_ensaio for all to authenticated
  using (public.eh_gestor()) with check (public.eh_gestor());
create policy ensaio_resultado_map_manage on public.ensaio_resultado_map for all to authenticated
  using (public.eh_gestor()) with check (public.eh_gestor());
create policy tracos_manage on public.tracos_aprovados for all to authenticated
  using (public.eh_lab()) with check (public.eh_lab());

-- pedidos_ensaio
--   Campo cria; solicitante corrige quando devolvido; laboratorista altera os
--   pedidos pelos quais é responsável (assume via assumir_pedido); Gestor tudo.
create policy pedidos_insert on public.pedidos_ensaio for insert to authenticated
  with check (solicitante_id = public.usuario_atual_id() or public.eh_lab());
create policy pedidos_update on public.pedidos_ensaio for update to authenticated
  using (
    public.eh_gestor()
    or (public.eh_lab() and laboratorista_id = public.usuario_atual_id())
    or (solicitante_id = public.usuario_atual_id() and status = 'devolvido_campo')
  )
  with check (
    public.eh_gestor()
    or (public.eh_lab() and laboratorista_id = public.usuario_atual_id())
    or (solicitante_id = public.usuario_atual_id() and status in ('devolvido_campo','aguardando_lab'))
  );
create policy pedidos_delete on public.pedidos_ensaio for delete to authenticated
  using (public.eh_gestor());

-- ensaios_os
create policy ensaios_os_insert on public.ensaios_os for insert to authenticated
  with check (
    public.eh_gestor()
    or exists (select 1 from public.pedidos_ensaio p
                where p.id = pedido_id and p.laboratorista_id = public.usuario_atual_id())
  );
create policy ensaios_os_update on public.ensaios_os for update to authenticated
  using (
    public.eh_gestor()
    or assistente_id = public.usuario_atual_id()
    or exists (select 1 from public.pedidos_ensaio p
                where p.id = pedido_id and p.laboratorista_id = public.usuario_atual_id())
  )
  with check (
    public.eh_gestor()
    or assistente_id = public.usuario_atual_id()
    or exists (select 1 from public.pedidos_ensaio p
                where p.id = pedido_id and p.laboratorista_id = public.usuario_atual_id())
  );
create policy ensaios_os_delete on public.ensaios_os for delete to authenticated
  using (
    public.eh_gestor()
    or exists (select 1 from public.pedidos_ensaio p
                where p.id = pedido_id and p.laboratorista_id = public.usuario_atual_id())
  );

-- resultados e resultado_*: equipe do laboratório
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
     where schemaname = 'public' and (tablename = 'resultados' or tablename like 'resultado\_%')
  loop
    execute format('create policy %I on public.%I for all to authenticated
                    using (public.eh_equipe_lab()) with check (public.eh_equipe_lab())', t || '_write', t);
  end loop;
end $$;

-- Fichas FR-IMOB-04 / FR-IMOB-05: laboratório
create policy fichas_os_write on public.fichas_os for all to authenticated
  using (public.eh_lab()) with check (public.eh_lab());
create policy fichas_sol_write on public.fichas_solicitacao for all to authenticated
  using (public.eh_lab()) with check (public.eh_lab());

-- audit_log: só leitura para Gestor/Dev; escrita apenas pelos triggers
create policy audit_select on public.audit_log for select to authenticated
  using (public.eh_gestor());

-- -----------------------------------------------------------------------------
-- 11. Storage: bucket privado de assinaturas
-- -----------------------------------------------------------------------------
-- Caminho: assinaturas/<usuarios.id>/assinatura.png
-- usuarios.assinatura_url passa a guardar o caminho (ex.: '<id>/assinatura.png').
insert into storage.buckets (id, name, public)
values ('assinaturas', 'assinaturas', false)
on conflict (id) do update set public = false;

drop policy if exists assinaturas_select on storage.objects;
drop policy if exists assinaturas_insert on storage.objects;
drop policy if exists assinaturas_update on storage.objects;
drop policy if exists assinaturas_delete on storage.objects;

create policy assinaturas_select on storage.objects for select to authenticated
  using (bucket_id = 'assinaturas' and public.eh_equipe_lab());
create policy assinaturas_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'assinaturas'
              and ((storage.foldername(name))[1] = public.usuario_atual_id()::text or public.eh_gestor()));
create policy assinaturas_update on storage.objects for update to authenticated
  using (bucket_id = 'assinaturas'
         and ((storage.foldername(name))[1] = public.usuario_atual_id()::text or public.eh_gestor()));
create policy assinaturas_delete on storage.objects for delete to authenticated
  using (bucket_id = 'assinaturas'
         and ((storage.foldername(name))[1] = public.usuario_atual_id()::text or public.eh_gestor()));

-- -----------------------------------------------------------------------------
-- 12. Realtime (fila do laboratório atualiza sozinha)
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['pedidos_ensaio','ensaios_os'] loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

commit;

-- Fim da migração 10.
