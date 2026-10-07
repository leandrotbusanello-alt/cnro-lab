-- =============================================================================
-- CNRO Lab Control — Migração 17: apontamentos do teste de 06/10/2026
-- =============================================================================
-- Pré-requisito: migrações 14, 15 e 16. Rodar no SQL Editor. Idempotente, transação única.
--
--  1. Km e estaca com vírgula: 545+970 → 545,970; 280+40 → 280,040; 545,9 → 545,900.
--     Na observação das fichas os pontos são separados por ponto e vírgula.
--  2. Número do pedido no formato 145/2026 (mensagens, histórico e confirmação de exclusão).
--  3. FR-IMOB-04: novo item "Caracterização de material asfáltico"; "Outros" sai do sistema
--     (pedido do auditor). Os ensaios "Outros" do catálogo são desativados.
--  4. Cadastros (Laboratório e Gestor): traços aprovados com validade, histórico de
--     validação e documento; jazidas; pedreiras; fornecedores de ligante.
--     Carga inicial: os 7 traços da planilha da FR-IMOB-54 (com a faixa de trabalho).
--  5. Observação padrão das fichas refeita para os campos novos do Campo (os pedidos
--     antigos continuam funcionando).
--  6. previa_ficha_os(): a FR-IMOB-04 aberta e editável antes de gerar a O.S.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Km / estaca
-- -----------------------------------------------------------------------------
-- '545+970' → '545,970' · '280+40' → '280,040' (depois do "+" são metros)
-- '545,9'   → '545,900' (depois da vírgula, completa à direita) · '545' → '545,000'
create or replace function public._km_fmt(p text)
returns text
language plpgsql immutable
as $$
declare
  t text := upper(trim(coalesce(p, '')));
  m text[];
begin
  if t = '' then return null; end if;
  t := regexp_replace(t, '^(KM|EST\.?|ESTACA)\s*', '');
  m := regexp_match(t, '^(\d+)\s*\+\s*(\d+)$');
  if m is not null then
    return m[1] || ',' || case when length(m[2]) >= 3 then m[2] else lpad(m[2], 3, '0') end;
  end if;
  m := regexp_match(t, '^(\d+)\s*[,.]\s*(\d+)$');
  if m is not null then
    return m[1] || ',' || case when length(m[2]) >= 3 then m[2] else rpad(m[2], 3, '0') end;
  end if;
  if t ~ '^\d+$' then return t || ',000'; end if;
  return t;
end $$;

create or replace function public._obs_km(p text)
returns text
language sql immutable
as $$
  select case when public._km_fmt(p) is null then null else 'KM ' || public._km_fmt(p) end
$$;

-- Ponto de uma amostra (km de extração/coleta ou a estaca antiga)
create or replace function public._obs_ponto(a jsonb)
returns text
language sql immutable
as $$
  select coalesce(nullif(trim(a->>'km_extracao'), ''), nullif(trim(a->>'km_coleta'), ''),
                  nullif(trim(a->>'estaca'), ''), nullif(trim(a->>'estaca_extracao'), ''), nullif(trim(a->>'km'), ''))
$$;

-- "a" | "a E b" | "a<sep>b E c" (separador padrão ", "; para km, "; ")
drop function if exists public._obs_lista(text[]);
create or replace function public._obs_lista(p text[], p_sep text default ', ')
returns text
language sql immutable
as $$
  select case coalesce(array_length(p, 1), 0)
           when 0 then null
           when 1 then p[1]
           else array_to_string(p[1:array_length(p, 1) - 1], p_sep) || ' E ' || p[array_length(p, 1)]
         end
$$;

-- -----------------------------------------------------------------------------
-- 3. FR-IMOB-04: item novo e "Outros"
-- -----------------------------------------------------------------------------
alter table public.fichas_os add column if not exists espec_caract_material_asfaltico boolean not null default false;

update public.ensaios set ativo = false
 where codigo_frimob04 in ('ens_outros_asfalto', 'ens_outros_solos') and ativo is distinct from false;

-- Todas as colunas booleanas espec_* / ens_* da ficha (inclui as novas automaticamente)
create or replace function public.salvar_ficha_os(p_pedido_id uuid, p_dados jsonb)
returns public.fichas_os
language plpgsql security definer
set search_path = public
as $$
declare
  v_p public.pedidos_ensaio;
  v_f public.fichas_os;
  v_id uuid;
  v_col text;
  v_data text[] := array['data_solicitacao','inicio_ensaios','fim_ensaios','previsao_entrega',
                         'analise_ensaios','entrega_solicitacao','repactuacao_data'];
  v_texto text[] := array['obra','lote','solicitante','contato','motivo_repactuacao','indicador'];
begin
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if not public._pode_editar_fichas(v_p) then
    raise exception 'Somente o laboratorista responsável pode editar a ficha (O.S. finalizada é bloqueada).'
      using errcode = 'P0001';
  end if;
  if v_p.numero_os is null or v_p.numero_os like 'PROV-%' then
    raise exception 'A O.S. ainda não foi gerada/sincronizada.' using errcode = 'P0001';
  end if;

  v_id := v_p.ficha_os_id;
  if v_id is null then
    select id into v_id from public.fichas_os where pedido_id = p_pedido_id order by created_at limit 1;
  end if;
  if v_id is null then
    insert into public.fichas_os (pedido_id, numero_os, data_solicitacao, obra, lote, status, criado_por)
    values (p_pedido_id, v_p.numero_os, (v_p.created_at at time zone 'America/Cuiaba')::date,
            v_p.empresa, v_p.lote, 'emitida', public.usuario_atual_id())
    returning id into v_id;
  end if;

  for v_col in
    select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'fichas_os' and data_type = 'boolean'
       and column_name ~ '^(espec|ens)_[a-z0-9_]+$'
  loop
    if p_dados ? v_col then
      execute format('update public.fichas_os set %I = $1 where id = $2', v_col)
        using coalesce((p_dados->>v_col)::boolean, false), v_id;
    end if;
  end loop;
  foreach v_col in array v_data loop
    if p_dados ? v_col then
      execute format('update public.fichas_os set %I = $1 where id = $2', v_col)
        using public._data_ou_nulo(p_dados->>v_col), v_id;
    end if;
  end loop;
  foreach v_col in array v_texto loop
    if p_dados ? v_col then
      execute format('update public.fichas_os set %I = $1 where id = $2', v_col)
        using nullif(trim(p_dados->>v_col), ''), v_id;
    end if;
  end loop;

  update public.fichas_os set
    observacao = case when p_dados ? 'observacao' then p_dados->>'observacao' else observacao end,
    numero_os  = v_p.numero_os,
    observacao_editada = true,
    status = 'emitida'
  where id = v_id
  returning * into v_f;

  update public.pedidos_ensaio
     set ficha_os_id = v_id,
         historico = coalesce(historico, '[]'::jsonb) || jsonb_build_array(public._evento('Ficha FR-IMOB-04 salva'))
   where id = p_pedido_id;

  return v_f;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Cadastros
-- -----------------------------------------------------------------------------
-- 4.1 Traços aprovados (a tabela já existe; colunas novas para validade e documento)
alter table public.tracos_aprovados add column if not exists tipo_mistura text;
alter table public.tracos_aprovados add column if not exists faixa_granulometrica text;
alter table public.tracos_aprovados add column if not exists teor_betume_pct numeric;
alter table public.tracos_aprovados add column if not exists ativo boolean default true;
alter table public.tracos_aprovados add column if not exists aprovado_em date;
alter table public.tracos_aprovados add column if not exists aprovado_por text;
alter table public.tracos_aprovados add column if not exists observacoes text;
alter table public.tracos_aprovados add column if not exists valido_ate date;
alter table public.tracos_aprovados add column if not exists documento text;
alter table public.tracos_aprovados add column if not exists faixa_trabalho jsonb not null default '[]'::jsonb;
alter table public.tracos_aprovados add column if not exists criado_por uuid references public.usuarios(id);
create unique index if not exists tracos_aprovados_nome_uq on public.tracos_aprovados (lower(nome_traco));

-- Histórico de validação (aprovação e cada revalidação)
create table if not exists public.tracos_validacoes (
  id             uuid primary key default gen_random_uuid(),
  traco_id       uuid not null references public.tracos_aprovados(id) on delete cascade,
  aprovado_em    date,
  valido_ate     date,
  aprovado_por   text,
  documento      text,
  observacao     text,
  registrado_por uuid references public.usuarios(id),
  registrado_em  timestamptz not null default now()
);
create index if not exists tracos_validacoes_traco_idx on public.tracos_validacoes (traco_id, registrado_em);

-- Validade padrão: 6 meses a partir da aprovação
create or replace function public.tg_traco_validade()
returns trigger
language plpgsql
as $$
begin
  new.nome_traco := trim(new.nome_traco);
  if new.aprovado_em is not null and new.valido_ate is null then
    new.valido_ate := (new.aprovado_em + interval '6 months')::date;
  end if;
  if new.valido_ate is not null and new.aprovado_em is not null and new.valido_ate < new.aprovado_em then
    raise exception 'A validade não pode ser anterior à data da aprovação.' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then new.criado_por := coalesce(new.criado_por, public.usuario_atual_id()); end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists a10_traco_validade on public.tracos_aprovados;
create trigger a10_traco_validade
  before insert or update on public.tracos_aprovados
  for each row execute function public.tg_traco_validade();

-- Toda mudança de aprovação/validade/documento vira uma linha no histórico
create or replace function public.tg_traco_historico()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.aprovado_em is null and new.valido_ate is null and new.documento is null then return new; end if;
  if tg_op = 'UPDATE'
     and new.aprovado_em  is not distinct from old.aprovado_em
     and new.valido_ate   is not distinct from old.valido_ate
     and new.aprovado_por is not distinct from old.aprovado_por
     and new.documento    is not distinct from old.documento then
    return new;
  end if;
  insert into public.tracos_validacoes (traco_id, aprovado_em, valido_ate, aprovado_por, documento, observacao, registrado_por)
  values (new.id, new.aprovado_em, new.valido_ate, new.aprovado_por, new.documento,
          case when tg_op = 'INSERT' then 'Cadastro' else 'Revalidação / atualização' end,
          public.usuario_atual_id());
  return new;
end $$;

drop trigger if exists z20_traco_historico on public.tracos_aprovados;
create trigger z20_traco_historico
  after insert or update on public.tracos_aprovados
  for each row execute function public.tg_traco_historico();

-- 4.2 Jazidas, pedreiras e fornecedores de ligante
create table if not exists public.jazidas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  municipio   text,
  coordenadas text,
  ativo       boolean not null default true,
  criado_por  uuid references public.usuarios(id),
  created_at  timestamptz not null default now()
);
create unique index if not exists jazidas_nome_uq on public.jazidas (lower(nome));

create table if not exists public.pedreiras (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  municipio   text,
  ativo       boolean not null default true,
  criado_por  uuid references public.usuarios(id),
  created_at  timestamptz not null default now()
);
create unique index if not exists pedreiras_nome_uq on public.pedreiras (lower(nome));

create table if not exists public.fornecedores_ligante (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  ativo       boolean not null default true,
  criado_por  uuid references public.usuarios(id),
  created_at  timestamptz not null default now()
);
create unique index if not exists fornecedores_ligante_nome_uq on public.fornecedores_ligante (lower(nome));

create or replace function public.tg_cadastro_criado_por()
returns trigger
language plpgsql
as $$
begin
  new.nome := trim(new.nome);
  if tg_op = 'INSERT' then new.criado_por := coalesce(new.criado_por, public.usuario_atual_id()); end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['jazidas', 'pedreiras', 'fornecedores_ligante'] loop
    execute format('drop trigger if exists a10_criado_por on public.%I', t);
    execute format('create trigger a10_criado_por before insert or update on public.%I
                    for each row execute function public.tg_cadastro_criado_por()', t);
  end loop;
end $$;

-- 4.3 Permissões: todos os usuários ativos leem (o Campo escolhe nas listas);
--     Laboratório e Gestor/DEV cadastram e alteram.
do $$
declare t text;
begin
  foreach t in array array['tracos_aprovados', 'jazidas', 'pedreiras', 'fornecedores_ligante'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_manage', t);
    execute format('create policy %I on public.%I for select to authenticated
                    using ((select public.usuario_atual_id()) is not null)', t || '_select', t);
    execute format('create policy %I on public.%I for all to authenticated
                    using (public.eh_lab()) with check (public.eh_lab())', t || '_manage', t);
  end loop;
end $$;
drop policy if exists tracos_manage on public.tracos_aprovados;   -- substituída por tracos_aprovados_manage

alter table public.tracos_validacoes enable row level security;
grant select on public.tracos_validacoes to authenticated;
drop policy if exists tracos_validacoes_select on public.tracos_validacoes;
create policy tracos_validacoes_select on public.tracos_validacoes for select to authenticated
  using (public.eh_lab());

-- 4.4 Documento do traço: bucket privado `tracos` (tracos/<traco_id>/<arquivo>)
insert into storage.buckets (id, name, public)
values ('tracos', 'tracos', false)
on conflict (id) do update set public = false;

drop policy if exists tracos_doc_select on storage.objects;
drop policy if exists tracos_doc_insert on storage.objects;
drop policy if exists tracos_doc_delete on storage.objects;
create policy tracos_doc_select on storage.objects for select to authenticated
  using (bucket_id = 'tracos' and public.eh_lab());
create policy tracos_doc_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'tracos' and public.eh_lab());
create policy tracos_doc_delete on storage.objects for delete to authenticated
  using (bucket_id = 'tracos' and public.eh_lab());

-- 4.5 Carga inicial: traços da planilha da FR-IMOB-54 (faixa de trabalho por peneira, % passante).
--     Validade em branco: o laboratório completa a data de aprovação e o coordenador.
insert into public.tracos_aprovados (nome_traco, tipo_mistura, faixa_granulometrica, ativo, faixa_trabalho, observacoes)
select x.nome, 'C.A.U.Q.', x.faixa, true, x.faixa_trabalho, 'Carga inicial (planilha FR-IMOB-54)'
  from (values
    ('CONSÓRCIO BR 163 - SANCHES TRIPOLONI · TRAÇO FAIXA "C" REV_DEZ-25', 'Faixa C',
     '[[38.1,100,100],[25.4,100,100],[19.1,100,100],[12.7,85.11,99.11],[9.5,76.02,89],[6.3,56.51,70.51],[4.8,50.47,60.47],[2.36,31.16,41.16],[1.18,17.77,27.77],[0.6,11,20.53],[0.3,7.93,15.93],[0.15,5.68,11.68],[0.075,5.1,9.1]]'),
    ('SANCHES TRIPOLONI SINOP · TRAÇO FAIXA "C" COD.PROJ - CD-0/1', 'Faixa C',
     '[[38.1,100,100],[25.4,100,100],[19.1,100,100],[12.7,86,100],[9.5,73.5,87.5],[6.3,53.2,67.2],[4.8,47.5,57.5],[2.36,31.6,41.6],[1.18,22,32],[0.6,14.6,24.6],[0.3,7.2,16.2],[0.15,4,10],[0.075,3.6,7.6]]'),
    ('NEOVIA · TRAÇO FAIXA "C" 031/2024', 'Faixa C',
     '[[38.1,100,100],[25.4,100,100],[19.1,100,100],[12.7,90,98.6],[9.5,74.3,88.3],[6.3,55.3,69.3],[4.8,47.8,57.8],[2.36,30.8,40.8],[1.18,20.5,30.5],[0.6,13.9,23.9],[0.3,8.8,16.8],[0.15,4.5,10.5],[0.075,3,7]]'),
    ('NEOVIA · TRAÇO FAIXA "B" 031/2024', 'Faixa B',
     '[[38.1,100,100],[25.4,100,100],[19.1,93,100],[12.7,76.9,89],[9.5,58.3,72.3],[6.3,43.7,57.7],[4.8,40.1,50.1],[2.36,26.4,36.4],[1.18,17.4,27.4],[0.6,11.2,21.2],[0.3,6.4,14.4],[0.15,4,9.9],[0.075,2.4,6.4]]'),
    ('TRIPOLONI LRV-SSR 2026 · FX "C" - COD.PROJ - REV03/PÓ ROMA', 'Faixa C',
     '[[38.1,100,100],[25.4,100,100],[19.1,100,100],[12.7,85.3,99.3],[9.5,73.2,87.2],[6.3,53.1,67.1],[4.8,46.9,56.9],[2.36,37.8,47.8],[1.18,25,35],[0.6,17.2,27.2],[0.3,12.1,21.1],[0.15,5.9,11.9],[0.075,3.4,7.4]]'),
    ('CONSÓRCIO BR163 - GUAXE · FAIXA "C" DNIT 031/2024 CAP 60-85', 'Faixa C',
     '[[38.1,100,100],[25.4,100,100],[19.1,100,100],[12.7,90,100],[9.5,73,89],[6.3,54.44,68.44],[4.8,46.24,60.24],[2.36,30.46,44.46],[1.18,21.43,31.43],[0.6,13.03,23.03],[0.3,8.48,14.48],[0.15,3.9,9.9],[0.075,2.08,6.08]]'),
    ('CONSÓRCIO CAMINHOS DO MT · FAIXA "B" DNIT 031/2024 CAP 60-85', 'Faixa B',
     '[[38.1,100,100],[25.4,100,100],[19.1,100,100],[12.7,78,89],[9.5,67.2,81.2],[6.3,49,63],[4.8,41.7,51.7],[2.36,25.8,35.8],[1.18,17.1,27.1],[0.6,13,23],[0.3,8.7,16.7],[0.15,4.3,10.3],[0.075,3,7]]')
  ) as v(nome, faixa, lim)
  cross join lateral (
    select v.nome as nome, v.faixa as faixa,
           (select jsonb_agg(jsonb_build_object('peneira_mm', (e->>0)::numeric, 'min', (e->>1)::numeric, 'max', (e->>2)::numeric))
              from jsonb_array_elements(v.lim::jsonb) e) as faixa_trabalho
  ) x
on conflict (lower(nome_traco)) do nothing;

-- -----------------------------------------------------------------------------
-- 5. Observação padrão (FR-IMOB-04 e FR-IMOB-05) — campos novos do Campo
-- -----------------------------------------------------------------------------
-- Faixa: '1ª Faixa' → 'FX-01'; demais em maiúsculas
create or replace function public._obs_faixa(p text)
returns text
language sql immutable
as $$
  select case when nullif(trim(p), '') is null then null
              when p ~ '^\s*\d' then 'FX-' || lpad(substring(p from '\d+'), 2, '0')
              else upper(trim(p)) end
$$;

-- Pontos (um por amostra) ou o trecho "KM a AO KM b"
create or replace function public._obs_kms(p_amostras jsonb)
returns text
language sql immutable
as $$
  with pts as (
    select public._obs_km(public._obs_ponto(a)) k, n
      from jsonb_array_elements(coalesce(p_amostras, '[]'::jsonb)) with ordinality t(a, n)
     where public._obs_ponto(a) is not null
  )
  select public._obs_lista(array(select k from pts order by n), '; ')
$$;

create or replace function public._obs_trecho(a jsonb)
returns text
language sql immutable
as $$
  select nullif(concat_ws(' AO ',
           public._obs_km(coalesce(nullif(a->>'km_inicial', ''), nullif(a->>'estaca_inicial', ''))),
           public._obs_km(coalesce(nullif(a->>'km_final', ''),   nullif(a->>'estaca_final', '')))), '')
$$;

-- CPs: "359 A 364" (números seguidos) ou a lista; pedidos antigos: numeracao_cps
create or replace function public._obs_cps(p_amostras jsonb)
returns text
language plpgsql immutable
as $$
declare
  v text[];
  n int;
begin
  select coalesce(array_agg(upper(trim(a->>'identificacao_cp')) order by o), '{}') into v
    from jsonb_array_elements(coalesce(p_amostras, '[]'::jsonb)) with ordinality t(a, o)
   where nullif(trim(a->>'identificacao_cp'), '') is not null;
  n := coalesce(array_length(v, 1), 0);
  if n = 0 then
    return public._obs_lista(public._obs_valores(p_amostras, 'numeracao_cps'));
  end if;
  if n > 1 and (select bool_and(x ~ '^\d{1,9}$') from unnest(v) x) then
    if (select bool_and(v[i]::bigint = v[1]::bigint + i - 1) from generate_series(1, n) i) then
      return v[1] || ' A ' || v[n];
    end if;
  end if;
  return public._obs_lista(v);
end $$;

create or replace function public.gerar_observacao_os(p_pedido_id uuid)
returns text
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_p     public.pedidos_ensaio;
  v_t     public.tracos_aprovados;
  v_ams   jsonb;
  v_am    jsonb;
  v_n     integer;
  v_qtd   integer;
  v_emp   text;
  v_lote  text;
  v_num   text;
  v_ens   text[];
  v_ens_t text;
  v_kms   text;
  v_trc   text;
  v_loc   text;
  v_tipo  text;
  v_txt   text;
  v_x     text;
  v_traco uuid;
begin
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id;
  if not found then return null; end if;

  v_ams  := public._amostras(v_p.dados_amostra);
  v_am   := coalesce(v_ams->0, '{}'::jsonb);
  v_n    := greatest(jsonb_array_length(v_ams), 1);
  v_qtd  := (select coalesce(sum(case when (a->>'qtd_cps') ~ '^\s*\d+\s*$' then (a->>'qtd_cps')::int else 1 end), 0)
               from jsonb_array_elements(v_ams) a);
  if v_qtd = 0 then v_qtd := 1; end if;
  v_emp  := public._obs_empresa(coalesce(v_p.empresa, (select nome from public.empresas where id = v_p.empresa_id)));
  v_lote := public._obs_lote(v_p.lote);
  v_num  := coalesce(public._fmt_seq(v_p.sequencial), '___') || '/'
            || coalesce(v_p.ano::text, extract(year from v_p.created_at)::text);
  v_ens  := public._obs_ensaios(v_p.ensaios_ids);
  v_ens_t := case coalesce(array_length(v_ens, 1), 0)
               when 0 then null
               when 1 then 'O ENSAIO DE ' || v_ens[1]
               else 'OS ENSAIOS DE ' || public._obs_lista(v_ens) end;

  -- traço (projeto adotado)
  v_traco := coalesce(v_p.traco_id,
                      case when (v_am->>'traco_id') ~ '^[0-9a-fA-F-]{36}$' then (v_am->>'traco_id')::uuid end);
  if v_traco is not null then select * into v_t from public.tracos_aprovados where id = v_traco; end if;

  -- localização: pontos (km de extração/coleta) e/ou trecho (km inicial ao final)
  v_kms := public._obs_kms(v_ams);
  v_trc := public._obs_trecho(v_am);
  v_x := case
           when v_p.sub_tipo in ('caixa_emprestimo', 'segmento') and v_trc is not null and v_kms is not null
             then v_trc || ' (COLETA: ' || v_kms || ')'
           else coalesce(v_kms, v_trc)
         end;
  v_loc := nullif(concat_ws(' / ',
             v_x,
             public._obs_lista(public._obs_valores(v_ams, 'pista')),
             public._obs_lista(array(select public._obs_faixa(f) from unnest(public._obs_valores(v_ams, 'faixa')) f)),
             public._obs_lista(public._obs_valores(v_ams, 'camada')),
             public._obs_lista(public._obs_valores(v_ams, 'lado'))), '');

  v_tipo := v_p.sub_tipo;

  -- Concreto --------------------------------------------------------------
  if v_tipo in ('concreto', 'cp_concreto') then
    v_txt := 'FORAM ENTREGUES AO LABORATÓRIO CORPOS DE PROVA DE CONCRETO'
      || coalesce(' (CPs ' || public._obs_cps(v_ams) || ')', '')
      || coalesce(' ' || public._obs_artigo(nullif(concat_ws(' ',
                       coalesce(nullif(v_am->>'elemento', ''), nullif(v_am->>'estrutura', '')),
                       coalesce(nullif(v_am->>'local_concretagem', ''), nullif(v_am->>'local', ''))), '')), '')
      || '. CORPOS DE PROVA MOLDADOS PARA ' || coalesce(v_ens_t, 'O ENSAIO DE COMPRESSÃO AXIAL')
      || coalesce(', MOLDAGEM FEITA NO DIA ' || public._obs_lista(array(
           select public._obs_data(d) from unnest(public._obs_valores(v_ams, 'data_moldagem')) d)), '')
      || '. CORPOS DE PROVA PROVENIENTES ' || v_emp || ' / ' || v_lote
      || '. REGISTRADOS COM N° ' || v_num || '.';

  -- CPs extraídos de pista -------------------------------------------------
  elsif v_tipo in ('cps_extraidos_pista', 'cp_pista') then
    v_txt := 'FORAM ENTREGUES AO LABORATÓRIO DA CNRO ' || lpad(v_qtd::text, 2, '0')
      || ' CPs DE ' || public._obs_mistura(coalesce(v_t.tipo_mistura, v_am->>'tipo_mistura'))
      || coalesce(' - ' || v_loc, '')
      || coalesce(', COM A DATA REFERENTE AO DIA ' || public._obs_lista(array(
           select public._obs_data(d) from unnest(public._obs_valores(v_ams, 'data_aplicacao')) d)), '')
      || '. CORPOS DE PROVA PROVENIENTES ' || v_emp || ' / ' || v_lote
      || ', PARA CONFERÊNCIA DE PARÂMETROS. REGISTRADO COMO OS N° ' || v_num || '.';

  -- Massa asfáltica -------------------------------------------------------
  elsif v_tipo in ('massa_asfaltica', 'massa') then
    v_x := public._obs_mistura(coalesce(v_t.tipo_mistura, v_am->>'tipo_mistura'))
           || coalesce(' ' || upper(nullif(trim(v_t.faixa_granulometrica), '')),
                       ' ' || public._obs_lista(public._obs_valores(v_ams, 'faixa_granulometrica')), '');
    v_txt := case when v_n = 1
                  then 'FOI ENTREGUE AO LABORATÓRIO UMA AMOSTRA DE ' || v_x || ' PROVENIENTE '
                  else 'FORAM ENTREGUES AO LABORATÓRIO ' || lpad(v_n::text, 2, '0') || ' AMOSTRAS DE ' || v_x || ' PROVENIENTES ' end
      || v_emp || ' / ' || v_lote || '. REGISTRADO COM N° ' || v_num || '.';

  -- Ligante asfáltico -----------------------------------------------------
  elsif v_tipo = 'ligante_asfaltico' then
    v_txt := 'FOI ENTREGUE AO LABORATÓRIO UMA AMOSTRA DE LIGANTE ASFÁLTICO'
      || coalesce(' ' || public._obs_lista(public._obs_valores(v_ams, 'tipo_ligante')), '')
      || coalesce(' DO FORNECEDOR ' || upper(nullif(trim(v_am->>'fornecedor'), '')), '')
      || coalesce(' (' || upper(nullif(trim(v_am->>'nota_fiscal'), '')) || ')', '')
      || coalesce(', COLETADA NO DIA ' || public._obs_data(v_am->>'data_coleta'), '')
      || coalesce(', PARA ' || v_ens_t, '')
      || '. MATERIAL PROVENIENTE ' || v_emp || ' / ' || v_lote
      || '. REGISTRADO COM N° ' || v_num || '.';

  -- Jazida / caixa de empréstimo / segmento ---------------------------------
  elsif v_tipo in ('jazida', 'caixa_emprestimo', 'segmento') then
    v_x := public._obs_lista(array(
             select regexp_replace(j, '^(JAZIDA|CAIXA DE EMPR[EÉ]STIMO)\s*', '')
               from unnest(public._obs_valores(v_ams, 'jazida')) j));
    v_txt := case when v_n = 1 then 'FOI ENTREGUE AO LABORATÓRIO UMA AMOSTRA DE SOLO'
                  else 'FORAM ENTREGUES AO LABORATÓRIO ' || lpad(v_n::text, 2, '0') || ' AMOSTRAS DE SOLO' end
      || case v_tipo
           when 'jazida' then ' DA JAZIDA' || coalesce(' ' || nullif(v_x, ''), '')
                              || coalesce(' (' || public._obs_lista(public._obs_valores(v_ams, 'municipio')) || ')', '')
           when 'caixa_emprestimo' then ' DA CAIXA DE EMPRÉSTIMO'
           else '' end
      || coalesce(' - ' || v_loc, '')
      || coalesce(', PROFUNDIDADE ' || public._obs_lista(public._obs_valores(v_ams, 'profundidade')), '')
      || coalesce(', COLETADA' || case when v_n = 1 then '' else 'S' end || ' NO DIA '
                  || public._obs_data(v_am->>'data_coleta'), '')
      || coalesce(', PARA ' || v_ens_t, '')
      || coalesce(', PROCTOR ' || upper(nullif(trim(v_am->>'proctor'), '')), '')
      || coalesce(', GC MÍNIMO DE ' || upper(nullif(trim(v_am->>'gc_minimo'), '')) || '%', '')
      || '. MATERIAL PROVENIENTE ' || v_emp || ' / ' || v_lote
      || '. REGISTRADO COM N° ' || v_num || '.';

  -- CPs de solo-cimento ------------------------------------------------------
  elsif v_tipo = 'cps_solo_cimento' then
    v_txt := 'FORAM ENTREGUES AO LABORATÓRIO ' || lpad(v_qtd::text, 2, '0') || ' CORPOS DE PROVA DE SOLO-CIMENTO'
      || coalesce(' (CPs ' || public._obs_cps(v_ams) || ')', '')
      || coalesce(' - ' || v_loc, '')
      || coalesce(', COM TEOR DE CIMENTO DE ' || upper(nullif(trim(v_am->>'teor_cimento'), '')) || '%', '')
      || '. CORPOS DE PROVA MOLDADOS PARA ' || coalesce(v_ens_t, 'O ENSAIO DE COMPRESSÃO')
      || coalesce(', MOLDAGEM FEITA NO DIA ' || public._obs_lista(array(
           select public._obs_data(d) from unnest(public._obs_valores(v_ams, 'data_moldagem')) d)), '')
      || '. CORPOS DE PROVA PROVENIENTES ' || v_emp || ' / ' || v_lote
      || '. REGISTRADOS COM N° ' || v_num || '.';

  -- Agregados -----------------------------------------------------------------
  elsif v_tipo = 'agregados' then
    v_x := coalesce(public._obs_lista(public._obs_valores(v_ams, 'tipo_agregado')), 'AGREGADO');
    v_txt := case when v_n = 1 then 'FOI ENTREGUE AO LABORATÓRIO UMA AMOSTRA DE ' || v_x
                  else 'FORAM ENTREGUES AO LABORATÓRIO ' || lpad(v_n::text, 2, '0') || ' AMOSTRAS DE ' || v_x end
      || coalesce(' ' || public._obs_lista(public._obs_valores(v_ams, 'granulometria')), '')
      || coalesce(' DA PEDREIRA ' || public._obs_lista(array(
           select regexp_replace(x, '^PEDREIRA\s*', '') from unnest(public._obs_valores(v_ams, 'pedreira')) x)), '')
      || coalesce(' - ORIGEM: ' || public._obs_lista(public._obs_valores(v_ams, 'origem')), '')
      || coalesce(', COLETADA' || case when v_n = 1 then '' else 'S' end || ' NO DIA '
                  || public._obs_data(v_am->>'data_coleta'), '')
      || coalesce(', DESTINAD' || case when v_n = 1 then 'A' else 'AS' end || ' A '
                  || public._obs_lista(public._obs_valores(v_ams, 'local_aplicacao')), '')
      || coalesce(', PARA ' || v_ens_t, '')
      || '. MATERIAL PROVENIENTE ' || v_emp || ' / ' || v_lote
      || '. REGISTRADO COM N° ' || v_num || '.';

  -- Ensaios especiais in loco --------------------------------------------------
  elsif v_tipo in ('deflectometria', 'mancha_areia', 'pendulo_britanico', 'densimetro', 'outros') then
    v_x := case v_tipo
             when 'deflectometria'    then 'DEFLECTOMETRIA'
                                           || coalesce(' (' || upper(nullif(trim(v_am->>'equipamento'), '')) || ')', '')
             when 'mancha_areia'      then 'MANCHA DE AREIA'
             when 'pendulo_britanico' then 'PÊNDULO BRITÂNICO'
             when 'densimetro'        then 'DENSÍMETRO NUCLEAR'
             else coalesce(upper(nullif(trim(v_am->>'descricao_ensaio'), '')), public._obs_lista(v_ens), '___')
           end;
    v_txt := 'SOLICITADA AO LABORATÓRIO A EXECUÇÃO DO ENSAIO DE ' || v_x || ' IN LOCO'
      || coalesce(' - ' || v_loc, '')
      || coalesce(', ' || upper(nullif(trim(v_am->>'qtd_pontos'), '')) || ' PONTOS', '')
      || coalesce(', INTERVALO DE ' || upper(nullif(trim(v_am->>'intervalo'), '')), '')
      || coalesce(', PREVISTO PARA O DIA ' || public._obs_data(v_am->>'data_desejada'), '')
      || '. SOLICITAÇÃO PROVENIENTE ' || v_emp || ' / ' || v_lote
      || '. REGISTRADO COM N° ' || v_num || '.';

  else
    v_txt := 'FOI ENTREGUE AO LABORATÓRIO AMOSTRA DE MATERIAL'
      || coalesce(' - ' || v_loc, '')
      || coalesce(', PARA ' || v_ens_t, '')
      || '. MATERIAL PROVENIENTE ' || v_emp || ' / ' || v_lote
      || '. REGISTRADO COM N° ' || v_num || '.';
  end if;

  return replace(v_txt, '..', '.');
end $$;

-- -----------------------------------------------------------------------------
-- 6. FR-IMOB-04 já pronta antes da O.S.
-- -----------------------------------------------------------------------------
-- Itens da FR-IMOB-04 marcados pelo pedido (especificações + ensaios do catálogo)
create or replace function public._fichas_os_marcados(p_pedido public.pedidos_ensaio)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(x.c, true), '{}'::jsonb)
    from (
      select e.codigo_frimob04 as c
        from public.ensaios e
       where e.id::text = any(coalesce(p_pedido.ensaios_ids, '{}')) and e.codigo_frimob04 is not null
      union
      select unnest(coalesce(p_pedido.especificacoes, '{}'))
    ) x
   where x.c ~ '^(ens|espec)_[a-z0-9_]+$'
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'fichas_os'
                    and column_name = x.c and data_type = 'boolean')
$$;

create or replace function public.tg_fichas_os_prefill()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_p    public.pedidos_ensaio;
  v_json jsonb;
begin
  new.contato := coalesce(nullif(trim(new.contato), ''), public._contato_lab_padrao());
  if new.previsao_entrega is null and new.data_solicitacao is not null then
    new.previsao_entrega := new.data_solicitacao + 60;
  end if;
  if new.pedido_id is null then return new; end if;
  select * into v_p from public.pedidos_ensaio where id = new.pedido_id;
  if not found then return new; end if;
  v_json := public._fichas_os_marcados(v_p);
  if v_json <> '{}'::jsonb then
    new := jsonb_populate_record(new, v_json);
  end if;
  return new;
end $$;

-- Prévia da FR-IMOB-04 (nada é gravado): os mesmos valores que a ficha recebe ao gerar a O.S.
create or replace function public.previa_ficha_os(p_pedido_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_p public.pedidos_ensaio;
  v_data date;
begin
  if not public.eh_lab() then
    raise exception 'Apenas o laboratório pode abrir a O.S.' using errcode = 'P0001';
  end if;
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
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
end $$;

-- -----------------------------------------------------------------------------
-- 2. Número 145/2026 + gerar_os com as localizações novas (versões da migração 16)
-- -----------------------------------------------------------------------------

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
end $$;

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
  if p_sequencial is null or p_sequencial < 1 or p_sequencial > 99999 then
    raise exception 'O número do PE deve estar entre 1 e 99999.' using errcode = 'P0001';
  end if;
  if p_sequencial = v_p.sequencial then return v_p; end if;
  if exists (select 1 from public.pedidos_ensaio
              where ano = v_p.ano and sequencial = p_sequencial and id <> v_p.id) then
    raise exception 'O pedido %/% já existe no sistema.', public._fmt_seq(p_sequencial), v_p.ano using errcode = 'P0001';
  end if;

  v_old := public._fmt_seq(coalesce(v_p.sequencial, 0));
  v_new := public._fmt_seq(p_sequencial);
  v_os  := case when v_p.numero_os is not null and v_p.numero_os not like 'PROV-%'
                then regexp_replace(v_p.numero_os, '[^.]+$', v_new) else v_p.numero_os end;

  update public.pedidos_ensaio
     set sequencial = p_sequencial,
         numero_pe  = v_new,
         numero_os  = v_os,
         historico  = coalesce(historico, '[]'::jsonb) || jsonb_build_array(
                        public._evento('Número do PE alterado', jsonb_build_object(
                          'de', v_old || '/' || v_p.ano, 'para', v_new || '/' || v_p.ano)))
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

  v_num := coalesce(v_p.numero_pe, '?') || '/' || coalesce(v_p.ano::text, '?');
  -- aceita "145/2026" (formato atual), "PE-2026-145" (antigo), "145" ou o sequencial
  if v_conf = '' or v_conf not in (upper(v_num), 'PE-' || coalesce(v_p.ano::text, '?') || '-' || coalesce(v_p.numero_pe, '?'),
                                   coalesce(v_p.numero_pe, '#'), coalesce(v_p.sequencial::text, '#'),
                                   coalesce(v_p.sequencial::text, '#') || '/' || coalesce(v_p.ano::text, '?')) then
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
            || public._fmt_seq(v_p.sequencial);

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
                'km',     coalesce(public._km_fmt(public._obs_ponto(a)), public._km_fmt(coalesce(nullif(a->>'km_inicial', ''), nullif(a->>'estaca_inicial', ''))), ''),
                'pista',  coalesce(a->>'pista', ''),
                'trilho', coalesce(a->>'trilho', a->>'faixa', ''))), '[]'::jsonb)
         from jsonb_array_elements(public._amostras(v_p.dados_amostra)) a
        where coalesce(public._obs_ponto(a), nullif(a->>'km_inicial', ''), nullif(a->>'estaca_inicial', ''),
                       nullif(a->>'pista', ''), nullif(a->>'faixa', '')) is not null),
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

-- -----------------------------------------------------------------------------
-- 7. Permissões
-- -----------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'gerar_os(uuid, date, text)', 'alterar_numero_pe(uuid, integer)', 'excluir_pedido(uuid, text)',
    'gerar_observacao_os(uuid)', 'salvar_ficha_os(uuid, jsonb)', 'previa_ficha_os(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array[
    'tg_pedido_numero_pe()', 'tg_fichas_os_prefill()', 'tg_traco_historico()',
    '_fichas_os_marcados(public.pedidos_ensaio)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;

-- Fim da migração 17.
