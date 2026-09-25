-- Simulação mínima do Supabase + tabelas no estado anterior à migração 10
-- (colunas conforme Esquema_Banco_Supabase_2026-09-25; as migrações 10–13 completam o resto)
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/')
$$;
grant usage on schema storage to authenticated;

create extension if not exists pgcrypto;

create function public.update_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create table public.empresas (
  id uuid primary key default gen_random_uuid(), nome text not null, lote text, rodovia text,
  ativo boolean default true, created_at timestamptz default now());

create table public.usuarios (
  id uuid primary key default gen_random_uuid(), auth_id uuid references auth.users(id) on delete cascade,
  nome text not null, cargo text, perfil text not null, email text not null unique, empresa text, lote text,
  assinatura_url text, foto_url text, status text default 'Ativo', created_at timestamptz default now(),
  check (perfil = any (array['DEV','GESTOR','LAB','ASSIST','CAMPO'])),
  check (status = any (array['Ativo','Inativo'])));

create table public.ensaios (
  id uuid primary key default gen_random_uuid(), nome text not null, categoria text not null, norma text,
  ordem integer default 0, ativo boolean default true, created_at timestamptz default now());

create table public.fichas_ensaio (
  id uuid primary key default gen_random_uuid(), codigo text not null unique, nome text not null,
  ensaio_id uuid references public.ensaios(id), versao text default 'Rev00', arquivo_url text,
  mapeamento jsonb default '{}'::jsonb, ativa boolean default true,
  created_at timestamptz default now(), updated_at timestamptz default now());

create table public.tracos_aprovados (
  id uuid primary key default gen_random_uuid(), empresa_id uuid references public.empresas(id),
  nome_traco text not null, created_at timestamptz default now(), updated_at timestamptz default now());

create table public.fichas_os (
  id uuid primary key default gen_random_uuid(), pedido_id uuid, numero_os text not null,
  data_solicitacao date, inicio_ensaios date, fim_ensaios date, previsao_entrega date, analise_ensaios date,
  entrega_solicitacao date, repactuacao_data date, motivo_repactuacao text, indicador text,
  obra text, lote text, solicitante text, contato text,
  espec_programar_coleta boolean default false, espec_caract_agregados boolean default false,
  espec_caract_ligante boolean default false, espec_caract_rap boolean default false,
  espec_dosagem_asfaltica boolean default false, espec_investigativos boolean default false,
  espec_compressao boolean default false, espec_controle_campo boolean default false,
  espec_misturas_frescas boolean default false, espec_misturas_endurecidas boolean default false,
  espec_outros boolean default false, espec_outros_texto text,
  ens_rice boolean default false, ens_equiv_areia boolean default false, ens_viscosidade boolean default false,
  ens_penetracao boolean default false, ens_ponto_fulgor boolean default false, ens_ponto_amolecimento boolean default false,
  ens_recuperacao_elastica boolean default false, ens_ductilidade boolean default false,
  ens_conf_espessuras_asf boolean default false, ens_extracao_rotarex boolean default false,
  ens_extracao_soxhlet boolean default false, ens_marshall boolean default false, ens_dano_umidade boolean default false,
  ens_modulo_resiliencia boolean default false, ens_fadiga boolean default false, ens_deformacao_perm boolean default false,
  ens_outros_asfalto boolean default false, ens_granulometria boolean default false, ens_compactacao_nt boolean default false,
  ens_compactacao_t boolean default false, ens_teor_umidade boolean default false, ens_massa_esp_insitu boolean default false,
  ens_resistencia_tracao boolean default false, ens_conf_espessuras_solo boolean default false,
  ens_benkelman boolean default false, ens_dens_agr_graudo boolean default false, ens_dens_agr_miudo boolean default false,
  ens_outros_solos boolean default false, ens_compressao_axial boolean default false,
  observacao text, observacao_editada boolean default false,
  elaborado_por text default 'Thyago Biasin', revisado_por text default 'Samara Rodrigues', aprovado_por text default 'Rheno Tormin',
  status text default 'rascunho' check (status = any (array['rascunho','emitida','impressa'])),
  criado_por uuid references public.usuarios(id), created_at timestamptz default now(), updated_at timestamptz default now());

create table public.fichas_solicitacao (
  id uuid primary key default gen_random_uuid(), pedido_id uuid, obra text, lote text, solicitante text, contato text,
  tipo_contraprova boolean default false, tipo_investigacao boolean default false, tipo_estudo boolean default false,
  tipo_outros boolean default false, tipo_outros_texto text, localizacoes jsonb default '[]'::jsonb,
  observacao text, observacao_editada boolean default false,
  elaborado_por text default 'Thyago Biasin', revisado_por text default 'Samara Rodrigues', aprovado_por text default 'Rheno Tormin',
  status text default 'rascunho' check (status = any (array['rascunho','emitida','impressa'])),
  criado_por uuid references public.usuarios(id), created_at timestamptz default now(), updated_at timestamptz default now());

create table public.pedidos_ensaio (
  id uuid primary key default gen_random_uuid(), numero_pe text, numero_os text, sequencial integer, ano integer,
  status text default 'aguardando_lab', material text, solicitante_id uuid references public.usuarios(id),
  empresa text, lote text, dados_amostra jsonb default '{}'::jsonb, ensaios_ids text[] default '{}'::text[],
  observacoes text, motivo_devolucao text, aberto_por uuid references public.usuarios(id), aberto_em timestamptz,
  finalizado_por uuid references public.usuarios(id), finalizado_em timestamptz,
  visibilidade_campo jsonb default '{}'::jsonb, historico jsonb default '[]'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  tipo_solicitacao text, tipo_amostra text, sub_tipo text,
  ficha_os_id uuid references public.fichas_os(id), ficha_sol_id uuid references public.fichas_solicitacao(id),
  traco_id uuid references public.tracos_aprovados(id), revisado_em timestamptz, revisado_por_id uuid references public.usuarios(id));

alter table public.fichas_os add foreign key (pedido_id) references public.pedidos_ensaio(id) on delete cascade;
alter table public.fichas_solicitacao add foreign key (pedido_id) references public.pedidos_ensaio(id) on delete cascade;

create table public.resultados (
  id uuid primary key default gen_random_uuid(), pedido_id uuid references public.pedidos_ensaio(id) on delete cascade,
  ensaio_os_id uuid, ensaio_id uuid references public.ensaios(id), assistente_id uuid references public.usuarios(id),
  laboratorista_id uuid references public.usuarios(id), status text default 'pendente', conformidade text,
  observacoes text, data_execucao date, data_revisao date, norma_utilizada text,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  check (conformidade = any (array['Conforme','Não Conforme','Parcialmente Conforme','Pendente'])),
  check (status = any (array['pendente','em_execucao','aguardando_revisao','aprovado','reprovado'])));

create table public.ensaios_os (
  id uuid primary key default gen_random_uuid(), pedido_id uuid references public.pedidos_ensaio(id) on delete cascade,
  ensaio_id uuid references public.ensaios(id), nome_ensaio text, assistente_id uuid references public.usuarios(id),
  status text default 'pendente', modo_preenchi text default 'digital' check (modo_preenchi = any (array['digital','upload'])),
  dados_resultado jsonb default '{}'::jsonb, arquivo_url text, visivel_campo boolean default false,
  devolvido_motivo text, created_at timestamptz default now(), ficha_ensaio_id uuid references public.fichas_ensaio(id),
  resultado_id uuid references public.resultados(id), data_atribuicao timestamptz, data_conclusao timestamptz,
  devolvido_em timestamptz, devolvido_por_id uuid references public.usuarios(id));

alter table public.resultados add foreign key (ensaio_os_id) references public.ensaios_os(id) on delete cascade;

create table public.resultado_marshall (
  id uuid primary key default gen_random_uuid(), resultado_id uuid references public.resultados(id) on delete cascade,
  codigo_cp text, gmb_obtido numeric, va_pct numeric, estabilidade_kgf numeric, conformidade_geral text,
  created_at timestamptz default now());
create table public.resultado_teor_betume (
  id uuid primary key default gen_random_uuid(), resultado_id uuid references public.resultados(id) on delete cascade,
  metodo text check (metodo = any (array['Rotarex','Soxhlet'])), teor_obtido_pct numeric, conformidade text,
  created_at timestamptz default now());

create table public.ensaio_resultado_map (ensaio_nome text primary key, tabela_resultado text not null, descricao text);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(), tabela text not null, registro_id uuid, acao text not null,
  usuario_id uuid references public.usuarios(id), usuario_nome text, dados_antes jsonb, dados_depois jsonb,
  ip text, created_at timestamptz default now());

create trigger set_updated_at before update on public.pedidos_ensaio for each row execute function public.update_updated_at();
create trigger set_updated_at_fichas_os before update on public.fichas_os for each row execute function public.update_updated_at();
create trigger set_updated_at_fichas_sol before update on public.fichas_solicitacao for each row execute function public.update_updated_at();
create trigger set_updated_at_resultados before update on public.resultados for each row execute function public.update_updated_at();

grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
