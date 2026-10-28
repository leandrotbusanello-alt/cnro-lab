-- =============================================================================
-- CNRO Lab Control — Migração 36: permissão "Pode lançar histórico"
-- =============================================================================
-- Pré-requisitos: migrações até a 35. Rodar no SQL Editor do Supabase.
-- Idempotente e numa única transação.
--
-- Até aqui só o DEV fazia lançamento histórico (migração 14). Agora o DEV pode
-- liberar essa permissão para usuários escolhidos (usuarios.pode_lancar_historico).
--
-- Quem tem a permissão:
--   • cria pedidos históricos (com o número original do PE) e faz o fluxo completo
--     — O.S., execução, revisão, aprovação e finalização — em nome das pessoas reais;
--   • vê todos os pedidos históricos;
--   • a auditoria grava quem digitou (usuario_id) e em nome de quem (em_nome_de).
-- Continuam só do DEV: ligar/desligar a permissão, Excluir pedido, Alterar nº
-- e Reabrir O.S. histórica finalizada.
-- O trabalho normal da pessoa (pedidos não históricos) não muda.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Coluna e função de permissão
-- -----------------------------------------------------------------------------
alter table public.usuarios
  add column if not exists pode_lancar_historico boolean not null default false;

-- Usuário logado (real, nunca o representado) pode lançar histórico?
create or replace function public.eh_lancador_historico()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select upper(u.perfil) = 'DEV' or u.pode_lancar_historico
                     from public.usuarios u
                    where u.id = public.usuario_real_id()), false)
$$;

-- Pedido histórico visível/editável para quem lança histórico
create or replace function public._historico_do_lancador(p_pedido_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.eh_lancador_historico()
     and exists (select 1 from public.pedidos_ensaio
                  where id = p_pedido_id and lancamento_historico)
$$;

grant execute on function public.eh_lancador_historico(), public._historico_do_lancador(uuid) to authenticated;

-- Só o DEV liga ou desliga a permissão
create or replace function public.tg_usuario_lancador_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;   -- SQL Editor / service_role
  if tg_op = 'INSERT' then
    if coalesce(new.pode_lancar_historico, false) and not public.eh_dev_real() then
      raise exception 'Somente o DEV pode liberar o lançamento histórico.' using errcode = 'P0001';
    end if;
  elsif new.pode_lancar_historico is distinct from old.pode_lancar_historico and not public.eh_dev_real() then
    raise exception 'Somente o DEV pode liberar o lançamento histórico.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists a32_usuario_lancador_guard on public.usuarios;
create trigger a32_usuario_lancador_guard
  before insert or update on public.usuarios
  for each row execute function public.tg_usuario_lancador_guard();

-- -----------------------------------------------------------------------------
-- 2. Regras do histórico: "DEV" passa a ser "DEV ou quem tem a permissão"
--    (Excluir, Alterar nº e Reabrir continuam com eh_dev_real)
-- -----------------------------------------------------------------------------

create or replace function public.usuario_atual_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
           when nullif(current_setting('cnro.agir_como', true), '') is not null and public.eh_lancador_historico()
             then nullif(current_setting('cnro.agir_como', true), '')::uuid
           else public.usuario_real_id()
         end
$function$
;

create or replace function public._representar(p_pedido pedidos_ensaio, p_pessoa uuid, p_data timestamp with time zone DEFAULT NULL::timestamp with time zone, p_papel text DEFAULT 'responsável'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform set_config('cnro.agir_como', '', true);
  perform set_config('cnro.data_ref', '', true);

  if p_pedido.id is null or not coalesce(p_pedido.lancamento_historico, false) then
    return;
  end if;
  if auth.uid() is null then return; end if;   -- SQL Editor / manutenção

  if not public.eh_lancador_historico() then
    raise exception 'Lançamento histórico: somente quem tem a permissão de lançar histórico pode alterar este pedido.' using errcode = 'P0001';
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
end $function$
;

create or replace function public.tg_pedido_historico()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lab public.usuarios;
  v_sol public.usuarios;
begin
  if tg_op = 'UPDATE' then
    -- a marcação não muda depois de criada
    new.lancamento_historico := old.lancamento_historico;
    new.lancado_por          := old.lancado_por;
    if old.lancamento_historico and auth.uid() is not null and not public.eh_lancador_historico() then
      raise exception 'Lançamento histórico: somente quem tem a permissão de lançar histórico pode alterar este pedido.' using errcode = 'P0001';
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

  if not public.eh_lancador_historico() then
    raise exception 'Somente o DEV ou quem tem a permissão de lançar histórico pode criar lançamentos históricos.' using errcode = 'P0001';
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
end $function$
;

create or replace function public.tg_pedido_numero_pe()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ano    integer := extract(year from (coalesce(new.created_at, now()) at time zone 'America/Cuiaba'))::int;
  v_seq    integer;
  v_manual integer;
begin
  if new.sequencial is not null and (auth.uid() is null or public.eh_dev_real()
                                   or (coalesce(new.lancamento_historico, false) and public.eh_lancador_historico())) then
    v_manual := new.sequencial;
  end if;

  if v_manual is not null then
    if v_manual < 1 or v_manual > 99999 then
      raise exception 'O número do PE deve estar entre 1 e 99999.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.pedidos_ensaio where ano = v_ano and sequencial = v_manual) then
      raise exception 'O pedido %/% já existe no sistema.', public._fmt_seq(v_manual), v_ano using errcode = 'P0001';
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
  new.numero_pe  := public._fmt_seq(v_seq);
  return new;
end $function$
;

create or replace function public.tg_ensaio_os_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if coalesce(v_ped.lancamento_historico, false) and not public.eh_lancador_historico() then
    raise exception 'Lançamento histórico: somente quem tem a permissão de lançar histórico pode alterar este pedido.' using errcode = 'P0001';
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

    v_eh_resp := public.eh_gestor() or v_ped.laboratorista_id = public.usuario_atual_id()
                 -- histórico: quem lança age como o responsável (migração 36)
                 or (coalesce(v_ped.lancamento_historico, false) and public.eh_lancador_historico());
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
end $function$
;

create or replace function public._reaberta_editavel(p_p pedidos_ensaio)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_p.reaberta_em is null or p_p.status not in ('em_andamento', 'aguardando_revisao') then
    raise exception 'As datas só podem ser alteradas com a O.S. reaberta.' using errcode = 'P0001';
  end if;
  if p_p.lancamento_historico then
    if not public.eh_lancador_historico() then
      raise exception 'Lançamento histórico: somente quem tem a permissão de lançar histórico pode alterar este pedido.' using errcode = 'P0001';
    end if;
  elsif not (public.eh_gestor() or p_p.laboratorista_id = public.usuario_atual_id()) then
    raise exception 'Somente o laboratorista responsável ou o Gestor podem alterar as datas.' using errcode = 'P0001';
  end if;
end $function$
;

create or replace function public._pode_editar_fichas(p_pedido pedidos_ensaio)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
           public.eh_gestor()
           or (coalesce(p_pedido.lancamento_historico, false) and public.eh_lancador_historico()
               and p_pedido.status not in ('concluido','cancelado'))
           or (public.eh_lab()
               and p_pedido.status not in ('concluido','cancelado')
               and p_pedido.laboratorista_id is not null
               and p_pedido.laboratorista_id = public.usuario_atual_id()),
           false)
$function$
;

create or replace function public.previa_ficha_os(p_pedido_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_p public.pedidos_ensaio;
  v_data date;
begin
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if not (public.eh_lab() or (v_p.lancamento_historico and public.eh_lancador_historico())) then
    raise exception 'Apenas o laboratório pode abrir a O.S.' using errcode = 'P0001';
  end if;
  v_data := (v_p.created_at at time zone 'America/Cuiaba')::date;
  return jsonb_build_object(
    'data_solicitacao', v_data,
    'previsao_entrega', v_data + 60,
    'obra',             coalesce(v_p.empresa, (select nome from public.empresas where id = v_p.empresa_id)),
    'lote',             v_p.lote,
    'solicitante',      (select nome from public.usuarios where id = v_p.solicitante_id),
    'contato',          public._contato_lab_padrao(),
    'observacao',       public.gerar_observacao_os(v_p.id),
    'marcados',         public._fichas_os_marcados(v_p)
  );
end $function$
;

-- -----------------------------------------------------------------------------
-- 3. Acesso às tabelas (RLS): pedidos históricos para quem lança histórico
-- -----------------------------------------------------------------------------
drop policy if exists pedidos_ensaio_select on public.pedidos_ensaio;
create policy pedidos_ensaio_select on public.pedidos_ensaio for select to authenticated
  using ((select public.eh_equipe_lab())
         or solicitante_id = (select public.usuario_atual_id())
         or (lancamento_historico and (select public.eh_lancador_historico())));

drop policy if exists pedidos_insert on public.pedidos_ensaio;
create policy pedidos_insert on public.pedidos_ensaio for insert to authenticated
  with check (solicitante_id = public.usuario_atual_id()
              or public.eh_lab()
              or (lancamento_historico and public.eh_lancador_historico()));

drop policy if exists pedidos_update on public.pedidos_ensaio;
create policy pedidos_update on public.pedidos_ensaio for update to authenticated
  using (public.eh_gestor()
         or (public.eh_lab() and laboratorista_id = public.usuario_atual_id())
         or (solicitante_id = public.usuario_atual_id() and status = 'devolvido_campo')
         or (lancamento_historico and public.eh_lancador_historico()))
  with check (public.eh_gestor()
              or (public.eh_lab() and laboratorista_id = public.usuario_atual_id())
              or (solicitante_id = public.usuario_atual_id() and status in ('devolvido_campo', 'aguardando_lab'))
              or (lancamento_historico and public.eh_lancador_historico()));

drop policy if exists ensaios_os_select on public.ensaios_os;
create policy ensaios_os_select on public.ensaios_os for select to authenticated
  using ((select public.eh_equipe_lab())
         or public._ensaio_liberado_para_mim(id)
         or public._historico_do_lancador(pedido_id));

drop policy if exists ensaios_os_insert on public.ensaios_os;
create policy ensaios_os_insert on public.ensaios_os for insert to authenticated
  with check (public.eh_gestor()
              or exists (select 1 from public.pedidos_ensaio p
                          where p.id = ensaios_os.pedido_id and p.laboratorista_id = public.usuario_atual_id())
              or public._historico_do_lancador(pedido_id));

drop policy if exists ensaios_os_update on public.ensaios_os;
create policy ensaios_os_update on public.ensaios_os for update to authenticated
  using (public.eh_gestor()
         or assistente_id = public.usuario_atual_id()
         or exists (select 1 from public.pedidos_ensaio p
                     where p.id = ensaios_os.pedido_id and p.laboratorista_id = public.usuario_atual_id())
         or public._historico_do_lancador(pedido_id))
  with check (public.eh_gestor()
              or assistente_id = public.usuario_atual_id()
              or exists (select 1 from public.pedidos_ensaio p
                          where p.id = ensaios_os.pedido_id and p.laboratorista_id = public.usuario_atual_id())
              or public._historico_do_lancador(pedido_id));

drop policy if exists ensaios_os_delete on public.ensaios_os;
create policy ensaios_os_delete on public.ensaios_os for delete to authenticated
  using (public.eh_gestor()
         or exists (select 1 from public.pedidos_ensaio p
                     where p.id = ensaios_os.pedido_id and p.laboratorista_id = public.usuario_atual_id())
         or public._historico_do_lancador(pedido_id));

drop policy if exists resultados_select on public.resultados;
create policy resultados_select on public.resultados for select to authenticated
  using ((select public.eh_equipe_lab())
         or public._resultado_liberado_para_mim(id)
         or public._historico_do_lancador(pedido_id));

-- Assinaturas: quem lança histórico vê as assinaturas das pessoas que representa
drop policy if exists assinaturas_select on storage.objects;
create policy assinaturas_select on storage.objects for select to authenticated
  using (bucket_id = 'assinaturas'
         and (public.eh_equipe_lab()
              or public.eh_lancador_historico()
              or public._assinatura_liberada_para_mim(name)));

commit;

-- Conferência: quem tem a permissão
-- select nome, perfil, status from public.usuarios where pode_lancar_historico order by nome;
