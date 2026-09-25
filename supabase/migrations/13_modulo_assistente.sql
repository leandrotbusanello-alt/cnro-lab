-- =============================================================================
-- CNRO Lab Control — Migração 13: Módulo Assistente + fichas online
-- =============================================================================
-- Pré-requisitos: migrações 10, 11 e 12 (Módulo Gestor).
-- Rodar no SQL Editor do Supabase. Idempotente e numa única transação.
--
-- Conteúdo
--   1. Módulos por usuário (usuarios.modulos_acesso) e permissões derivadas
--   2. Modelos das fichas online (fichas_modelo), por revisão
--   3. Colunas novas em ensaios_os (modelo usado, assinaturas, datas)
--   4. Guardas do assistente (só por RPC; some da fila após enviar)
--   5. RPCs do assistente: iniciar, salvar rascunho, enviar para revisão
--   6. RPCs da revisão: salvar correções, aprovar (grava resultados/resultado_*)
--   7. Permissões de execução
--
-- Depois desta, rode 13b_fichas_modelo_carga.sql (modelos FR-IMOB-13, 22 e 33).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Módulos por usuário
-- -----------------------------------------------------------------------------
-- NULL ou vazio = padrão do perfil. Preenchido = exatamente estes módulos.
--   Padrões: DEV/GESTOR todos · LAB dashboard, campo, laboratorio, assistente
--            ASSIST assistente · CAMPO campo
-- Até existir o Módulo Gestor, altere pelo SQL Editor, por exemplo:
--   update usuarios set modulos_acesso = '{campo,laboratorio,assistente}' where email = '...';

alter table public.usuarios add column if not exists modulos_acesso text[];

alter table public.usuarios drop constraint if exists usuarios_modulos_acesso_check;
alter table public.usuarios add constraint usuarios_modulos_acesso_check
  check (modulos_acesso is null
         or modulos_acesso <@ array['dashboard','campo','laboratorio','assistente','gestor']::text[]);

create or replace function public.modulos_padrao(p_perfil text)
returns text[]
language sql immutable
as $$
  select case upper(coalesce(p_perfil, ''))
    when 'DEV'    then array['dashboard','campo','laboratorio','assistente','gestor']
    when 'GESTOR' then array['dashboard','campo','laboratorio','assistente','gestor']
    when 'LAB'    then array['dashboard','campo','laboratorio','assistente']
    when 'ASSIST' then array['assistente']
    when 'CAMPO'  then array['campo']
    else array[]::text[]
  end
$$;

create or replace function public.modulos_do_usuario(p_usuario_id uuid)
returns text[]
language sql stable security definer
set search_path = public
as $$
  select case
           when upper(u.perfil) in ('DEV','GESTOR') then public.modulos_padrao(u.perfil)
           when coalesce(cardinality(u.modulos_acesso), 0) > 0 then u.modulos_acesso
           else public.modulos_padrao(u.perfil)
         end
    from public.usuarios u
   where u.id = p_usuario_id
$$;

create or replace function public.tem_modulo(p_modulo text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(p_modulo = any(public.modulos_do_usuario(public.usuario_atual_id())), false)
$$;

-- Laboratorista = Gestor/Dev ou quem tem o módulo Laboratório
create or replace function public.eh_lab()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.eh_gestor() or public.tem_modulo('laboratorio')
$$;

-- Equipe do laboratório = laboratoristas + quem tem o módulo Assistente
create or replace function public.eh_equipe_lab()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.eh_lab() or public.tem_modulo('assistente')
$$;

-- Só o Gestor altera os módulos de alguém.
-- Trigger próprio (a31): não substitui o tg_usuario_guard, que a migração 12
-- (Módulo Gestor) redefine com a hierarquia de perfis.
create or replace function public.tg_usuario_modulos_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;  -- SQL Editor / service_role
  if new.modulos_acesso is distinct from old.modulos_acesso and not public.eh_gestor() then
    raise exception 'Somente o Gestor pode alterar os módulos de acesso.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists a31_usuario_modulos_guard on public.usuarios;
create trigger a31_usuario_modulos_guard
  before update on public.usuarios
  for each row execute function public.tg_usuario_modulos_guard();

-- -----------------------------------------------------------------------------
-- 2. Modelos das fichas online
-- -----------------------------------------------------------------------------
-- Cada linha é uma revisão de uma ficha (FR-IMOB-13 Rev00, Rev01…), gerada pelo
-- conversor (tools/fichas) a partir do Excel original e publicada pela equipe (DEV)
-- ou pelo SQL Editor (13b). O ensaio guarda o modelo
-- usado, então uma revisão nova não altera ensaios já feitos.

create table if not exists public.fichas_modelo (
  id              uuid primary key default gen_random_uuid(),
  ficha_ensaio_id uuid not null references public.fichas_ensaio(id) on delete cascade,
  codigo          text not null,
  versao          text not null,
  titulo          text,
  modelo          jsonb not null,                    -- grade, estilos, fórmulas e papéis das células
  mapa_resultados jsonb not null default '[]'::jsonb, -- como gerar as linhas de resultado_*
  motor           integer not null default 1,        -- versão do motor de fichas
  hash            text,
  ativo           boolean not null default true,
  publicado_em    timestamptz not null default now(),
  publicado_por   uuid references public.usuarios(id),
  created_at      timestamptz not null default now(),
  unique (ficha_ensaio_id, versao)
);

create index if not exists fichas_modelo_ficha_idx on public.fichas_modelo (ficha_ensaio_id, publicado_em desc);

alter table public.fichas_modelo enable row level security;
drop policy if exists fichas_modelo_select on public.fichas_modelo;
drop policy if exists fichas_modelo_manage on public.fichas_modelo;
-- Mesmas regras da migração 12: leitura só para usuário ativo; catálogo (fichas) só DEV.
create policy fichas_modelo_select on public.fichas_modelo for select to authenticated
  using ((select public.usuario_atual_id()) is not null);
create policy fichas_modelo_manage on public.fichas_modelo for all to authenticated
  using (public.eh_dev()) with check (public.eh_dev());

-- Modelo vigente de uma ficha = o ativo publicado por último
create or replace function public.modelo_vigente(p_ficha_ensaio_id uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select m.id from public.fichas_modelo m
   where m.ficha_ensaio_id = p_ficha_ensaio_id and m.ativo
   order by m.publicado_em desc
   limit 1
$$;

-- -----------------------------------------------------------------------------
-- 3. Colunas novas em ensaios_os
-- -----------------------------------------------------------------------------
alter table public.ensaios_os
  add column if not exists ficha_modelo_id       uuid references public.fichas_modelo(id),
  add column if not exists iniciado_em           timestamptz,
  add column if not exists rascunho_em           timestamptz,
  add column if not exists enviado_em            timestamptz,
  add column if not exists assinatura_executor   jsonb,   -- {usuario_id, nome, em}
  add column if not exists assinatura_calculista jsonb;   -- {usuario_id, nome, em}

create index if not exists ensaios_os_status_idx on public.ensaios_os (status);

-- -----------------------------------------------------------------------------
-- 4. Guardas
-- -----------------------------------------------------------------------------
-- Regras do executor (quem não é o laboratorista responsável nem Gestor):
--  • só altera o próprio ensaio, e somente pelas funções do assistente;
--  • depois de enviar para revisão, perde o acesso até o laboratorista devolver.
-- Ao devolver, as assinaturas são apagadas (a ficha precisa ser assinada de novo).

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

  if v_ped.status = 'concluido' and not public.eh_gestor() then
    raise exception 'O.S. finalizada: somente o Gestor pode reabrir.' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; end if;

  new.status := public._normalizar_status_ensaio(coalesce(new.status, 'pendente'));

  if tg_op = 'UPDATE' then
    new.updated_at := now();

    -- Devolução ao assistente: a ficha precisa ser assinada de novo.
    -- (Se já estava aprovada, o trigger z10_ensaio_os_apos da migração 10 tira o
    --  resultado do status "aprovado" — sai do Painel até ser aprovado outra vez.)
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

-- -----------------------------------------------------------------------------
-- 5. RPCs do assistente
-- -----------------------------------------------------------------------------

-- Busca e valida o ensaio do executor atual (uso interno)
create or replace function public._ensaio_do_executor(p_ensaio_os_id uuid)
returns public.ensaios_os
language plpgsql security definer
set search_path = public
as $$
declare
  v_eo  public.ensaios_os;
  v_ped public.pedidos_ensaio;
begin
  select * into v_eo from public.ensaios_os where id = p_ensaio_os_id for update;
  if not found then raise exception 'Ensaio não encontrado.' using errcode = 'P0001'; end if;
  if v_eo.assistente_id is distinct from public.usuario_atual_id() then
    raise exception 'Este ensaio não está atribuído a você.' using errcode = 'P0001';
  end if;
  select * into v_ped from public.pedidos_ensaio where id = v_eo.pedido_id;
  if v_ped.status = 'concluido' then
    raise exception 'O.S. finalizada.' using errcode = 'P0001';
  end if;
  if v_eo.status in ('aguardando_revisao', 'aprovado') then
    raise exception 'Este ensaio já foi enviado para revisão. Aguarde a devolução do laboratorista.'
      using errcode = 'P0001';
  end if;
  return v_eo;
end $$;

-- Iniciar (ou retomar após devolução): status em_andamento e modelo de ficha congelado
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
  v_eo := public._ensaio_do_executor(p_ensaio_os_id);
  if v_eo.status = 'em_andamento' and v_eo.ficha_modelo_id is not null then
    return v_eo;   -- já iniciado (operação repetida pela fila offline)
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
         iniciado_em     = coalesce(iniciado_em, now()),
         modo_preenchi   = 'digital'
   where id = p_ensaio_os_id
  returning * into v_eo;
  perform set_config('cnro.assistente', 'off', true);

  update public.pedidos_ensaio
     set historico = coalesce(historico, '[]'::jsonb)
                     || jsonb_build_array(public._evento(v_acao, jsonb_build_object('ensaio', v_eo.nome_ensaio)))
   where id = v_eo.pedido_id;

  return v_eo;
end $$;

-- Rascunho: grava os dados da ficha sem enviar (continua depois, em qualquer aparelho)
create or replace function public.salvar_rascunho_ensaio(p_ensaio_os_id uuid, p_dados jsonb)
returns public.ensaios_os
language plpgsql security definer
set search_path = public
as $$
declare
  v_eo public.ensaios_os;
begin
  v_eo := public._ensaio_do_executor(p_ensaio_os_id);
  if v_eo.status <> 'em_andamento' then
    raise exception 'Inicie o ensaio antes de preencher a ficha.' using errcode = 'P0001';
  end if;

  perform set_config('cnro.assistente', 'on', true);
  update public.ensaios_os
     set dados_resultado = coalesce(p_dados, '{}'::jsonb),
         rascunho_em     = now()
   where id = p_ensaio_os_id
  returning * into v_eo;
  perform set_config('cnro.assistente', 'off', true);
  return v_eo;
end $$;

-- Enviar para revisão: exige assinatura cadastrada e ficha assinada
create or replace function public.enviar_para_revisao(p_ensaio_os_id uuid, p_dados jsonb, p_assinado_em timestamptz default null)
returns public.ensaios_os
language plpgsql security definer
set search_path = public
as $$
declare
  v_eo   public.ensaios_os;
  v_me   uuid := public.usuario_atual_id();
  v_user public.usuarios;
begin
  v_eo := public._ensaio_do_executor(p_ensaio_os_id);
  if v_eo.status <> 'em_andamento' then
    raise exception 'Inicie o ensaio antes de enviar.' using errcode = 'P0001';
  end if;

  select * into v_user from public.usuarios where id = v_me;
  if coalesce(v_user.assinatura_url, '') = '' then
    raise exception 'Você ainda não tem assinatura cadastrada. Peça ao Gestor para cadastrar antes de enviar.'
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
         data_conclusao      = now(),
         enviado_em          = now(),
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

  return v_eo;
end $$;

-- -----------------------------------------------------------------------------
-- 6. RPCs da revisão (laboratorista responsável)
-- -----------------------------------------------------------------------------

create or replace function public._ensaio_do_revisor(p_ensaio_os_id uuid)
returns public.ensaios_os
language plpgsql security definer
set search_path = public
as $$
declare
  v_eo  public.ensaios_os;
  v_ped public.pedidos_ensaio;
begin
  select * into v_eo from public.ensaios_os where id = p_ensaio_os_id for update;
  if not found then raise exception 'Ensaio não encontrado.' using errcode = 'P0001'; end if;
  select * into v_ped from public.pedidos_ensaio where id = v_eo.pedido_id;
  if not (public.eh_gestor() or v_ped.laboratorista_id = public.usuario_atual_id()) then
    raise exception 'Somente o laboratorista responsável pela O.S. pode revisar.' using errcode = 'P0001';
  end if;
  if v_ped.status = 'concluido' and not public.eh_gestor() then
    raise exception 'O.S. finalizada: somente o Gestor pode reabrir.' using errcode = 'P0001';
  end if;
  return v_eo;
end $$;

-- Salvar correções na revisão (sem aprovar)
create or replace function public.salvar_revisao_ensaio(p_ensaio_os_id uuid, p_dados jsonb)
returns public.ensaios_os
language plpgsql security definer
set search_path = public
as $$
declare
  v_eo public.ensaios_os;
begin
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
  return v_eo;
end $$;

-- Aprovar: grava a ficha final, a assinatura do calculista e os resultados normalizados.
--   p_resultados = [{ "tabela": "resultado_marshall", "linhas": [ {coluna: valor, ...}, ... ] }, ...]
--   (as linhas são calculadas pelo app a partir do mapa da ficha; o banco confere as tabelas)
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
  v_me    uuid := public.usuario_atual_id();
  v_user  public.usuarios;
  v_res   uuid;
  v_norma text;
  v_item  jsonb;
  v_linha jsonb;
  v_tab   text;
  v_qtd   integer := 0;
begin
  v_eo := public._ensaio_do_revisor(p_ensaio_os_id);
  if v_eo.status <> 'aguardando_revisao' then
    raise exception 'Só é possível aprovar ensaios aguardando revisão.' using errcode = 'P0001';
  end if;

  select * into v_user from public.usuarios where id = v_me;
  if coalesce(v_user.assinatura_url, '') = '' then
    raise exception 'Você ainda não tem assinatura cadastrada. Peça ao Gestor para cadastrar antes de aprovar.'
      using errcode = 'P0001';
  end if;
  if p_assinado_em is null then
    raise exception 'Assine a ficha (Responsável calculista) antes de aprovar.' using errcode = 'P0001';
  end if;
  if p_conformidade is not null
     and p_conformidade not in ('Conforme','Não Conforme','Parcialmente Conforme','Pendente') then
    raise exception 'Conformidade inválida: %', p_conformidade using errcode = 'P0001';
  end if;

  select norma into v_norma from public.ensaios where id = v_eo.ensaio_id;

  -- resultados (1 por ensaio da O.S.)
  v_res := v_eo.resultado_id;
  if v_res is null then
    select id into v_res from public.resultados where ensaio_os_id = v_eo.id limit 1;
  end if;
  if v_res is null then
    insert into public.resultados (pedido_id, ensaio_os_id, ensaio_id, assistente_id, laboratorista_id,
                                   status, conformidade, observacoes, data_execucao, data_revisao, norma_utilizada)
    values (v_eo.pedido_id, v_eo.id, v_eo.ensaio_id, v_eo.assistente_id, v_me,
            'aprovado', coalesce(p_conformidade, 'Pendente'), p_observacoes,
            coalesce(v_eo.data_conclusao, now())::date, current_date, v_norma)
    returning id into v_res;
  else
    update public.resultados
       set status = 'aprovado', laboratorista_id = v_me, assistente_id = v_eo.assistente_id,
           conformidade = coalesce(p_conformidade, conformidade, 'Pendente'),
           observacoes = coalesce(p_observacoes, observacoes),
           data_execucao = coalesce(v_eo.data_conclusao, now())::date,
           data_revisao = current_date, norma_utilizada = coalesce(norma_utilizada, v_norma)
     where id = v_res;
  end if;

  -- resultado_* (uma linha por CP/amostra)
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
            || jsonb_build_object('id', gen_random_uuid(), 'resultado_id', v_res, 'created_at', now());
      v_qtd := v_qtd + 1;
    end loop;
  end loop;

  update public.ensaios_os
     set status                = 'aprovado',
         aprovado_por_id       = v_me,
         aprovado_em           = now(),
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

  return v_eo;
end $$;

-- -----------------------------------------------------------------------------
-- 7. Permissões de execução
-- -----------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'modulos_do_usuario(uuid)', 'tem_modulo(text)', 'eh_lab()', 'eh_equipe_lab()',
    'modelo_vigente(uuid)',
    'iniciar_ensaio(uuid)', 'salvar_rascunho_ensaio(uuid, jsonb)',
    'enviar_para_revisao(uuid, jsonb, timestamptz)',
    'salvar_revisao_ensaio(uuid, jsonb)',
    'aprovar_ensaio(uuid, jsonb, jsonb, text, text, boolean, timestamptz)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- funções internas: sem acesso direto pelo app
  foreach f in array array['_ensaio_do_executor(uuid)', '_ensaio_do_revisor(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

commit;

-- Fim da migração 13.
