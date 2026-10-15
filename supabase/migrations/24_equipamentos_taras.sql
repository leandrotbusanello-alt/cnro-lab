-- =============================================================================
-- CNRO Lab Control — Migração 24: cadastro de equipamentos — taras de cápsulas e cilindros
-- =============================================================================
-- Pré-requisito: migração 17 (cadastros). Rodar no SQL Editor. Idempotente, transação única.
--
--  • public.equipamentos_tara: cápsulas (nº, peso) e cilindros (nº, peso, volume, altura).
--    Identificação só pelo número (decisão de 15/10/2026). Laboratório e Gestor/DEV cadastram e
--    alteram (Cadastros → Equipamentos); todos os usuários leem (as fichas buscam o peso pelo nº).
--  • public.equipamentos_tara_historico: cada cadastro/alteração vira uma linha (valores antes e
--    depois, quem e quando).
--  • Carga inicial: a tabela de taras da FR-IMOB-55 (a dos exemplos reais, em uso no laboratório),
--    só os equipamentos que existem: cápsulas 1–77 e cilindros 1–26. Cápsula 77: dois pesos na
--    planilha (33,49 × 6,96 g) → entra com 33,49 g e a observação "conferir peso".
--    A carga só insere o que ainda não existe (não sobrescreve alterações feitas no sistema).
-- =============================================================================

begin;

create table if not exists public.equipamentos_tara (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null check (tipo in ('capsula', 'cilindro')),
  numero      integer not null check (numero > 0),
  peso_g      numeric,
  volume_cm3  numeric,
  altura_mm   numeric,
  observacao  text,
  ativo       boolean not null default true,
  criado_por  uuid references public.usuarios(id),
  created_at  timestamptz not null default now(),
  atualizado_por uuid references public.usuarios(id),
  updated_at  timestamptz not null default now()
);
create unique index if not exists equipamentos_tara_tipo_numero_uq on public.equipamentos_tara (tipo, numero);

create table if not exists public.equipamentos_tara_historico (
  id             uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null references public.equipamentos_tara(id) on delete cascade,
  acao           text not null,
  antes          jsonb,
  depois         jsonb,
  registrado_por uuid references public.usuarios(id),
  registrado_em  timestamptz not null default now()
);
create index if not exists equipamentos_tara_historico_eq_idx on public.equipamentos_tara_historico (equipamento_id, registrado_em desc);

create or replace function public.tg_equipamento_tara()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then new.criado_por := coalesce(new.criado_por, public.usuario_atual_id()); end if;
  if tg_op = 'UPDATE' then
    new.tipo := old.tipo;            -- tipo e nº não mudam (cadastre outro e desative este)
    new.numero := old.numero;
  end if;
  new.observacao := nullif(trim(coalesce(new.observacao, '')), '');
  new.atualizado_por := public.usuario_atual_id();
  new.updated_at := now();
  if new.tipo = 'capsula' then new.volume_cm3 := null; new.altura_mm := null; end if;
  return new;
end $$;

drop trigger if exists a10_equipamento_tara on public.equipamentos_tara;
create trigger a10_equipamento_tara
  before insert or update on public.equipamentos_tara
  for each row execute function public.tg_equipamento_tara();

create or replace function public.tg_equipamento_tara_historico()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_antes  jsonb;
  v_depois jsonb := jsonb_build_object('peso_g', new.peso_g, 'volume_cm3', new.volume_cm3, 'altura_mm', new.altura_mm,
                                       'observacao', new.observacao, 'ativo', new.ativo);
begin
  if tg_op = 'UPDATE' then
    v_antes := jsonb_build_object('peso_g', old.peso_g, 'volume_cm3', old.volume_cm3, 'altura_mm', old.altura_mm,
                                  'observacao', old.observacao, 'ativo', old.ativo);
    if v_antes = v_depois then return new; end if;
  end if;
  insert into public.equipamentos_tara_historico (equipamento_id, acao, antes, depois, registrado_por)
  values (new.id, case when tg_op = 'INSERT' then 'Cadastro' else 'Alteração' end, v_antes, v_depois, public.usuario_atual_id());
  return new;
end $$;

drop trigger if exists z20_equipamento_tara_historico on public.equipamentos_tara;
create trigger z20_equipamento_tara_historico
  after insert or update on public.equipamentos_tara
  for each row execute function public.tg_equipamento_tara_historico();

-- Permissões: todos leem; Laboratório e Gestor/DEV cadastram e alteram (sem excluir: desative)
alter table public.equipamentos_tara enable row level security;
grant select, insert, update on public.equipamentos_tara to authenticated;
drop policy if exists equipamentos_tara_select on public.equipamentos_tara;
drop policy if exists equipamentos_tara_insert on public.equipamentos_tara;
drop policy if exists equipamentos_tara_update on public.equipamentos_tara;
create policy equipamentos_tara_select on public.equipamentos_tara for select to authenticated
  using ((select public.usuario_atual_id()) is not null);
create policy equipamentos_tara_insert on public.equipamentos_tara for insert to authenticated
  with check (public.eh_lab());
create policy equipamentos_tara_update on public.equipamentos_tara for update to authenticated
  using (public.eh_lab()) with check (public.eh_lab());

alter table public.equipamentos_tara_historico enable row level security;
grant select on public.equipamentos_tara_historico to authenticated;
drop policy if exists equipamentos_tara_historico_select on public.equipamentos_tara_historico;
create policy equipamentos_tara_historico_select on public.equipamentos_tara_historico for select to authenticated
  using (public.eh_lab());

-- Carga inicial (só o que ainda não existe)
insert into public.equipamentos_tara (tipo, numero, peso_g, volume_cm3, altura_mm, observacao)
values
  ('capsula', 1, 90.2, null, null, null),
  ('capsula', 2, 86.4, null, null, null),
  ('capsula', 3, 93.4, null, null, null),
  ('capsula', 4, 90.2, null, null, null),
  ('capsula', 5, 93.3, null, null, null),
  ('capsula', 6, 93.5, null, null, null),
  ('capsula', 7, 34.9, null, null, null),
  ('capsula', 8, 36.4, null, null, null),
  ('capsula', 9, 36, null, null, null),
  ('capsula', 10, 38.9, null, null, null),
  ('capsula', 11, 36.5, null, null, null),
  ('capsula', 12, 32.3, null, null, null),
  ('capsula', 13, 32.6, null, null, null),
  ('capsula', 14, 36.5, null, null, null),
  ('capsula', 15, 34.6, null, null, null),
  ('capsula', 16, 34, null, null, null),
  ('capsula', 17, 36.5, null, null, null),
  ('capsula', 18, 34.9, null, null, null),
  ('capsula', 19, 36.4, null, null, null),
  ('capsula', 20, 36.3, null, null, null),
  ('capsula', 21, 19.5, null, null, null),
  ('capsula', 22, 19.9, null, null, null),
  ('capsula', 23, 20.1, null, null, null),
  ('capsula', 24, 22.6, null, null, null),
  ('capsula', 25, 21, null, null, null),
  ('capsula', 26, 20.5, null, null, null),
  ('capsula', 27, 19.1, null, null, null),
  ('capsula', 28, 19.7, null, null, null),
  ('capsula', 29, 22.2, null, null, null),
  ('capsula', 30, 20.9, null, null, null),
  ('capsula', 31, 22.3, null, null, null),
  ('capsula', 32, 21.1, null, null, null),
  ('capsula', 33, 11.5, null, null, null),
  ('capsula', 34, 11.6, null, null, null),
  ('capsula', 35, 11.1, null, null, null),
  ('capsula', 36, 11.6, null, null, null),
  ('capsula', 37, 11.5, null, null, null),
  ('capsula', 38, 11.5, null, null, null),
  ('capsula', 39, 11.8, null, null, null),
  ('capsula', 40, 11.6, null, null, null),
  ('capsula', 41, 11.4, null, null, null),
  ('capsula', 42, 11.5, null, null, null),
  ('capsula', 43, 13.8, null, null, null),
  ('capsula', 44, 12.7, null, null, null),
  ('capsula', 45, 11.8, null, null, null),
  ('capsula', 46, 12.6, null, null, null),
  ('capsula', 47, 12.9, null, null, null),
  ('capsula', 48, 12.9, null, null, null),
  ('capsula', 49, 11.4, null, null, null),
  ('capsula', 50, 9.9, null, null, null),
  ('capsula', 51, 12.9, null, null, null),
  ('capsula', 52, 11.7, null, null, null),
  ('capsula', 53, 11.4, null, null, null),
  ('capsula', 54, 13, null, null, null),
  ('capsula', 55, 13.1, null, null, null),
  ('capsula', 56, 12.7, null, null, null),
  ('capsula', 57, 12.8, null, null, null),
  ('capsula', 58, 13, null, null, null),
  ('capsula', 59, 12.8, null, null, null),
  ('capsula', 60, 13.2, null, null, null),
  ('capsula', 61, 12.8, null, null, null),
  ('capsula', 62, 13.1, null, null, null),
  ('capsula', 63, 12.7, null, null, null),
  ('capsula', 64, 13, null, null, null),
  ('capsula', 65, 12.7, null, null, null),
  ('capsula', 66, 12.6, null, null, null),
  ('capsula', 67, 9.53, null, null, null),
  ('capsula', 68, 11.68, null, null, null),
  ('capsula', 69, 9.64, null, null, null),
  ('capsula', 70, 9.65, null, null, null),
  ('capsula', 71, 10.29, null, null, null),
  ('capsula', 72, 10.1, null, null, null),
  ('capsula', 73, 9.37, null, null, null),
  ('capsula', 74, 11, null, null, null),
  ('capsula', 75, 9.25, null, null, null),
  ('capsula', 76, 9.46, null, null, null),
  ('capsula', 77, 33.49, null, null, 'Conferir peso: a planilha da FR-IMOB-55 tinha 33,49 g (cápsula média) e 6,96 g (pequena/tampa).'),
  ('cilindro', 1, 5375.9, 2081, 113.2, null),
  ('cilindro', 2, 5272.6, 2080, 114.06, null),
  ('cilindro', 3, 5399.1, 2086, 114.33, null),
  ('cilindro', 4, 5388.1, 2096, 114.79, null),
  ('cilindro', 5, 5434.7, 2084, 114.31, null),
  ('cilindro', 6, 5430.2, 2083, 114.29, null),
  ('cilindro', 7, 5425.3, 2088, 114.46, null),
  ('cilindro', 8, 5369.4, 2096, 114.68, null),
  ('cilindro', 9, 5355.8, 2081, 114.26, null),
  ('cilindro', 10, 5427, 2088, 114.36, null),
  ('cilindro', 11, 5421.1, 2080, 114.21, null),
  ('cilindro', 12, 5427.5, 2087, 114.21, null),
  ('cilindro', 13, 5342.9, 2084, 114.15, null),
  ('cilindro', 14, 5423.4, 2077, 114.42, null),
  ('cilindro', 15, 5369.3, 2065, 114.12, null),
  ('cilindro', 16, 5310, 2089, 114.58, null),
  ('cilindro', 17, 5417.4, 2083, 114.34, null),
  ('cilindro', 18, 5146.6, 2075, 114.37, null),
  ('cilindro', 19, 5434.9, 2083, 114.36, null),
  ('cilindro', 20, 5359, 2082, 114.41, null),
  ('cilindro', 21, 5376.3, 2084, 114.47, null),
  ('cilindro', 22, 5336.2, 2081, 114.23, null),
  ('cilindro', 23, 5425.4, 2087, 114.39, null),
  ('cilindro', 24, 5344.8, 2089, 114.2, null),
  ('cilindro', 25, 5346.7, 2089, 114.26, null),
  ('cilindro', 26, 5419.8, 2083, 114.49, null)
on conflict (tipo, numero) do nothing;

notify pgrst, 'reload schema';

commit;

-- Fim da migração 24.
