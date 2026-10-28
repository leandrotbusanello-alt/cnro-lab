-- ─────────────────────────────────────────────────────────────────────────────
-- CNRO Lab — migração 35 (28/10/2026): concreto — concreteiras/centrais, traços de concreto,
-- tipo de traço (CBUQ/TSD/Concreto), FR-IMOB-50 Rev01 (14 dias, tipo de CP e tipo de ruptura).
--
-- Rodar no SQL Editor ANTES do push do app (só acrescenta: o app atual continua funcionando), BLOCO A BLOCO.
-- O app novo grava o tipo do traço e o tipo de ruptura, então estas colunas precisam existir antes dele.
-- Pode rodar de novo sem problema (idempotente; testado duas vezes seguidas num PostgreSQL 16).
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════ BLOCO 1 — Cadastro de concreteiras/centrais ═══════════════════════════
create table if not exists public.concreteiras_centrais (
  id            uuid primary key default gen_random_uuid(),
  concreteira   text not null,
  central       text,
  empresas_ids  uuid[] not null default '{}',
  ativo         boolean not null default true,
  observacoes   text,
  criado_por    uuid references public.usuarios(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists concreteiras_centrais_nome_uq
  on public.concreteiras_centrais (lower(concreteira), lower(coalesce(central, '')));

create or replace function public.tg_concreteira_central()
returns trigger
language plpgsql
as $$
begin
  new.concreteira := trim(new.concreteira);
  new.central := nullif(trim(coalesce(new.central, '')), '');
  new.empresas_ids := coalesce(new.empresas_ids, '{}');
  if tg_op = 'INSERT' then new.criado_por := coalesce(new.criado_por, public.usuario_atual_id()); end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists a10_concreteira_central on public.concreteiras_centrais;
create trigger a10_concreteira_central
  before insert or update on public.concreteiras_centrais
  for each row execute function public.tg_concreteira_central();

-- Todos os usuários ativos leem (o Campo escolhe na lista); Laboratório e Gestor/DEV alteram
alter table public.concreteiras_centrais enable row level security;
grant select, insert, update, delete on public.concreteiras_centrais to authenticated;
drop policy if exists concreteiras_centrais_select on public.concreteiras_centrais;
drop policy if exists concreteiras_centrais_manage on public.concreteiras_centrais;
create policy concreteiras_centrais_select on public.concreteiras_centrais for select to authenticated
  using ((select public.usuario_atual_id()) is not null);
create policy concreteiras_centrais_manage on public.concreteiras_centrais for all to authenticated
  using (public.eh_lab()) with check (public.eh_lab());

-- auditoria, como os outros cadastros (se a função existir)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'tg_auditoria') then
    execute 'drop trigger if exists z90_auditoria on public.concreteiras_centrais';
    execute 'create trigger z90_auditoria after insert or update or delete on public.concreteiras_centrais
             for each row execute function public.tg_auditoria()';
  end if;
end $$;

-- ═════ BLOCO 2 — Traços: tipo (CBUQ / TSD / Concreto) e campos do concreto ═══
alter table public.tracos_aprovados add column if not exists tipo text not null default 'cbuq';
alter table public.tracos_aprovados drop constraint if exists tracos_aprovados_tipo_chk;
alter table public.tracos_aprovados add constraint tracos_aprovados_tipo_chk check (tipo in ('cbuq', 'tsd', 'concreto'));
alter table public.tracos_aprovados add column if not exists concreteira_id uuid references public.concreteiras_centrais(id);
alter table public.tracos_aprovados add column if not exists fck_mpa numeric;
alter table public.tracos_aprovados add column if not exists slump_mm numeric;
alter table public.tracos_aprovados add column if not exists slump_tolerancia_mm numeric;
alter table public.tracos_aprovados add column if not exists tipo_cimento text;
alter table public.tracos_aprovados add column if not exists relacao_ac numeric;
alter table public.tracos_aprovados add column if not exists consumo_cimento_kg_m3 numeric;
create index if not exists tracos_aprovados_tipo_idx on public.tracos_aprovados (tipo, empresa_id);

-- Traço de concreto não tem validade (decisão de 28/10/2026): a validade padrão de 6 meses vale só para CBUQ/TSD
create or replace function public.tg_traco_validade()
returns trigger
language plpgsql
as $$
begin
  new.nome_traco := trim(new.nome_traco);
  if coalesce(new.tipo, 'cbuq') = 'concreto' then
    new.valido_ate := null;
  elsif new.aprovado_em is not null and new.valido_ate is null then
    new.valido_ate := (new.aprovado_em + interval '6 months')::date;
  end if;
  if new.valido_ate is not null and new.aprovado_em is not null and new.valido_ate < new.aprovado_em then
    raise exception 'A validade não pode ser anterior à data da aprovação.' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then new.criado_por := coalesce(new.criado_por, public.usuario_atual_id()); end if;
  new.updated_at := now();
  return new;
end $$;

-- ═════ BLOCO 3 — CONFERIR (só leitura): traços que vão virar TSD (têm "TSD" no nome) ═══
select nome_traco, tipo as tipo_atual, 'tsd' as vai_virar
from public.tracos_aprovados
where nome_traco ilike '%tsd%' and tipo = 'cbuq'
order by nome_traco;

-- ═════ BLOCO 4 — Marcar como TSD os traços acima ═════════════════════════════
-- (o que estiver errado você corrige depois no próprio cadastro: Editar → Tipo)
update public.tracos_aprovados set tipo = 'tsd'
 where nome_traco ilike '%tsd%' and tipo = 'cbuq';

-- ═════ BLOCO 5 — Resultados do concreto: tipo de CP e tipo de ruptura (NBR 5739) ═══
alter table public.resultado_compressao_concreto add column if not exists tipo_cp text;
alter table public.resultado_compressao_concreto add column if not exists tipo_ruptura text;
alter table public.resultado_compressao_concreto drop constraint if exists resultado_compressao_concreto_ruptura_chk;
alter table public.resultado_compressao_concreto add constraint resultado_compressao_concreto_ruptura_chk
  check (tipo_ruptura is null or tipo_ruptura in ('A', 'B', 'C', 'D', 'E', 'F', 'G'));

-- ═════ BLOCO 6 — Contagem de ensaios: cargas da FR-IMOB-50 Rev01 (X/Y/Z) + Rev00 (W/X) ═══
update public.contagem_regras
   set unidades = '[["X20"], ["X21"], ["Y20"], ["Y21"], ["Z20"], ["Z21"], ["X22"], ["X23"], ["Y22"], ["Y23"], ["Z22"], ["Z23"], ["X24"], ["X25"], ["Y24"], ["Y25"], ["Z24"], ["Z25"], ["X26"], ["X27"], ["Y26"], ["Y27"], ["Z26"], ["Z27"], ["X28"], ["X29"], ["Y28"], ["Y29"], ["Z28"], ["Z29"], ["X30"], ["X31"], ["Y30"], ["Y31"], ["Z30"], ["Z31"], ["X32"], ["X33"], ["Y32"], ["Y33"], ["Z32"], ["Z33"], ["X34"], ["X35"], ["Y34"], ["Y35"], ["Z34"], ["Z35"], ["X36"], ["X37"], ["Y36"], ["Y37"], ["Z36"], ["Z37"], ["X38"], ["X39"], ["Y38"], ["Y39"], ["Z38"], ["Z39"], ["X40"], ["X41"], ["Y40"], ["Y41"], ["Z40"], ["Z41"], ["X42"], ["X43"], ["Y42"], ["Y43"], ["Z42"], ["Z43"], ["X44"], ["X45"], ["Y44"], ["Y45"], ["Z44"], ["Z45"], ["W20"], ["W21"], ["W22"], ["W23"], ["W24"], ["W25"], ["W26"], ["W27"], ["W28"], ["W29"], ["W30"], ["W31"], ["W32"], ["W33"], ["W34"], ["W35"], ["W36"], ["W37"], ["W38"], ["W39"], ["W40"], ["W41"], ["W42"], ["W43"], ["W44"], ["W45"], ["W46"], ["W47"], ["X46"], ["X47"], ["W48"], ["W49"], ["X48"], ["X49"], ["W50"], ["W51"], ["X50"], ["X51"]]'::jsonb
 where ficha_codigo = 'FR-IMOB-50' and atividade = 'Compressão axial e diametral';

-- ═════ BLOCO 7 — CONFERIR ═════════════════════════════════════════════════════
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'concreteiras_centrais') as tabela_concreteiras,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'tracos_aprovados' and column_name in ('tipo', 'fck_mpa', 'concreteira_id')) as colunas_traco_3,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'resultado_compressao_concreto' and column_name in ('tipo_cp', 'tipo_ruptura')) as colunas_resultado_2,
  (select jsonb_array_length(unidades) from public.contagem_regras where ficha_codigo = 'FR-IMOB-50') as cargas_fr50_116,
  (select string_agg(tipo || ': ' || n, ' · ') from (select tipo, count(*) n from public.tracos_aprovados group by tipo) t) as tracos_por_tipo;
