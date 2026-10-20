-- =============================================================================
-- CNRO Lab Control — Migração 30: reabrir O.S. finalizada
-- =============================================================================
-- Pré-requisito: migração 14. Rodar no SQL Editor ANTES de publicar o app. Idempotente.
-- Decisões de 20/10/2026:
--  • O laboratorista responsável SOLICITA a reabertura (motivo obrigatório); o Gestor AUTORIZA
--    ou RECUSA (com motivo). O Gestor também pode reabrir direto.
--    Lançamento histórico: só o DEV reabre (e só ele edita, como sempre).
--  • Reabrir: a O.S. volta ao laboratorista ("Em andamento", selo "Reaberta"). A finalização
--    anterior é desconsiderada (assinatura/data de finalização apagadas); é preciso finalizar e
--    assinar de novo. Ensaios aprovados continuam aprovados; resultados continuam visíveis ao campo.
--  • Enquanto reaberta: dados do pedido editáveis (como antes da O.S.) e TODAS as datas —
--    data da solicitação, data da O.S. (o nº da O.S. muda junto, mantendo lote e sequencial)
--    e as datas de cada ensaio (atribuição, início, envio, aprovação).
--    Única trava: a data da solicitação não pode mudar de ano (o ano é parte do nº do PE).
--  • Empresa/lote alterados → FR-IMOB-04/05 acompanham (se ninguém mudou o campo à mão na ficha).
--  • Tudo vai para o histórico do pedido.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Colunas
-- -----------------------------------------------------------------------------
alter table public.pedidos_ensaio add column if not exists reabertura_solicitada_em  timestamptz;
alter table public.pedidos_ensaio add column if not exists reabertura_solicitada_por uuid references public.usuarios(id);
alter table public.pedidos_ensaio add column if not exists reabertura_motivo         text;
alter table public.pedidos_ensaio add column if not exists reaberta_em               timestamptz;
alter table public.pedidos_ensaio add column if not exists reaberta_por              uuid references public.usuarios(id);
alter table public.pedidos_ensaio add column if not exists reaberta_motivo           text;

comment on column public.pedidos_ensaio.reabertura_solicitada_em is 'Reabertura pedida pelo laboratorista, aguardando o Gestor (migração 30).';
comment on column public.pedidos_ensaio.reaberta_em is 'Última reabertura da O.S. (migração 30). Com a O.S. aberta, libera a edição do pedido e das datas.';

-- -----------------------------------------------------------------------------
-- 2. Guarda do pedido: O.S. finalizada só muda pelas funções de reabertura (laboratorista)
-- -----------------------------------------------------------------------------
create or replace function public.tg_pedido_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;  -- SQL Editor / service_role (manutenção)
  if not public.eh_gestor() then
    -- O.S. finalizada é imutável (só Gestor/Dev reabrem; o laboratorista só pede — migração 30)
    if old.status = 'concluido' and coalesce(current_setting('cnro.reabertura', true), '') <> 'on' then
      raise exception 'O.S. finalizada: somente o Gestor pode reabrir.' using errcode = 'P0001';
    end if;
    -- Finalizar apenas pela função finalizar_os (que valida os ensaios)
    if new.status = 'concluido' and old.status <> 'concluido'
       and coalesce(current_setting('cnro.finalizando', true), '') <> 'on' then
      raise exception 'Use a ação "Finalizar O.S." para concluir.' using errcode = 'P0001';
    end if;
    -- Numeração não pode ser alterada pelo app
    new.numero_pe  := old.numero_pe;
    new.sequencial := old.sequencial;
    new.ano        := old.ano;
    -- reabertura e datas: só pelas funções (migração 30)
    if coalesce(current_setting('cnro.reabertura', true), '') <> 'on' then
      new.reabertura_solicitada_em  := old.reabertura_solicitada_em;
      new.reabertura_solicitada_por := old.reabertura_solicitada_por;
      new.reabertura_motivo         := old.reabertura_motivo;
      new.reaberta_em               := old.reaberta_em;
      new.reaberta_por              := old.reaberta_por;
      new.reaberta_motivo           := old.reaberta_motivo;
    end if;
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Solicitar / recusar / reabrir
-- -----------------------------------------------------------------------------
create or replace function public.solicitar_reabertura_os(p_pedido_id uuid, p_motivo text)
returns public.pedidos_ensaio
language plpgsql security definer
set search_path = public
as $$
declare
  v_p  public.pedidos_ensaio;
  v_me uuid := public.usuario_atual_id();
begin
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if v_p.status <> 'concluido' then
    raise exception 'Só é possível pedir a reabertura de uma O.S. finalizada.' using errcode = 'P0001';
  end if;
  if v_p.lancamento_historico then
    raise exception 'Lançamento histórico: somente o DEV reabre.' using errcode = 'P0001';
  end if;
  if not (public.eh_gestor() or (public.eh_lab() and v_p.laboratorista_id = v_me)) then
    raise exception 'Somente o laboratorista responsável pode pedir a reabertura.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da reabertura.' using errcode = 'P0001';
  end if;
  if v_p.reabertura_solicitada_em is not null then
    raise exception 'A reabertura desta O.S. já foi pedida e aguarda o Gestor.' using errcode = 'P0001';
  end if;

  perform set_config('cnro.reabertura', 'on', true);
  update public.pedidos_ensaio
     set reabertura_solicitada_em  = now(),
         reabertura_solicitada_por = v_me,
         reabertura_motivo         = trim(p_motivo),
         historico = coalesce(historico, '[]'::jsonb) || jsonb_build_array(
                       public._evento('Reabertura solicitada', jsonb_build_object('motivo', trim(p_motivo))))
   where id = p_pedido_id
  returning * into v_p;
  perform set_config('cnro.reabertura', 'off', true);
  return v_p;
end $$;

create or replace function public.recusar_reabertura_os(p_pedido_id uuid, p_motivo text)
returns public.pedidos_ensaio
language plpgsql security definer
set search_path = public
as $$
declare
  v_p public.pedidos_ensaio;
begin
  if not public.eh_gestor() then
    raise exception 'Somente o Gestor decide a reabertura.' using errcode = 'P0001';
  end if;
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if v_p.reabertura_solicitada_em is null then
    raise exception 'Não há pedido de reabertura para esta O.S.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da recusa.' using errcode = 'P0001';
  end if;

  perform set_config('cnro.reabertura', 'on', true);
  update public.pedidos_ensaio
     set reabertura_solicitada_em = null, reabertura_solicitada_por = null, reabertura_motivo = null,
         historico = coalesce(historico, '[]'::jsonb) || jsonb_build_array(
                       public._evento('Reabertura recusada', jsonb_build_object(
                         'motivo', trim(p_motivo), 'pedido_motivo', v_p.reabertura_motivo)))
   where id = p_pedido_id
  returning * into v_p;
  perform set_config('cnro.reabertura', 'off', true);
  return v_p;
end $$;

create or replace function public.reabrir_os(p_pedido_id uuid, p_motivo text default null)
returns public.pedidos_ensaio
language plpgsql security definer
set search_path = public
as $$
declare
  v_p      public.pedidos_ensaio;
  v_motivo text;
  v_status text;
begin
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if v_p.lancamento_historico then
    if not public.eh_dev_real() then
      raise exception 'Lançamento histórico: somente o DEV reabre.' using errcode = 'P0001';
    end if;
  elsif not public.eh_gestor() then
    raise exception 'Somente o Gestor reabre uma O.S. finalizada.' using errcode = 'P0001';
  end if;
  if v_p.status <> 'concluido' then
    raise exception 'Esta O.S. não está finalizada.' using errcode = 'P0001';
  end if;
  v_motivo := coalesce(nullif(trim(p_motivo), ''), v_p.reabertura_motivo);
  if v_motivo is null then
    raise exception 'Informe o motivo da reabertura.' using errcode = 'P0001';
  end if;

  v_status := case when exists (select 1 from public.ensaios_os
                                 where pedido_id = p_pedido_id and status = 'aguardando_revisao')
                   then 'aguardando_revisao' else 'em_andamento' end;

  perform set_config('cnro.reabertura', 'on', true);
  update public.pedidos_ensaio
     set status          = v_status,
         finalizado_por  = null,
         finalizado_em   = null,
         revisado_por_id = null,
         revisado_em     = null,
         reaberta_em     = now(),
         reaberta_por    = public.usuario_atual_id(),
         reaberta_motivo = v_motivo,
         reabertura_solicitada_em = null, reabertura_solicitada_por = null, reabertura_motivo = null,
         historico = coalesce(historico, '[]'::jsonb) || jsonb_build_array(
                       public._evento('O.S. reaberta', jsonb_build_object(
                         'motivo', v_motivo,
                         'pedido_por', (select nome from public.usuarios where id = v_p.reabertura_solicitada_por),
                         'finalizacao_desconsiderada', jsonb_build_object(
                           'por', (select nome from public.usuarios where id = v_p.finalizado_por),
                           'em', v_p.finalizado_em))))
   where id = p_pedido_id
  returning * into v_p;
  perform set_config('cnro.reabertura', 'off', true);

  -- FR-IMOB-04: fim dos ensaios e análise são recalculados na nova finalização
  if v_p.ficha_os_id is not null then
    update public.fichas_os set fim_ensaios = null, analise_ensaios = null where id = v_p.ficha_os_id;
  end if;
  return v_p;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Datas (só com a O.S. reaberta e aberta)
-- -----------------------------------------------------------------------------
create or replace function public._reaberta_editavel(p_p public.pedidos_ensaio)
returns void
language plpgsql stable security definer
set search_path = public
as $$
begin
  if p_p.reaberta_em is null or p_p.status not in ('em_andamento', 'aguardando_revisao') then
    raise exception 'As datas só podem ser alteradas com a O.S. reaberta.' using errcode = 'P0001';
  end if;
  if p_p.lancamento_historico then
    if not public.eh_dev_real() then
      raise exception 'Lançamento histórico: somente o DEV pode alterar este pedido.' using errcode = 'P0001';
    end if;
  elsif not (public.eh_gestor() or p_p.laboratorista_id = public.usuario_atual_id()) then
    raise exception 'Somente o laboratorista responsável ou o Gestor podem alterar as datas.' using errcode = 'P0001';
  end if;
end $$;

-- Data da solicitação (created_at) e data da O.S. (data_validacao → nº da O.S.)
create or replace function public.alterar_datas_os(p_pedido_id uuid, p_data_solicitacao timestamptz, p_data_os date)
returns public.pedidos_ensaio
language plpgsql security definer
set search_path = public
as $$
declare
  v_p     public.pedidos_ensaio;
  v_num   text;
  v_extra jsonb := '{}'::jsonb;
begin
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  perform public._reaberta_editavel(v_p);

  if p_data_solicitacao is null or p_data_os is null then
    raise exception 'Informe a data da solicitação e a data da O.S.' using errcode = 'P0001';
  end if;
  if p_data_solicitacao > now() + interval '12 hours' or p_data_os > (now() at time zone 'America/Cuiaba')::date then
    raise exception 'As datas não podem ser futuras.' using errcode = 'P0001';
  end if;
  if extract(year from p_data_solicitacao at time zone 'America/Cuiaba')::int <> v_p.ano then
    raise exception 'A data da solicitação precisa ficar em %, o ano do PE. Para mudar o ano, peça ao DEV ("Alterar nº").', v_p.ano
      using errcode = 'P0001';
  end if;
  if p_data_os < (p_data_solicitacao at time zone 'America/Cuiaba')::date then
    raise exception 'A data da O.S. não pode ser anterior à data da solicitação.' using errcode = 'P0001';
  end if;

  v_num := case when v_p.numero_os ~ '^\d{4}\.\d{2}\.\d{2}\.'
                then regexp_replace(v_p.numero_os, '^\d{4}\.\d{2}\.\d{2}', to_char(p_data_os, 'YYYY.MM.DD'))
                else v_p.numero_os end;
  if v_num is distinct from v_p.numero_os
     and exists (select 1 from public.pedidos_ensaio where numero_os = v_num and id <> v_p.id) then
    raise exception 'Já existe a O.S. % no sistema.', v_num using errcode = 'P0001';
  end if;

  if p_data_solicitacao is distinct from v_p.created_at then
    v_extra := v_extra || jsonb_build_object('data_solicitacao', jsonb_build_object('de', v_p.created_at, 'para', p_data_solicitacao));
  end if;
  if p_data_os is distinct from v_p.data_validacao then
    v_extra := v_extra || jsonb_build_object('data_os', jsonb_build_object('de', v_p.data_validacao, 'para', p_data_os));
  end if;
  if v_num is distinct from v_p.numero_os then
    v_extra := v_extra || jsonb_build_object('numero_os', jsonb_build_object('de', v_p.numero_os, 'para', v_num));
  end if;
  if v_extra = '{}'::jsonb then return v_p; end if;

  perform set_config('cnro.reabertura', 'on', true);
  update public.pedidos_ensaio
     set created_at     = p_data_solicitacao,
         data_validacao = p_data_os,
         numero_os      = v_num,
         historico = coalesce(historico, '[]'::jsonb) || jsonb_build_array(public._evento('Datas da O.S. alteradas', v_extra))
   where id = p_pedido_id
  returning * into v_p;
  perform set_config('cnro.reabertura', 'off', true);

  update public.fichas_os
     set numero_os = v_num,
         data_solicitacao = (p_data_solicitacao at time zone 'America/Cuiaba')::date
   where pedido_id = p_pedido_id;
  return v_p;
end $$;

-- Datas de um ensaio da O.S. (atribuição, início, envio = conclusão, aprovação) — acompanham as
-- datas das assinaturas na ficha e as datas do resultado (execução, revisão)
create or replace function public.alterar_datas_ensaio(
  p_ensaio_os_id uuid, p_atribuicao timestamptz, p_inicio timestamptz, p_envio timestamptz, p_aprovacao timestamptz)
returns public.ensaios_os
language plpgsql security definer
set search_path = public
as $$
declare
  v_eo    public.ensaios_os;
  v_p     public.pedidos_ensaio;
  v_extra jsonb := '{}'::jsonb;
  v_ant   timestamptz;
  v_d     timestamptz;
begin
  select * into v_eo from public.ensaios_os where id = p_ensaio_os_id for update;
  if not found then raise exception 'Ensaio não encontrado.' using errcode = 'P0001'; end if;
  select * into v_p from public.pedidos_ensaio where id = v_eo.pedido_id for update;
  perform public._reaberta_editavel(v_p);

  -- ordem: atribuição ≤ início ≤ envio ≤ aprovação; nenhuma no futuro
  v_ant := null;
  foreach v_d in array array[p_atribuicao, p_inicio, p_envio, p_aprovacao] loop
    if v_d is null then continue; end if;
    if v_d > now() + interval '12 hours' then
      raise exception 'As datas não podem ser futuras.' using errcode = 'P0001';
    end if;
    if v_ant is not null and v_d < v_ant then
      raise exception 'As datas precisam seguir a ordem: atribuição, início, envio, aprovação.' using errcode = 'P0001';
    end if;
    v_ant := v_d;
  end loop;
  if p_aprovacao is not null and v_eo.status <> 'aprovado' then
    raise exception 'Este ensaio ainda não foi aprovado.' using errcode = 'P0001';
  end if;

  if p_atribuicao is distinct from v_eo.data_atribuicao then
    v_extra := v_extra || jsonb_build_object('atribuicao', jsonb_build_object('de', v_eo.data_atribuicao, 'para', p_atribuicao)); end if;
  if p_inicio is distinct from v_eo.iniciado_em then
    v_extra := v_extra || jsonb_build_object('inicio', jsonb_build_object('de', v_eo.iniciado_em, 'para', p_inicio)); end if;
  if p_envio is distinct from coalesce(v_eo.enviado_em, v_eo.data_conclusao) then
    v_extra := v_extra || jsonb_build_object('envio', jsonb_build_object('de', coalesce(v_eo.enviado_em, v_eo.data_conclusao), 'para', p_envio)); end if;
  if p_aprovacao is distinct from v_eo.aprovado_em then
    v_extra := v_extra || jsonb_build_object('aprovacao', jsonb_build_object('de', v_eo.aprovado_em, 'para', p_aprovacao)); end if;
  if v_extra = '{}'::jsonb then return v_eo; end if;

  update public.ensaios_os
     set data_atribuicao = p_atribuicao,
         iniciado_em     = p_inicio,
         enviado_em      = p_envio,
         data_conclusao  = p_envio,
         aprovado_em     = p_aprovacao,
         assinatura_executor = case when assinatura_executor is not null and p_envio is not null
                                    then jsonb_set(assinatura_executor, '{em}', to_jsonb(p_envio)) else assinatura_executor end,
         assinatura_calculista = case when assinatura_calculista is not null and p_aprovacao is not null
                                      then jsonb_set(assinatura_calculista, '{em}', to_jsonb(p_aprovacao)) else assinatura_calculista end
   where id = p_ensaio_os_id
  returning * into v_eo;

  update public.resultados
     set data_execucao = coalesce((p_envio at time zone 'America/Cuiaba')::date, data_execucao),
         data_revisao  = coalesce((p_aprovacao at time zone 'America/Cuiaba')::date, data_revisao)
   where id = v_eo.resultado_id or ensaio_os_id = v_eo.id;

  perform set_config('cnro.reabertura', 'on', true);
  update public.pedidos_ensaio
     set historico = coalesce(historico, '[]'::jsonb) || jsonb_build_array(public._evento('Datas do ensaio alteradas',
                       v_extra || jsonb_build_object('ensaio', v_eo.nome_ensaio)))
   where id = v_p.id;
  perform set_config('cnro.reabertura', 'off', true);
  return v_eo;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Empresa/lote do pedido → FR-IMOB-04 e FR-IMOB-05 (se o campo da ficha ainda é o antigo)
-- -----------------------------------------------------------------------------
create or replace function public.tg_pedido_fichas_obra()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_old text := coalesce(old.empresa, (select nome from public.empresas where id = old.empresa_id));
  v_new text := coalesce(new.empresa, (select nome from public.empresas where id = new.empresa_id));
begin
  if v_new is distinct from v_old and v_new is not null then
    update public.fichas_os          set obra = v_new where pedido_id = new.id and (obra is null or obra = v_old);
    update public.fichas_solicitacao set obra = v_new where pedido_id = new.id and (obra is null or obra = v_old);
  end if;
  if new.lote is distinct from old.lote and new.lote is not null then
    update public.fichas_os          set lote = new.lote where pedido_id = new.id and (lote is null or lote = old.lote);
    update public.fichas_solicitacao set lote = new.lote where pedido_id = new.id and (lote is null or lote = old.lote);
  end if;
  return null;
end $$;

drop trigger if exists z40_pedido_fichas_obra on public.pedidos_ensaio;
create trigger z40_pedido_fichas_obra
  after update of empresa, empresa_id, lote on public.pedidos_ensaio
  for each row execute function public.tg_pedido_fichas_obra();

-- -----------------------------------------------------------------------------
-- 6. Permissões
-- -----------------------------------------------------------------------------
revoke all on function public.solicitar_reabertura_os(uuid, text) from public, anon;
revoke all on function public.recusar_reabertura_os(uuid, text) from public, anon;
revoke all on function public.reabrir_os(uuid, text) from public, anon;
revoke all on function public.alterar_datas_os(uuid, timestamptz, date) from public, anon;
revoke all on function public.alterar_datas_ensaio(uuid, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.solicitar_reabertura_os(uuid, text) to authenticated;
grant execute on function public.recusar_reabertura_os(uuid, text) to authenticated;
grant execute on function public.reabrir_os(uuid, text) to authenticated;
grant execute on function public.alterar_datas_os(uuid, timestamptz, date) to authenticated;
grant execute on function public.alterar_datas_ensaio(uuid, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;

commit;
