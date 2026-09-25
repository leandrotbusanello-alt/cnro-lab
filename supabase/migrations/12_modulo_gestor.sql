-- =============================================================================
-- CNRO Lab Control — Migração 12: Módulo Gestor (usuários e empresas)
-- =============================================================================
-- Pré-requisito: migrações 10 e 11.
-- Idempotente e em transação única.
--
--  1. usuarios: colunas trocar_senha (senha provisória) e empresa_id
--  2. usuarios.empresa / usuarios.lote preenchidos a partir de empresa_id
--  3. Renomear empresa → atualiza o texto nos usuários vinculados
--  4. Guarda de usuários (hierarquia de perfis):
--       - DEV altera qualquer usuário;
--       - GESTOR só cria/altera LAB, ASSIST e CAMPO;
--       - ninguém (exceto DEV) altera o próprio perfil ou status;
--       - demais usuários não alteram perfil, status, e-mail, login,
--         senha provisória nem empresa.
--  5. Auditoria também em `empresas`
--  6. Storage: bucket privado `fotos` (foto dos usuários)
--  7. Excluir usuário: somente DEV (o Gestor inativa)
--  8. Catálogo (ensaios, fichas de ensaio, mapa de resultados): só DEV altera;
--     o Gestor apenas visualiza
--  9. Leitura dos dados só para usuários ATIVOS (inativado perde o acesso na
--     hora, mesmo com o app aberto)
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Colunas novas
-- -----------------------------------------------------------------------------
alter table public.usuarios
  add column if not exists trocar_senha boolean not null default false,
  add column if not exists empresa_id  uuid references public.empresas(id);

create index if not exists usuarios_empresa_id_idx on public.usuarios(empresa_id);

-- -----------------------------------------------------------------------------
-- 2. empresa / lote do usuário a partir de empresa_id
-- -----------------------------------------------------------------------------
create or replace function public.tg_usuario_empresa()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare v_emp record;
begin
  if new.empresa_id is null then
    if tg_op = 'UPDATE' and old.empresa_id is not null then
      new.empresa := null;
      new.lote    := null;
    end if;
  elsif tg_op = 'INSERT' or new.empresa_id is distinct from old.empresa_id then
    select nome, lote into v_emp from public.empresas where id = new.empresa_id;
    if found then
      new.empresa := v_emp.nome;
      new.lote    := v_emp.lote;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists a15_usuario_empresa on public.usuarios;
create trigger a15_usuario_empresa
  before insert or update on public.usuarios
  for each row execute function public.tg_usuario_empresa();

-- -----------------------------------------------------------------------------
-- 3. Empresa renomeada / lote alterado → atualiza os usuários vinculados
-- -----------------------------------------------------------------------------
create or replace function public.tg_empresa_propagar()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.nome is distinct from old.nome or new.lote is distinct from old.lote then
    perform set_config('cnro.sistema', 'on', true);
    update public.usuarios
       set empresa = new.nome, lote = new.lote
     where empresa_id = new.id;
    perform set_config('cnro.sistema', 'off', true);
  end if;
  return new;
end $$;

drop trigger if exists z10_empresa_propagar on public.empresas;
create trigger z10_empresa_propagar
  after update on public.empresas
  for each row execute function public.tg_empresa_propagar();

-- -----------------------------------------------------------------------------
-- 4. Guarda de usuários (substitui a versão da migração 10)
-- -----------------------------------------------------------------------------
create or replace function public.tg_usuario_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_ator   text := public.usuario_atual_perfil();
  v_ator_id uuid := public.usuario_atual_id();
begin
  -- SQL Editor / service_role (manutenção) e ajustes internos do sistema
  if auth.uid() is null or coalesce(current_setting('cnro.sistema', true), '') = 'on' then
    return new;
  end if;

  new.perfil := upper(new.perfil);

  if tg_op = 'INSERT' then
    if v_ator = 'DEV' then return new; end if;
    if v_ator = 'GESTOR' then
      if new.perfil in ('DEV', 'GESTOR') then
        raise exception 'Somente o DEV pode cadastrar usuários com perfil %.', new.perfil
          using errcode = 'P0001';
      end if;
      return new;
    end if;
    raise exception 'Somente o Gestor pode cadastrar usuários.' using errcode = 'P0001';
  end if;

  -- UPDATE ------------------------------------------------------------------
  if v_ator = 'DEV' then
    return new;
  end if;

  if v_ator = 'GESTOR' then
    if old.id is distinct from v_ator_id then
      if old.perfil in ('DEV', 'GESTOR') then
        raise exception 'Somente o DEV pode alterar usuários com perfil %.', old.perfil
          using errcode = 'P0001';
      end if;
      if new.perfil in ('DEV', 'GESTOR') then
        raise exception 'Somente o DEV pode atribuir o perfil %.', new.perfil
          using errcode = 'P0001';
      end if;
      return new;
    end if;
    -- o próprio Gestor: dados pessoais sim, perfil/status/login não
    if new.perfil  is distinct from old.perfil
       or new.status  is distinct from old.status
       or new.auth_id is distinct from old.auth_id then
      raise exception 'Você não pode alterar o próprio perfil, status ou login.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- LAB, ASSIST, CAMPO (somente o próprio registro, pelo RLS)
  if new.perfil       is distinct from old.perfil
     or new.status       is distinct from old.status
     or new.auth_id      is distinct from old.auth_id
     or new.email        is distinct from old.email
     or new.trocar_senha is distinct from old.trocar_senha
     or new.empresa_id   is distinct from old.empresa_id then
    raise exception 'Somente o Gestor pode alterar perfil, status, e-mail, login ou empresa.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists a30_usuario_guard on public.usuarios;
create trigger a30_usuario_guard
  before insert or update on public.usuarios
  for each row execute function public.tg_usuario_guard();

-- -----------------------------------------------------------------------------
-- 5. Auditoria em empresas (mesma função da migração 10)
-- -----------------------------------------------------------------------------
drop trigger if exists z90_auditoria on public.empresas;
create trigger z90_auditoria
  after insert or update or delete on public.empresas
  for each row execute function public.tg_auditoria();

-- -----------------------------------------------------------------------------
-- 6. Storage: bucket privado de fotos
-- -----------------------------------------------------------------------------
-- Caminho: fotos/<usuarios.id>/foto-<timestamp>.<ext>; usuarios.foto_url guarda o caminho.
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do update set public = false;

drop policy if exists fotos_select on storage.objects;
drop policy if exists fotos_insert on storage.objects;
drop policy if exists fotos_update on storage.objects;
drop policy if exists fotos_delete on storage.objects;

create policy fotos_select on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.usuario_atual_id() is not null);
create policy fotos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos'
              and ((storage.foldername(name))[1] = public.usuario_atual_id()::text or public.eh_gestor()));
create policy fotos_update on storage.objects for update to authenticated
  using (bucket_id = 'fotos'
         and ((storage.foldername(name))[1] = public.usuario_atual_id()::text or public.eh_gestor()));
create policy fotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotos'
         and ((storage.foldername(name))[1] = public.usuario_atual_id()::text or public.eh_gestor()));

-- -----------------------------------------------------------------------------
-- 7. Excluir usuário: somente DEV
-- -----------------------------------------------------------------------------
create or replace function public.eh_dev()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.usuario_atual_perfil() = 'DEV', false)
$$;

drop policy if exists usuarios_delete on public.usuarios;
create policy usuarios_delete on public.usuarios for delete to authenticated
  using (public.eh_dev());

-- -----------------------------------------------------------------------------
-- 8. Catálogo: só DEV altera (Gestor e demais apenas leem)
-- -----------------------------------------------------------------------------
drop policy if exists ensaios_manage on public.ensaios;
create policy ensaios_manage on public.ensaios for all to authenticated
  using (public.eh_dev()) with check (public.eh_dev());

drop policy if exists fichas_ensaio_manage on public.fichas_ensaio;
create policy fichas_ensaio_manage on public.fichas_ensaio for all to authenticated
  using (public.eh_dev()) with check (public.eh_dev());

drop policy if exists ensaio_resultado_map_manage on public.ensaio_resultado_map;
create policy ensaio_resultado_map_manage on public.ensaio_resultado_map for all to authenticated
  using (public.eh_dev()) with check (public.eh_dev());

-- -----------------------------------------------------------------------------
-- 9. Leitura: somente usuários ativos (substitui "using (true)" da migração 10)
-- -----------------------------------------------------------------------------
-- (select ...) faz o Postgres calcular uma vez por consulta, não por linha.
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
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated
                    using ((select public.usuario_atual_id()) is not null)', t || '_select', t);
  end loop;
end $$;

commit;

-- Fim da migração 12.
