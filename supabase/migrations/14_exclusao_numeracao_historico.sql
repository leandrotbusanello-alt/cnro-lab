-- =============================================================================
-- CNRO Lab Control — Migração 14: Excluir pedido, número manual e lançamento histórico
-- =============================================================================
-- Pré-requisitos: migrações 10, 11, 12, 13 (e 13b).
-- Rodar no SQL Editor do Supabase. Idempotente e numa única transação.
--
-- Conteúdo
--   1. Colunas novas: pedidos_ensaio.lancamento_historico / lancado_por,
--      audit_log.em_nome_de
--   2. Usuário real × usuário representado (usuario_real_id, eh_dev_real,
--      usuario_atual_id com representação) e data de referência (_agora)
--   3. Histórico (_evento) e auditoria registram "lançado por DEV em nome de…"
--   4. Pedido: criação do lançamento histórico, número manual do PE (contador
--      passa a ser sempre o MAIOR número já usado no ano) e bloqueio para não-DEV
--   5. RPCs do laboratório e do assistente com representação e datas informadas
--   6. excluir_pedido (DEV)  ·  alterar_numero_pe (DEV)
--   7. Permissões
--
-- Regras do lançamento histórico (somente o DEV):
--   • o DEV cria o pedido escolhendo solicitante, laboratorista, data e nº do PE;
--   • nas etapas seguintes o banco age como o laboratorista do pedido (O.S.,
--     revisão, aprovação, finalização) ou como o assistente do ensaio (iniciar,
--     enviar), com as assinaturas dessas pessoas e as datas informadas;
--   • o histórico mostra "lançado por <DEV>"; a auditoria grava o DEV como autor
--     real (usuario_id) e a pessoa representada em em_nome_de;
--   • ninguém além do DEV altera um pedido histórico; a marcação não pode ser removida.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Colunas novas
-- -----------------------------------------------------------------------------
alter table public.pedidos_ensaio
  add column if not exists lancamento_historico boolean not null default false,
  add column if not exists lancado_por uuid references public.usuarios(id);

create index if not exists pedidos_ensaio_historico_idx
  on public.pedidos_ensaio (lancamento_historico) where lancamento_historico;

alter table public.audit_log add column if not exists em_nome_de uuid;

-- -----------------------------------------------------------------------------
-- 2. Usuário real, representação e data de referência
-- -----------------------------------------------------------------------------
-- usuario_real_id(): quem está logado (regra original da migração 10).
create or replace function public.usuario_real_id()
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

create or replace function public.eh_dev_real()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select upper(perfil) from public.usuarios where id = public.usuario_real_id()) = 'DEV', false)
$$;

-- usuario_atual_id(): igual ao real, exceto durante um lançamento histórico,
-- quando o DEV age em nome de outra pessoa (definido só pelas funções abaixo,
-- dentro da própria transação; vale apenas se o usuário real for DEV).
create or replace function public.usuario_atual_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select case
           when nullif(current_setting('cnro.agir_como', true), '') is not null and public.eh_dev_real()
             then nullif(current_setting('cnro.agir_como', true), '')::uuid
           else public.usuario_real_id()
         end
$$;

-- Data/hora de referência: a data informada no lançamento histórico ou agora
create or replace function public._agora()
returns timestamptz
language sql stable
as $$
  select coalesce(nullif(current_setting('cnro.data_ref', true), '')::timestamptz, now())
$$;

-- Meio-dia (Cuiabá) de uma data — usado quando só a data é informada
create or replace function public._meio_dia(p date)
returns timestamptz
language sql immutable
as $$
  select case when p is null then null else (p + time '12:00') at time zone 'America/Cuiaba' end
$$;

-- Ativa a representação para um pedido histórico (não faz nada nos demais).
create or replace function public._representar(
  p_pedido public.pedidos_ensaio,
  p_pessoa uuid,
  p_data   timestamptz default null,
  p_papel  text default 'responsável'
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform set_config('cnro.agir_como', '', true);
  perform set_config('cnro.data_ref', '', true);

  if p_pedido.id is null or not coalesce(p_pedido.lancamento_historico, false) then
    return;
  end if;
  if auth.uid() is null then return; end if;   -- SQL Editor / manutenção

  if not public.eh_dev_real() then
    raise exception 'Lançamento histórico: somente o DEV pode alterar este pedido.' using errcode = 'P0001';
  end if;
  if p_pessoa is null then
    raise exception 'Lançamento histórico: defina o % antes de continuar.', p_papel using errcode = 'P0001';
  end if;
  -- aceita usuário inativo: quem executou no passado pode ter saído da empresa
  if not exists (select 1 from public.usuarios where id = p_pessoa) then
    raise exception 'Lançamento histórico: o % não foi encontrado.', p_papel using errcode = 'P0001';
  end if;
  if p_data is not null and p_data > now() + interval '12 hours' then
    raise exception 'Lançamento histórico: a data não pode ser futura.' using errcode = 'P0001';
  end if;

  perform set_config('cnro.agir_como', p_pessoa::text, true);
  perform set_config('cnro.data_ref', coalesce(p_data, now())::text, true);
end $$;

create or replace function public._fim_representacao()
returns void
language sql
as $$
  select set_config('cnro.agir_como', '', true), set_config('cnro.data_ref', '', true);
  select null::void;
$$;

-- Representação a partir de um ensaio da O.S.
create or replace function public._representar_executor(p_ensaio_os_id uuid, p_data timestamptz default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_eo  public.ensaios_os;
  v_ped public.pedidos_ensaio;
begin
  select * into v_eo from public.ensaios_os where id = p_ensaio_os_id;
  if not found then return; end if;
  select * into v_ped from public.pedidos_ensaio where id = v_eo.pedido_id;
  perform public._representar(v_ped, v_eo.assistente_id,
    coalesce(p_data, v_eo.data_atribuicao, public._meio_dia(v_ped.data_validacao), v_ped.created_at),
    'assistente (executor) do ensaio');
end $$;

create or replace function public._representar_revisor(p_ensaio_os_id uuid, p_data timestamptz default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_eo  public.ensaios_os;
  v_ped public.pedidos_ensaio;
begin
  select * into v_eo from public.ensaios_os where id = p_ensaio_os_id;
  if not found then return; end if;
  select * into v_ped from public.pedidos_ensaio where id = v_eo.pedido_id;
  perform public._representar(v_ped, v_ped.laboratorista_id,
    coalesce(p_data, v_eo.enviado_em, v_eo.data_conclusao, public._meio_dia(v_ped.data_validacao), v_ped.created_at),
    'laboratorista responsável');
end $$;

-- -----------------------------------------------------------------------------
-- 3. Histórico e auditoria
-- -----------------------------------------------------------------------------
create or replace function public._evento(p_acao text, p_extra jsonb default '{}'::jsonb)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
           'acao', p_acao,
           'usuario_id', public.usuario_atual_id(),
           'usuario', (select nome from public.usuarios where id = public.usuario_atual_id()),
           'data', public._agora()
         )
         || case
              when public.usuario_real_id() is distinct from public.usuario_atual_id()
                   or nullif(current_setting('cnro.data_ref', true), '') is not null
              then jsonb_build_object(
                     'lancamento_historico', true,
                     'lancado_por_id', public.usuario_real_id(),
                     'lancado_por', (select nome from public.usuarios where id = public.usuario_real_id()),
                     'lancado_em', now())
              else '{}'::jsonb
            end
         || coalesce(p_extra, '{}'::jsonb)
$$;

create or replace function public.tg_auditoria()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid   uuid := public.usuario_real_id();
  v_ator  uuid := public.usuario_atual_id();
  v_nome  text;
  v_nome_de uuid := case when v_ator is distinct from v_uid then v_ator end;
begin
  select nome into v_nome from public.usuarios where id = v_uid;
  if tg_op = 'DELETE' then
    insert into public.audit_log (tabela, registro_id, acao, usuario_id, usuario_nome, dados_antes, em_nome_de)
    values (tg_table_name, old.id, tg_op, v_uid, v_nome, to_jsonb(old), v_nome_de);
    return old;
  elsif tg_op = 'UPDATE' then
    if to_jsonb(new) - 'updated_at' = to_jsonb(old) - 'updated_at' then return new; end if;
    insert into public.audit_log (tabela, registro_id, acao, usuario_id, usuario_nome, dados_antes, dados_depois, em_nome_de)
    values (tg_table_name, new.id, tg_op, v_uid, v_nome, to_jsonb(old), to_jsonb(new), v_nome_de);
    return new;
  else
    insert into public.audit_log (tabela, registro_id, acao, usuario_id, usuario_nome, dados_depois, em_nome_de)
    values (tg_table_name, new.id, tg_op, v_uid, v_nome, to_jsonb(new), v_nome_de);
    return new;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Pedido: lançamento histórico e numeração
-- -----------------------------------------------------------------------------
-- 4.1 Criação do lançamento histórico / bloqueio para não-DEV (a18, antes da numeração)
create or replace function public.tg_pedido_historico()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_lab public.usuarios;
  v_sol public.usuarios;
begin
  if tg_op = 'UPDATE' then
    -- a marcação não muda depois de criada
    new.lancamento_historico := old.lancamento_historico;
    new.lancado_por          := old.lancado_por;
    if old.lancamento_historico and auth.uid() is not null and not public.eh_dev_real() then
      raise exception 'Lançamento histórico: somente o DEV pode alterar este pedido.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- INSERT
  if not coalesce(new.lancamento_historico, false) then
    new.lancamento_historico := false;
    new.lancado_por := null;
    return new;
  end if;
  if auth.uid() is null then return new; end if;   -- SQL Editor / manutenção

  if not public.eh_dev_real() then
    raise exception 'Somente o DEV pode criar lançamentos históricos.' using errcode = 'P0001';
  end if;

  select * into v_sol from public.usuarios where id = new.solicitante_id;
  if not found then
    raise exception 'Lançamento histórico: informe o solicitante.' using errcode = 'P0001';
  end if;
  select * into v_lab from public.usuarios where id = new.laboratorista_id;
  if not found then
    raise exception 'Lançamento histórico: informe o laboratorista responsável.' using errcode = 'P0001';
  end if;
  if not ('laboratorio' = any(public.modulos_do_usuario(v_lab.id))) then
    raise exception 'Lançamento histórico: % não tem o módulo Laboratório.', v_lab.nome using errcode = 'P0001';
  end if;
  if new.created_at is null or new.created_at > now() + interval '12 hours' then
    raise exception 'Lançamento histórico: informe a data da solicitação (não pode ser futura).' using errcode = 'P0001';
  end if;

  new.lancado_por := public.usuario_real_id();
  new.status      := 'aguardando_lab';
  new.numero_os   := null;
  new.historico   := coalesce(nullif(new.historico, 'null'::jsonb), '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                       'acao', 'Pedido criado',
                       'usuario_id', v_sol.id, 'usuario', v_sol.nome,
                       'data', new.created_at,
                       'lancamento_historico', true,
                       'lancado_por_id', public.usuario_real_id(),
                       'lancado_por', (select nome from public.usuarios where id = public.usuario_real_id()),
                       'lancado_em', now()));
  return new;
end $$;

drop trigger if exists a18_pedido_historico on public.pedidos_ensaio;
create trigger a18_pedido_historico
  before insert or update on public.pedidos_ensaio
  for each row execute function public.tg_pedido_historico();

-- 4.2 Numeração do PE
--   • Automática: próximo número do contador do ano (pula números já usados).
--   • Manual (somente DEV): usa o número informado, se ainda não existir no ano,
--     e o contador passa a ser o MAIOR entre o valor atual e esse número.
--     Assim, ao lançar primeiro o último pedido em papel, os pedidos novos do
--     Campo continuam dele em diante; números menores não mexem no contador.
create or replace function public.tg_pedido_numero_pe()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_ano    integer := extract(year from (coalesce(new.created_at, now()) at time zone 'America/Cuiaba'))::int;
  v_seq    integer;
  v_manual integer;
begin
  if new.sequencial is not null and (auth.uid() is null or public.eh_dev_real()) then
    v_manual := new.sequencial;
  end if;

  if v_manual is not null then
    if v_manual < 1 or v_manual > 9999 then
      raise exception 'O número do PE deve estar entre 1 e 9999.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.pedidos_ensaio where ano = v_ano and sequencial = v_manual) then
      raise exception 'O PE-%-% já existe no sistema.', v_ano, lpad(v_manual::text, 4, '0') using errcode = 'P0001';
    end if;
    insert into public.contadores_pedido as c (ano, ultimo) values (v_ano, v_manual)
    on conflict (ano) do update set ultimo = greatest(c.ultimo, excluded.ultimo);
    v_seq := v_manual;
  else
    loop
      insert into public.contadores_pedido as c (ano, ultimo) values (v_ano, 1)
      on conflict (ano) do update set ultimo = c.ultimo + 1
      returning ultimo into v_seq;
      exit when not exists (select 1 from public.pedidos_ensaio where ano = v_ano and sequencial = v_seq);
    end loop;
  end if;

  new.ano        := v_ano;
  new.sequencial := v_seq;
  new.numero_pe  := lpad(v_seq::text, 4, '0');
  return new;
end $$;

-- 4.3 Índice único (ano, sequencial), se ainda não existir
do $$
begin
  if not exists (select 1 from pg_indexes where indexname = 'pedidos_ensaio_ano_seq_uq') then
    if exists (select 1 from public.pedidos_ensaio where sequencial is not null
                group by ano, sequencial having count(*) > 1) then
      raise notice 'pedidos_ensaio possui (ano, sequencial) duplicados: índice único NÃO criado. Exclua os pedidos de teste e rode esta migração de novo.';
    else
      create unique index pedidos_ensaio_ano_seq_uq on public.pedidos_ensaio (ano, sequencial);
    end if;
  end if;
end $$;

-- 4.4 Ensaios da O.S.: bloqueio de pedidos históricos para não-DEV
--     (mesma função da migração 13 + o bloqueio no início)
create or replace function public.tg_ensaio_os_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_ped     public.pedidos_ensaio;
  v_eh_resp boolean;
  v_rpc     boolean := coalesce(current_setting('cnro.assistente', true), '') = 'on';
begin
  select * into v_ped from public.pedidos_ensaio
   where id = case when tg_op = 'DELETE' then old.pedido_id else new.pedido_id end;

  if auth.uid() is null then   -- SQL Editor / service_role (manutenção)
    if tg_op = 'DELETE' then return old; end if;
    new.status := public._normalizar_status_ensaio(coalesce(new.status, 'pendente'));
    return new;
  end if;

  if coalesce(v_ped.lancamento_historico, false) and not public.eh_dev_real() then
    raise exception 'Lançamento histórico: somente o DEV pode alterar este pedido.' using errcode = 'P0001';
  end if;

  if v_ped.status = 'concluido' and not public.eh_gestor() then
    raise exception 'O.S. finalizada: somente o Gestor pode reabrir.' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; end if;

  new.status := public._normalizar_status_ensaio(coalesce(new.status, 'pendente'));

  if tg_op = 'UPDATE' then
    new.updated_at := now();

    if new.status = 'devolvido' and old.status is distinct from 'devolvido' then
      new.assinatura_executor   := null;
      new.assinatura_calculista := null;
    end if;

    v_eh_resp := public.eh_gestor() or v_ped.laboratorista_id = public.usuario_atual_id();
    if not v_eh_resp then
      if new.pedido_id        is distinct from old.pedido_id
         or new.ensaio_id       is distinct from old.ensaio_id
         or new.assistente_id   is distinct from old.assistente_id
         or new.ficha_ensaio_id is distinct from old.ficha_ensaio_id
         or new.visivel_campo   is distinct from old.visivel_campo
         or new.aprovado_por_id is distinct from old.aprovado_por_id
         or new.aprovado_em     is distinct from old.aprovado_em
         or new.resultado_id    is distinct from old.resultado_id
         or new.assinatura_calculista is distinct from old.assinatura_calculista then
        raise exception 'Somente o laboratorista responsável pela O.S. pode alterar atribuição, aprovação ou visibilidade.'
          using errcode = 'P0001';
      end if;
      if not v_rpc then
        raise exception 'Use as ações do Módulo Assistente (Iniciar, Salvar, Enviar para revisão).'
          using errcode = 'P0001';
      end if;
      if old.status in ('aguardando_revisao', 'aprovado') then
        raise exception 'Este ensaio já foi enviado para revisão. Aguarde a devolução do laboratorista.'
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

-- 4.5 Status derivado + resultados: data da revisão = data de referência
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
  select status into v_atual from public.pedidos_ensaio where id = v_pid;
  if v_atual in ('em_andamento','aguardando_revisao') then
    v_novo := case when exists (select 1 from public.ensaios_os
                                 where pedido_id = v_pid and status = 'aguardando_revisao')
                   then 'aguardando_revisao' else 'em_andamento' end;
    if v_novo <> v_atual then
      update public.pedidos_ensaio set status = v_novo where id = v_pid;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.resultado_id is not null and new.status is distinct from old.status then
    if new.status = 'aprovado' then
      update public.resultados
         set status = 'aprovado', laboratorista_id = new.aprovado_por_id,
             data_revisao = (public._agora() at time zone 'America/Cuiaba')::date
       where id = new.resultado_id;
    elsif new.status = 'devolvido' then
      update public.resultados set status = 'em_execucao' where id = new.resultado_id;
    end if;
  end if;

  return null;
end $$;

-- -----------------------------------------------------------------------------
-- 5. RPCs com representação e datas
-- -----------------------------------------------------------------------------

-- 5.1 Assumir pedido
create or replace function public.assumir_pedido(p_pedido_id uuid)
returns public.pedidos_ensaio
language plpgsql security definer
set search_path = public
as $$
declare
  v_me   uuid;
  v_p    public.pedidos_ensaio;
  v_nome text;
begin
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;

  perform public._representar(v_p, v_p.laboratorista_id, v_p.created_at, 'laboratorista responsável');
  v_me := public.usuario_atual_id();

  if not public.eh_lab() then
    raise exception 'Apenas laboratoristas podem assumir pedidos.' using errcode = 'P0001';
  end if;

  if v_p.laboratorista_id is not null and v_p.laboratorista_id <> v_me then
    select nome into v_nome from public.usuarios where id = v_p.laboratorista_id;
    raise exception 'Pedido já assumido por %.', coalesce(v_nome, 'outro laboratorista')
      using errcode = 'P0001';
  end if;
  if v_p.status in ('concluido','cancelado') then
    raise exception 'Pedido % não pode ser assumido.', v_p.status using errcode = 'P0001';
  end if;

  if v_p.laboratorista_id = v_me and v_p.status <> 'aguardando_lab' then
    perform public._fim_representacao();
    return v_p;   -- já é o responsável (idempotente)
  end if;

  update public.pedidos_ensaio
     set laboratorista_id = v_me,
         assumido_em      = coalesce(assumido_em, public._agora()),
         aberto_por       = coalesce(aberto_por, v_me),
         aberto_em        = coalesce(aberto_em, public._agora()),
         status           = case when status = 'aguardando_lab' then 'em_analise' else status end,
         historico        = coalesce(historico, '[]'::jsonb) || jsonb_build_array(
                              public._evento(case when v_p.laboratorista_id is null or v_p.lancamento_historico
                                                  then 'Pedido assumido' else 'Análise retomada' end))
   where id = p_pedido_id
  returning * into v_p;

  perform public._fim_representacao();
  return v_p;
end $$;

-- 5.2 Registrar evento no histórico
create or replace function public.adicionar_historico(p_pedido_id uuid, p_evento jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_p    public.pedidos_ensaio;
  v_data timestamptz;
begin
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;

  if coalesce(p_evento->>'data', '') ~ '^\d{4}-\d{2}-\d{2}' then
    v_data := (p_evento->>'data')::timestamptz;
  end if;
  perform public._representar(v_p, v_p.laboratorista_id,
    coalesce(v_data, public._meio_dia(v_p.data_validacao), v_p.created_at), 'laboratorista responsável');

  if not (public.eh_gestor()
          or v_p.laboratorista_id = public.usuario_atual_id()
          or v_p.solicitante_id  = public.usuario_atual_id()
          or exists (select 1 from public.ensaios_os
                      where pedido_id = p_pedido_id and assistente_id = public.usuario_atual_id())) then
    raise exception 'Sem permissão para registrar histórico neste pedido.' using errcode = 'P0001';
  end if;

  update public.pedidos_ensaio
     set historico = coalesce(historico, '[]'::jsonb) || jsonb_build_array(
           public._evento(coalesce(p_evento->>'acao', 'Evento'),
                          p_evento - 'acao' - 'usuario' - 'usuario_id'
                                   - 'lancado_por' - 'lancado_por_id' - 'lancado_em' - 'lancamento_historico')
           || case when p_evento ? 'data' then jsonb_build_object('data', p_evento->'data') else '{}'::jsonb end)
   where id = p_pedido_id;

  perform public._fim_representacao();
end $$;

-- 5.3 Gerar O.S. (versão da migração 11 + representação)
create or replace function public.gerar_os(p_pedido_id uuid, p_data date default null, p_lote text default null)
returns public.pedidos_ensaio
language plpgsql security definer
set search_path = public
as $$
declare
  v_me       uuid;
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
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;

  if v_p.lancamento_historico then
    if p_data is null then
      raise exception 'Lançamento histórico: informe a data da O.S.' using errcode = 'P0001';
    end if;
    if p_data < (v_p.created_at at time zone 'America/Cuiaba')::date then
      raise exception 'A data da O.S. não pode ser anterior à data da solicitação (%).',
        to_char(v_p.created_at at time zone 'America/Cuiaba', 'DD/MM/YYYY') using errcode = 'P0001';
    end if;
  end if;
  perform public._representar(v_p, v_p.laboratorista_id, public._meio_dia(p_data), 'laboratorista responsável');
  v_me := public.usuario_atual_id();

  if not public.eh_lab() then
    raise exception 'Apenas laboratoristas podem gerar O.S.' using errcode = 'P0001';
  end if;

  if v_p.laboratorista_id is not null and v_p.laboratorista_id <> v_me and not public.eh_gestor() then
    raise exception 'Somente o laboratorista responsável pode gerar a O.S.' using errcode = 'P0001';
  end if;

  if v_p.numero_os is not null and v_p.numero_os not like 'PROV-%' then
    perform public._fim_representacao();
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

  v_data := coalesce(p_data, (public._agora() at time zone 'America/Cuiaba')::date);
  v_num  := to_char(v_data, 'YYYY.MM.DD') || '.' || lpad(v_lote_num, 2, '0') || '.'
            || lpad(v_p.sequencial::text, 4, '0');

  insert into public.ensaios_os (pedido_id, ensaio_id, nome_ensaio, status)
  select v_p.id, e.id, e.nome, 'pendente'
    from public.ensaios e
   where e.id::text = any(v_p.ensaios_ids)
     and not exists (select 1 from public.ensaios_os x where x.pedido_id = v_p.id and x.ensaio_id = e.id);

  select nome into v_sol from public.usuarios where id = v_p.solicitante_id;
  v_obra := coalesce(v_p.empresa, (select nome from public.empresas where id = v_p.empresa_id));

  update public.pedidos_ensaio set lote = v_lote where id = v_p.id;

  v_ficha_sl := v_p.ficha_sol_id;
  if v_ficha_sl is null then
    insert into public.fichas_solicitacao (pedido_id, obra, lote, solicitante, localizacoes, observacao, status, criado_por)
    values (
      v_p.id, v_obra, v_lote, v_sol,
      (select coalesce(jsonb_agg(jsonb_build_object(
                'km',     coalesce(a->>'km', a->>'estaca_inicial', a->>'estaca_extracao', a->>'estaca', ''),
                'pista',  coalesce(a->>'pista', ''),
                'trilho', coalesce(a->>'trilho', a->>'faixa', ''))), '[]'::jsonb)
         from jsonb_array_elements(public._amostras(v_p.dados_amostra)) a
        where coalesce(a->>'km', a->>'estaca_inicial', a->>'estaca_extracao', a->>'estaca', a->>'pista', a->>'faixa') is not null),
      public.gerar_observacao_os(v_p.id), 'emitida', v_me)
    returning id into v_ficha_sl;
  end if;

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
         assumido_em      = coalesce(assumido_em, public._agora()),
         aberto_por       = coalesce(aberto_por, v_me),
         aberto_em        = coalesce(aberto_em, public._agora()),
         ficha_os_id      = v_ficha_os,
         ficha_sol_id     = v_ficha_sl,
         motivo_devolucao = null,
         historico        = coalesce(historico, '[]'::jsonb) || jsonb_build_array(
                              public._evento('O.S. gerada', jsonb_build_object(
                                'numero_os', v_num,
                                'provisorio', v_p.numero_os)))
   where id = v_p.id
  returning * into v_p;

  perform public._fim_representacao();
  return v_p;
end $$;

-- 5.4 Transferir O.S.
create or replace function public.transferir_os(p_pedido_id uuid, p_para uuid, p_motivo text default null)
returns public.pedidos_ensaio
language plpgsql security definer
set search_path = public
as $$
declare
  v_me   uuid;
  v_p    public.pedidos_ensaio;
  v_dest public.usuarios;
begin
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;

  perform public._representar(v_p, v_p.laboratorista_id, null, 'laboratorista responsável');
  v_me := public.usuario_atual_id();

  if not (public.eh_gestor() or v_p.laboratorista_id = v_me) then
    raise exception 'Somente o responsável (ou o Gestor) pode transferir.' using errcode = 'P0001';
  end if;
  if v_p.status in ('concluido','cancelado') then
    raise exception 'Pedido % não pode ser transferido.', v_p.status using errcode = 'P0001';
  end if;

  select * into v_dest from public.usuarios where id = p_para;
  if not found or not ('laboratorio' = any(public.modulos_do_usuario(v_dest.id)))
     or (not v_p.lancamento_historico and coalesce(v_dest.status,'Ativo') <> 'Ativo') then
    raise exception 'Destino inválido: escolha um laboratorista ativo.' using errcode = 'P0001';
  end if;

  update public.pedidos_ensaio
     set laboratorista_id = p_para,
         historico = coalesce(historico, '[]'::jsonb) || jsonb_build_array(
           public._evento('O.S. transferida', jsonb_strip_nulls(jsonb_build_object(
             'para', v_dest.nome, 'para_id', v_dest.id, 'motivo', nullif(trim(p_motivo), '')))))
   where id = p_pedido_id
  returning * into v_p;

  perform public._fim_representacao();
  return v_p;
end $$;

-- 5.5 Finalizar O.S. — novo parâmetro p_data (obrigatório no lançamento histórico)
drop function if exists public.finalizar_os(uuid);
create or replace function public.finalizar_os(p_pedido_id uuid, p_data timestamptz default null)
returns public.pedidos_ensaio
language plpgsql security definer
set search_path = public
as $$
declare
  v_me        uuid;
  v_p         public.pedidos_ensaio;
  v_total     integer;
  v_pendentes integer;
  v_assin     text;
begin
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;

  if v_p.lancamento_historico then
    if p_data is null then
      raise exception 'Lançamento histórico: informe a data da finalização.' using errcode = 'P0001';
    end if;
    if v_p.data_validacao is not null and (p_data at time zone 'America/Cuiaba')::date < v_p.data_validacao then
      raise exception 'A finalização não pode ser anterior à data da O.S. (%).',
        to_char(v_p.data_validacao, 'DD/MM/YYYY') using errcode = 'P0001';
    end if;
  end if;
  perform public._representar(v_p, v_p.laboratorista_id, p_data, 'laboratorista responsável');
  v_me := public.usuario_atual_id();

  if not (public.eh_gestor() or v_p.laboratorista_id = v_me) then
    raise exception 'Somente o laboratorista responsável pode finalizar a O.S.' using errcode = 'P0001';
  end if;
  if v_p.status = 'concluido' then perform public._fim_representacao(); return v_p; end if;
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
         finalizado_em   = public._agora(),
         revisado_por_id = v_me,
         revisado_em     = public._agora(),
         historico       = coalesce(historico, '[]'::jsonb) || jsonb_build_array(
                             public._evento('O.S. finalizada', jsonb_build_object(
                               'assinatura', v_assin is not null)))
   where id = p_pedido_id
  returning * into v_p;

  perform set_config('cnro.finalizando', 'off', true);

  if v_p.ficha_os_id is not null then
    update public.fichas_os f
       set inicio_ensaios  = coalesce(f.inicio_ensaios,
                               (select min(data_atribuicao at time zone 'America/Cuiaba')::date
                                  from public.ensaios_os where pedido_id = p_pedido_id)),
           fim_ensaios     = coalesce(f.fim_ensaios,
                               (select max(data_conclusao at time zone 'America/Cuiaba')::date
                                  from public.ensaios_os where pedido_id = p_pedido_id)),
           analise_ensaios = (public._agora() at time zone 'America/Cuiaba')::date
     where f.id = v_p.ficha_os_id;
  end if;

  perform public._fim_representacao();
  return v_p;
end $$;

-- 5.6 Assistente: iniciar, rascunho, enviar (versões da migração 13 + representação)
create or replace function public.iniciar_ensaio(p_ensaio_os_id uuid)
returns public.ensaios_os
language plpgsql security definer
set search_path = public
as $$
declare
  v_eo     public.ensaios_os;
  v_modelo uuid;
  v_acao   text;
begin
  perform public._representar_executor(p_ensaio_os_id, null);
  v_eo := public._ensaio_do_executor(p_ensaio_os_id);
  if v_eo.status = 'em_andamento' and v_eo.ficha_modelo_id is not null then
    perform public._fim_representacao();
    return v_eo;
  end if;

  if v_eo.ficha_ensaio_id is null then
    raise exception 'O laboratorista ainda não definiu a ficha deste ensaio.' using errcode = 'P0001';
  end if;
  v_modelo := coalesce(v_eo.ficha_modelo_id, public.modelo_vigente(v_eo.ficha_ensaio_id));
  if v_modelo is null then
    raise exception 'A ficha deste ensaio ainda não está disponível no sistema.' using errcode = 'P0001';
  end if;

  v_acao := case when v_eo.status = 'devolvido' then 'Correção iniciada' else 'Ensaio iniciado' end;

  perform set_config('cnro.assistente', 'on', true);
  update public.ensaios_os
     set status          = 'em_andamento',
         ficha_modelo_id = v_modelo,
         iniciado_em     = coalesce(iniciado_em, public._agora()),
         modo_preenchi   = 'digital'
   where id = p_ensaio_os_id
  returning * into v_eo;
  perform set_config('cnro.assistente', 'off', true);

  update public.pedidos_ensaio
     set historico = coalesce(historico, '[]'::jsonb)
                     || jsonb_build_array(public._evento(v_acao, jsonb_build_object('ensaio', v_eo.nome_ensaio)))
   where id = v_eo.pedido_id;

  perform public._fim_representacao();
  return v_eo;
end $$;

create or replace function public.salvar_rascunho_ensaio(p_ensaio_os_id uuid, p_dados jsonb)
returns public.ensaios_os
language plpgsql security definer
set search_path = public
as $$
declare
  v_eo public.ensaios_os;
begin
  perform public._representar_executor(p_ensaio_os_id, null);
  v_eo := public._ensaio_do_executor(p_ensaio_os_id);
  if v_eo.status <> 'em_andamento' then
    raise exception 'Inicie o ensaio antes de preencher a ficha.' using errcode = 'P0001';
  end if;

  perform set_config('cnro.assistente', 'on', true);
  update public.ensaios_os
     set dados_resultado = coalesce(p_dados, '{}'::jsonb),
         rascunho_em     = now()          -- controle técnico do rascunho (hora real)
   where id = p_ensaio_os_id
  returning * into v_eo;
  perform set_config('cnro.assistente', 'off', true);

  perform public._fim_representacao();
  return v_eo;
end $$;

create or replace function public.enviar_para_revisao(p_ensaio_os_id uuid, p_dados jsonb, p_assinado_em timestamptz default null)
returns public.ensaios_os
language plpgsql security definer
set search_path = public
as $$
declare
  v_eo   public.ensaios_os;
  v_me   uuid;
  v_user public.usuarios;
begin
  perform public._representar_executor(p_ensaio_os_id, p_assinado_em);
  v_me := public.usuario_atual_id();
  v_eo := public._ensaio_do_executor(p_ensaio_os_id);
  if v_eo.status <> 'em_andamento' then
    raise exception 'Inicie o ensaio antes de enviar.' using errcode = 'P0001';
  end if;

  select * into v_user from public.usuarios where id = v_me;
  if coalesce(v_user.assinatura_url, '') = '' then
    raise exception '% ainda não tem assinatura cadastrada. Peça ao Gestor para cadastrar antes de enviar.',
      case when v_me is distinct from public.usuario_real_id() then v_user.nome else 'Você' end
      using errcode = 'P0001';
  end if;
  if p_assinado_em is null then
    raise exception 'Assine a ficha (Responsável executor) antes de enviar.' using errcode = 'P0001';
  end if;
  if p_dados is null or p_dados = '{}'::jsonb then
    raise exception 'A ficha está vazia.' using errcode = 'P0001';
  end if;

  perform set_config('cnro.assistente', 'on', true);
  update public.ensaios_os
     set dados_resultado     = p_dados,
         status              = 'aguardando_revisao',
         data_conclusao      = public._agora(),
         enviado_em          = public._agora(),
         modo_preenchi       = 'digital',
         assinatura_executor = jsonb_build_object('usuario_id', v_me, 'nome', v_user.nome,
                                                  'em', p_assinado_em)
   where id = p_ensaio_os_id
  returning * into v_eo;
  perform set_config('cnro.assistente', 'off', true);

  update public.pedidos_ensaio
     set historico = coalesce(historico, '[]'::jsonb)
                     || jsonb_build_array(public._evento('Ensaio enviado para revisão',
                                                         jsonb_build_object('ensaio', v_eo.nome_ensaio)))
   where id = v_eo.pedido_id;

  perform public._fim_representacao();
  return v_eo;
end $$;

-- 5.7 Revisão: salvar correções e aprovar (versões da migração 13 + representação)
create or replace function public.salvar_revisao_ensaio(p_ensaio_os_id uuid, p_dados jsonb)
returns public.ensaios_os
language plpgsql security definer
set search_path = public
as $$
declare
  v_eo public.ensaios_os;
begin
  perform public._representar_revisor(p_ensaio_os_id, null);
  v_eo := public._ensaio_do_revisor(p_ensaio_os_id);
  if v_eo.status <> 'aguardando_revisao' then
    raise exception 'Só é possível corrigir ensaios aguardando revisão.' using errcode = 'P0001';
  end if;
  update public.ensaios_os set dados_resultado = coalesce(p_dados, dados_resultado)
   where id = p_ensaio_os_id
  returning * into v_eo;

  update public.pedidos_ensaio
     set historico = coalesce(historico, '[]'::jsonb)
                     || jsonb_build_array(public._evento('Ficha corrigida na revisão',
                                                         jsonb_build_object('ensaio', v_eo.nome_ensaio)))
   where id = v_eo.pedido_id;

  perform public._fim_representacao();
  return v_eo;
end $$;

create or replace function public.aprovar_ensaio(
  p_ensaio_os_id  uuid,
  p_dados         jsonb,
  p_resultados    jsonb   default '[]'::jsonb,
  p_conformidade  text    default null,
  p_observacoes   text    default null,
  p_visivel_campo boolean default null,
  p_assinado_em   timestamptz default null
)
returns public.ensaios_os
language plpgsql security definer
set search_path = public
as $$
declare
  v_eo    public.ensaios_os;
  v_me    uuid;
  v_user  public.usuarios;
  v_res   uuid;
  v_norma text;
  v_item  jsonb;
  v_linha jsonb;
  v_tab   text;
  v_qtd   integer := 0;
  v_dia   date;
begin
  perform public._representar_revisor(p_ensaio_os_id, p_assinado_em);
  v_me := public.usuario_atual_id();
  v_eo := public._ensaio_do_revisor(p_ensaio_os_id);
  if v_eo.status <> 'aguardando_revisao' then
    raise exception 'Só é possível aprovar ensaios aguardando revisão.' using errcode = 'P0001';
  end if;

  select * into v_user from public.usuarios where id = v_me;
  if coalesce(v_user.assinatura_url, '') = '' then
    raise exception '% ainda não tem assinatura cadastrada. Peça ao Gestor para cadastrar antes de aprovar.',
      case when v_me is distinct from public.usuario_real_id() then v_user.nome else 'Você' end
      using errcode = 'P0001';
  end if;
  if p_assinado_em is null then
    raise exception 'Assine a ficha (Responsável calculista) antes de aprovar.' using errcode = 'P0001';
  end if;
  if p_conformidade is not null
     and p_conformidade not in ('Conforme','Não Conforme','Parcialmente Conforme','Pendente') then
    raise exception 'Conformidade inválida: %', p_conformidade using errcode = 'P0001';
  end if;

  v_dia := (public._agora() at time zone 'America/Cuiaba')::date;
  select norma into v_norma from public.ensaios where id = v_eo.ensaio_id;

  v_res := v_eo.resultado_id;
  if v_res is null then
    select id into v_res from public.resultados where ensaio_os_id = v_eo.id limit 1;
  end if;
  if v_res is null then
    insert into public.resultados (pedido_id, ensaio_os_id, ensaio_id, assistente_id, laboratorista_id,
                                   status, conformidade, observacoes, data_execucao, data_revisao, norma_utilizada)
    values (v_eo.pedido_id, v_eo.id, v_eo.ensaio_id, v_eo.assistente_id, v_me,
            'aprovado', coalesce(p_conformidade, 'Pendente'), p_observacoes,
            (coalesce(v_eo.data_conclusao, public._agora()) at time zone 'America/Cuiaba')::date, v_dia, v_norma)
    returning id into v_res;
  else
    update public.resultados
       set status = 'aprovado', laboratorista_id = v_me, assistente_id = v_eo.assistente_id,
           conformidade = coalesce(p_conformidade, conformidade, 'Pendente'),
           observacoes = coalesce(p_observacoes, observacoes),
           data_execucao = (coalesce(v_eo.data_conclusao, public._agora()) at time zone 'America/Cuiaba')::date,
           data_revisao = v_dia, norma_utilizada = coalesce(norma_utilizada, v_norma)
     where id = v_res;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_resultados, '[]'::jsonb)) loop
    v_tab := v_item->>'tabela';
    if v_tab is null or v_tab !~ '^resultado_[a-z0-9_]+$'
       or not exists (select 1 from pg_tables where schemaname = 'public' and tablename = v_tab) then
      raise exception 'Tabela de resultado inválida: %', coalesce(v_tab, '(vazia)') using errcode = 'P0001';
    end if;
    execute format('delete from public.%I where resultado_id = $1', v_tab) using v_res;
    for v_linha in select * from jsonb_array_elements(coalesce(v_item->'linhas', '[]'::jsonb)) loop
      execute format(
        'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', v_tab, v_tab)
      using (v_linha - 'id' - 'resultado_id' - 'created_at')
            || jsonb_build_object('id', gen_random_uuid(), 'resultado_id', v_res, 'created_at', public._agora());
      v_qtd := v_qtd + 1;
    end loop;
  end loop;

  update public.ensaios_os
     set status                = 'aprovado',
         aprovado_por_id       = v_me,
         aprovado_em           = public._agora(),
         resultado_id          = v_res,
         dados_resultado       = coalesce(p_dados, dados_resultado),
         visivel_campo         = coalesce(p_visivel_campo, visivel_campo),
         assinatura_calculista = jsonb_build_object('usuario_id', v_me, 'nome', v_user.nome, 'em', p_assinado_em)
   where id = p_ensaio_os_id
  returning * into v_eo;

  update public.pedidos_ensaio
     set historico = coalesce(historico, '[]'::jsonb)
                     || jsonb_build_array(public._evento('Ensaio aprovado',
                          jsonb_build_object('ensaio', v_eo.nome_ensaio, 'linhas_resultado', v_qtd,
                                             'conformidade', p_conformidade)))
   where id = v_eo.pedido_id;

  perform public._fim_representacao();
  return v_eo;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Excluir pedido e alterar número (somente DEV)
-- -----------------------------------------------------------------------------
-- Exclui o pedido e tudo o que depende dele: ensaios da O.S., resultados
-- (resultados + resultado_*), fichas FR-IMOB-04/05. Usuários, empresas e
-- catálogo não são tocados. O contador não volta (números excluídos ficam livres
-- para lançamento manual). A exclusão fica registrada em audit_log com uma cópia
-- completa do que foi apagado (acao = 'EXCLUSAO_PEDIDO').
create or replace function public.excluir_pedido(p_pedido_id uuid, p_confirmacao text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_p     public.pedidos_ensaio;
  v_num   text;
  v_conf  text := upper(trim(coalesce(p_confirmacao, '')));
  v_eos   jsonb;
  v_res   jsonb;
  v_qtd_e integer;
  v_qtd_r integer;
begin
  if not public.eh_dev_real() then
    raise exception 'Somente o DEV pode excluir pedidos.' using errcode = 'P0001';
  end if;

  select * into v_p from public.pedidos_ensaio where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;

  v_num := 'PE-' || coalesce(v_p.ano::text, '?') || '-' || coalesce(v_p.numero_pe, '?');
  if v_conf = '' or v_conf not in (upper(v_num), coalesce(v_p.numero_pe, '#'),
                                   coalesce(v_p.sequencial::text, '#')) then
    raise exception 'Confirmação não confere. Digite o número do pedido (%).', v_num using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb), count(*) into v_eos, v_qtd_e
    from public.ensaios_os e where e.pedido_id = p_pedido_id;
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), count(*) into v_res, v_qtd_r
    from public.resultados r where r.pedido_id = p_pedido_id;

  insert into public.audit_log (tabela, registro_id, acao, usuario_id, usuario_nome, dados_antes)
  values ('pedidos_ensaio', v_p.id, 'EXCLUSAO_PEDIDO', public.usuario_real_id(),
          (select nome from public.usuarios where id = public.usuario_real_id()),
          jsonb_build_object('pedido', to_jsonb(v_p), 'ensaios_os', v_eos, 'resultados', v_res,
                             'ficha_os', (select to_jsonb(f) from public.fichas_os f where f.id = v_p.ficha_os_id),
                             'ficha_sol', (select to_jsonb(f) from public.fichas_solicitacao f where f.id = v_p.ficha_sol_id)));

  delete from public.pedidos_ensaio where id = p_pedido_id;

  return jsonb_build_object('numero', v_num, 'ensaios', v_qtd_e, 'resultados', v_qtd_r);
end $$;

-- Corrige o número do PE (e o final do número da O.S., que é o mesmo sequencial).
create or replace function public.alterar_numero_pe(p_pedido_id uuid, p_sequencial integer)
returns public.pedidos_ensaio
language plpgsql security definer
set search_path = public
as $$
declare
  v_p   public.pedidos_ensaio;
  v_old text;
  v_new text;
  v_os  text;
begin
  if not public.eh_dev_real() then
    raise exception 'Somente o DEV pode alterar o número do pedido.' using errcode = 'P0001';
  end if;
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if p_sequencial is null or p_sequencial < 1 or p_sequencial > 9999 then
    raise exception 'O número do PE deve estar entre 1 e 9999.' using errcode = 'P0001';
  end if;
  if p_sequencial = v_p.sequencial then return v_p; end if;
  if exists (select 1 from public.pedidos_ensaio
              where ano = v_p.ano and sequencial = p_sequencial and id <> v_p.id) then
    raise exception 'O PE-%-% já existe no sistema.', v_p.ano, lpad(p_sequencial::text, 4, '0') using errcode = 'P0001';
  end if;

  v_old := lpad(coalesce(v_p.sequencial, 0)::text, 4, '0');
  v_new := lpad(p_sequencial::text, 4, '0');
  v_os  := case when v_p.numero_os is not null and v_p.numero_os not like 'PROV-%'
                then regexp_replace(v_p.numero_os, '\d{4}$', v_new) else v_p.numero_os end;

  update public.pedidos_ensaio
     set sequencial = p_sequencial,
         numero_pe  = v_new,
         numero_os  = v_os,
         historico  = coalesce(historico, '[]'::jsonb) || jsonb_build_array(
                        public._evento('Número do PE alterado', jsonb_build_object(
                          'de', 'PE-' || v_p.ano || '-' || v_old, 'para', 'PE-' || v_p.ano || '-' || v_new)))
   where id = p_pedido_id
  returning * into v_p;

  update public.fichas_os
     set numero_os = coalesce(v_os, numero_os),
         observacao = replace(observacao, 'N° ' || v_old || '/' || v_p.ano, 'N° ' || v_new || '/' || v_p.ano)
   where pedido_id = p_pedido_id;
  update public.fichas_solicitacao
     set observacao = replace(observacao, 'N° ' || v_old || '/' || v_p.ano, 'N° ' || v_new || '/' || v_p.ano)
   where pedido_id = p_pedido_id;

  insert into public.contadores_pedido as c (ano, ultimo) values (v_p.ano, p_sequencial)
  on conflict (ano) do update set ultimo = greatest(c.ultimo, excluded.ultimo);

  return v_p;
end $$;

-- -----------------------------------------------------------------------------
-- 7. Permissões
-- -----------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'usuario_real_id()', 'eh_dev_real()', 'usuario_atual_id()',
    'assumir_pedido(uuid)', 'adicionar_historico(uuid, jsonb)', 'gerar_os(uuid, date, text)',
    'transferir_os(uuid, uuid, text)', 'finalizar_os(uuid, timestamptz)',
    'iniciar_ensaio(uuid)', 'salvar_rascunho_ensaio(uuid, jsonb)',
    'enviar_para_revisao(uuid, jsonb, timestamptz)', 'salvar_revisao_ensaio(uuid, jsonb)',
    'aprovar_ensaio(uuid, jsonb, jsonb, text, text, boolean, timestamptz)',
    'excluir_pedido(uuid, text)', 'alterar_numero_pe(uuid, integer)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- funções internas: sem acesso direto pelo app
  foreach f in array array[
    '_representar(public.pedidos_ensaio, uuid, timestamptz, text)',
    '_representar_executor(uuid, timestamptz)', '_representar_revisor(uuid, timestamptz)',
    '_fim_representacao()', '_agora()', '_meio_dia(date)',
    '_ensaio_do_executor(uuid)', '_ensaio_do_revisor(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- PostgREST: recarrega a lista de funções (finalizar_os ganhou um parâmetro)
notify pgrst, 'reload schema';

commit;

-- Fim da migração 14.
