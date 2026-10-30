-- =============================================================================
-- CNRO Lab Control — Migração 38 (Entrega 40)
--   1. Ficha padrão de cada ensaio (a O.S. já nasce com a ficha escolhida)
--   2. Observação da FR-IMOB-04/05 resumida (várias amostras: quantidade + trecho)
--      e FR-IMOB-05 sempre com a observação; atualiza as fichas antigas não editadas
--   3. Resumo da O.S. para o Campo (imagem ou PDF anexado pelo laboratório)
-- =============================================================================
-- Pré-requisitos: migrações até a 37. Rodar no SQL Editor do Supabase.
-- Idempotente e numa única transação.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Textos de observação ANTES da mudança (para saber quais ninguém editou)
-- -----------------------------------------------------------------------------
create temp table _obs_antes on commit drop as
  select p.id as pedido_id, public.gerar_observacao_os(p.id) as texto
    from public.pedidos_ensaio p
   where exists (select 1 from public.fichas_os o where o.pedido_id = p.id)
      or exists (select 1 from public.fichas_solicitacao s where s.pedido_id = p.id);

-- -----------------------------------------------------------------------------
-- 1. Ficha padrão por ensaio
-- -----------------------------------------------------------------------------
alter table public.ensaios
  add column if not exists ficha_padrao_id uuid references public.fichas_ensaio(id) on delete set null;

comment on column public.ensaios.ficha_padrao_id is
  'Ficha que a O.S. já traz para este ensaio (o laboratorista pode trocar). Migração 38.';

create or replace function public._ficha_codigo(p_codigo text)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from public.fichas_ensaio where codigo = p_codigo and coalesce(ativa, true) limit 1
$$;

-- Ficha padrão "fixa" de cada ensaio (pelo código do ensaio na FR-IMOB-04)
update public.ensaios e
   set ficha_padrao_id = public._ficha_codigo(m.ficha)
  from (values
    ('ens_rice',                 'FR-IMOB-10'),
    ('ens_equiv_areia',          'FR-IMOB-08'),
    ('ens_viscosidade',          'FR-IMOB-28'),
    ('ens_penetracao',           'FR-IMOB-14'),
    ('ens_ponto_fulgor',         'FR-IMOB-14'),
    ('ens_ponto_amolecimento',   'FR-IMOB-14'),
    ('ens_recuperacao_elastica', 'FR-IMOB-14'),
    ('ens_ductilidade',          'FR-IMOB-14'),
    ('ens_conf_espessuras_asf',  'FR-IMOB-38'),
    ('ens_extracao_rotarex',     'FR-IMOB-22'),
    ('ens_extracao_soxhlet',     'FR-IMOB-22'),
    ('ens_marshall',             'FR-IMOB-13'),
    ('ens_dano_umidade',         'FR-IMOB-17'),
    ('ens_granulometria',        'FR-IMOB-34'),
    ('ens_compactacao_nt',       'FR-IMOB-55'),
    ('ens_compactacao_t',        'FR-IMOB-32'),
    ('ens_massa_esp_insitu',     'FR-IMOB-35'),
    ('ens_resistencia_tracao',   'FR-IMOB-33'),
    ('ens_conf_espessuras_solo', 'FR-IMOB-38'),
    ('ens_benkelman',            'FR-IMOB-29'),
    ('ens_dens_agr_graudo',      'FR-IMOB-06'),
    ('ens_dens_agr_miudo',       'FR-IMOB-07'),
    ('ens_compressao_axial',     'FR-IMOB-50')
  ) as m(codigo, ficha)
 where e.codigo_frimob04 = m.codigo
   and e.ficha_padrao_id is null;

-- Ficha padrão para um ensaio DESTE pedido: algumas dependem do material
create or replace function public._ficha_padrao(p_pedido public.pedidos_ensaio, p_ensaio_id uuid)
returns uuid
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_e   public.ensaios;
  v_sub text := coalesce(p_pedido.sub_tipo, '');
  v_lig text := upper(coalesce(public._amostras(p_pedido.dados_amostra)->0->>'tipo_ligante', ''));
  v_cod text;
begin
  select * into v_e from public.ensaios where id = p_ensaio_id;
  v_cod := coalesce(v_e.codigo_frimob04, '');

  -- Compressão axial: CPs de solo-cimento → FR-IMOB-33; concreto → FR-IMOB-50
  if v_cod = 'ens_compressao_axial' and v_sub = 'cps_solo_cimento' then
    return coalesce(public._ficha_codigo('FR-IMOB-33'), v_e.ficha_padrao_id);
  end if;
  -- Granulometria: agregados → FR-IMOB-53; massa asfáltica → FR-IMOB-54; solos → padrão (FR-IMOB-34)
  if v_cod = 'ens_granulometria' and v_sub = 'agregados' then
    return coalesce(public._ficha_codigo('FR-IMOB-53'), v_e.ficha_padrao_id);
  end if;
  if v_cod = 'ens_granulometria' and v_sub in ('massa_asfaltica', 'massa') then
    return coalesce(public._ficha_codigo('FR-IMOB-54'), v_e.ficha_padrao_id);
  end if;
  -- Caracterização do ligante: pelo tipo de ligante informado no pedido
  if v_cod in ('ens_penetracao', 'ens_ponto_fulgor', 'ens_ponto_amolecimento', 'ens_recuperacao_elastica', 'ens_ductilidade') then
    if v_lig ~ '30/45|TLA' then return coalesce(public._ficha_codigo('FR-IMOB-18'), v_e.ficha_padrao_id); end if;
    if v_lig ~ 'BORR|AB-?8|AB-?22|ECOFLEX' then return coalesce(public._ficha_codigo('FR-IMOB-15'), v_e.ficha_padrao_id); end if;
  end if;
  -- Módulo de resiliência: solo-cimento → FR-IMOB-51; solos → FR-IMOB-52
  if v_cod = 'ens_modulo_resiliencia' then
    if v_sub = 'cps_solo_cimento' then return coalesce(public._ficha_codigo('FR-IMOB-51'), v_e.ficha_padrao_id); end if;
    if v_sub in ('jazida', 'caixa_emprestimo', 'segmento') then return coalesce(public._ficha_codigo('FR-IMOB-52'), v_e.ficha_padrao_id); end if;
  end if;
  if v_e.ficha_padrao_id is not null then return v_e.ficha_padrao_id; end if;

  -- Ensaios especiais in loco: pelo tipo de amostra do pedido
  return case v_sub
           when 'mancha_areia'      then public._ficha_codigo('FR-IMOB-30')
           when 'pendulo_britanico' then public._ficha_codigo('FR-IMOB-49')
           when 'densimetro'        then public._ficha_codigo('FR-IMOB-57')
           when 'deflectometria'    then public._ficha_codigo('FR-IMOB-29')
         end;
end $$;

-- Ensaio novo na O.S. (Gerar O.S. ou "+ Adicionar ensaio") já vem com a ficha padrão
create or replace function public.tg_ensaio_os_ficha_padrao()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare v_p public.pedidos_ensaio;
begin
  if new.ficha_ensaio_id is null and new.ensaio_id is not null then
    select * into v_p from public.pedidos_ensaio where id = new.pedido_id;
    if found then new.ficha_ensaio_id := public._ficha_padrao(v_p, new.ensaio_id); end if;
  end if;
  return new;
end $$;

drop trigger if exists a05_ensaio_os_ficha_padrao on public.ensaios_os;
create trigger a05_ensaio_os_ficha_padrao
  before insert on public.ensaios_os
  for each row execute function public.tg_ensaio_os_ficha_padrao();

-- -----------------------------------------------------------------------------
-- 2. Observação resumida
-- -----------------------------------------------------------------------------
-- Pontos de coleta/extração: até 2 → "KM a E KM b"; 3 ou mais → "DO KM menor AO KM maior"
create or replace function public._obs_kms(p_amostras jsonb)
returns text
language sql immutable
as $$
  with pts as (
    select distinct public._km_fmt(public._obs_ponto(a)) k
      from jsonb_array_elements(coalesce(p_amostras, '[]'::jsonb)) a
     where public._km_fmt(public._obs_ponto(a)) is not null
  ), num as (
    select k, case when k ~ '^\d+(,\d+)?$' then replace(k, ',', '.')::numeric end v from pts
  )
  select case
           when (select count(*) from num) = 0 then null
           when (select count(*) from num) >= 3 and (select bool_and(v is not null) from num)
             then 'DO KM ' || (select k from num order by v limit 1) || ' AO KM ' || (select k from num order by v desc limit 1)
           else public._obs_lista(array(select 'KM ' || k from num order by v nulls last, k), '; ')
         end
$$;

-- CPs: sequência → "101 A 106"; até 2 → lista; muitos fora de sequência → não lista (vão no Detalhar demanda)
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
  if n <= 2 then return public._obs_lista(v); end if;
  return null;
end $$;

-- Datas das amostras: "NO DIA x" · "NOS DIAS x E y" · "ENTRE OS DIAS x E y" (prep 'NO')
--                     "AO DIA x" · "AOS DIAS x E y" · "AO PERÍODO DE x A y"   (prep 'AO')
create or replace function public._obs_quando(p_amostras jsonb, p_chave text, p_prep text default 'NO')
returns text
language sql immutable
as $$
  with d as (
    select distinct (a->>p_chave)::date dia
      from jsonb_array_elements(coalesce(p_amostras, '[]'::jsonb)) a
     where (a->>p_chave) ~ '^\d{4}-\d{2}-\d{2}'
  ), n as (select count(*) c, min(dia) ini, max(dia) fim from d)
  select case
           when c = 0 then null
           when c = 1 then p_prep || ' DIA ' || to_char(ini, 'DD/MM/YYYY')
           when c = 2 then p_prep || 'S DIAS ' || to_char(ini, 'DD/MM/YYYY') || ' E ' || to_char(fim, 'DD/MM/YYYY')
           when p_prep = 'AO' then 'AO PERÍODO DE ' || to_char(ini, 'DD/MM/YYYY') || ' A ' || to_char(fim, 'DD/MM/YYYY')
           else 'ENTRE OS DIAS ' || to_char(ini, 'DD/MM/YYYY') || ' E ' || to_char(fim, 'DD/MM/YYYY')
         end
    from n
$$;

create or replace function public.gerar_observacao_os(p_pedido_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    v_txt := 'FORAM ENTREGUES AO LABORATÓRIO ' || lpad(v_qtd::text, 2, '0') || ' CORPOS DE PROVA DE CONCRETO'
      || coalesce(' (CPs ' || public._obs_cps(v_ams) || ')', '')
      || coalesce(' ' || public._obs_artigo(nullif(concat_ws(' ',
                       coalesce(nullif(v_am->>'elemento', ''), nullif(v_am->>'estrutura', '')),
                       coalesce(nullif(v_am->>'local_concretagem', ''), nullif(v_am->>'local', ''))), '')), '')
      || '. CORPOS DE PROVA MOLDADOS PARA ' || coalesce(v_ens_t, 'O ENSAIO DE COMPRESSÃO AXIAL')
      || coalesce(', MOLDAGEM FEITA ' || public._obs_quando(v_ams, 'data_moldagem', 'NO'), '')
      || '. CORPOS DE PROVA PROVENIENTES ' || v_emp || ' / ' || v_lote
      || '. REGISTRADOS COM N° ' || v_num || '.';

  -- CPs extraídos de pista -------------------------------------------------
  elsif v_tipo in ('cps_extraidos_pista', 'cp_pista') then
    v_txt := 'FORAM ENTREGUES AO LABORATÓRIO DA CNRO ' || lpad(v_qtd::text, 2, '0')
      || ' CPs DE ' || public._obs_mistura(coalesce(v_t.tipo_mistura, v_am->>'tipo_mistura'))
      || coalesce(' - ' || v_loc, '')
      || coalesce(', COM A DATA REFERENTE ' || public._obs_quando(v_ams, 'data_aplicacao', 'AO'), '')
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
      || coalesce(', MOLDAGEM FEITA ' || public._obs_quando(v_ams, 'data_moldagem', 'NO'), '')
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
end $function$;

-- FR-IMOB-04 e 05: observação vazia recebe o texto padrão (a FR-05 salva antes de gerar a O.S.
-- nascia sem observação, e o Gerar O.S. não a preenchia)
create or replace function public.tg_fichas_observacao_padrao()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if coalesce(trim(new.observacao), '') = '' and new.pedido_id is not null then
    new.observacao := public.gerar_observacao_os(new.pedido_id);
  end if;
  return new;
end $$;

drop trigger if exists a20_fichas_os_observacao on public.fichas_os;
create trigger a20_fichas_os_observacao
  before insert or update on public.fichas_os
  for each row execute function public.tg_fichas_observacao_padrao();

drop trigger if exists a20_fichas_sol_observacao on public.fichas_solicitacao;
create trigger a20_fichas_sol_observacao
  before insert or update on public.fichas_solicitacao
  for each row execute function public.tg_fichas_observacao_padrao();

-- Fichas já existentes: vazias, ou com o texto que o sistema gerou (ninguém editou) → texto novo
update public.fichas_os f
   set observacao = public.gerar_observacao_os(f.pedido_id)
  from _obs_antes a
 where a.pedido_id = f.pedido_id
   and (coalesce(trim(f.observacao), '') = '' or trim(f.observacao) = trim(a.texto))
   and f.observacao is distinct from public.gerar_observacao_os(f.pedido_id);

update public.fichas_solicitacao f
   set observacao = public.gerar_observacao_os(f.pedido_id)
  from _obs_antes a
 where a.pedido_id = f.pedido_id
   and (coalesce(trim(f.observacao), '') = '' or trim(f.observacao) = trim(a.texto))
   and f.observacao is distinct from public.gerar_observacao_os(f.pedido_id);

-- -----------------------------------------------------------------------------
-- 3. Resumo da O.S. para o Campo (um arquivo por O.S.: imagem ou PDF)
-- -----------------------------------------------------------------------------
create table if not exists public.os_resumos (
  pedido_id   uuid primary key references public.pedidos_ensaio(id) on delete cascade,
  caminho     text not null,               -- bucket "resumos": <pedido_id>/<arquivo>
  nome        text,
  tipo        text,                        -- image/jpeg, image/png, application/pdf
  tamanho     integer,
  enviado_por uuid references public.usuarios(id),
  enviado_em  timestamptz not null default now()
);
alter table public.os_resumos enable row level security;

-- Quem anexa/exclui: Gestor, laboratorista responsável (histórico: quem tem a permissão)
create or replace function public._pode_gerir_resumo(p_pedido_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select public.eh_gestor()
                       or p.laboratorista_id = public.usuario_atual_id()
                       or (p.lancamento_historico and public.eh_lancador_historico())
                     from public.pedidos_ensaio p where p.id = p_pedido_id), false)
$$;

-- Quem vê: equipe do laboratório; o solicitante, quando algum ensaio já foi liberado para o Campo
create or replace function public._resumo_visivel(p_pedido_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.eh_equipe_lab()
      or public._pode_gerir_resumo(p_pedido_id)
      or exists (select 1 from public.pedidos_ensaio p
                  where p.id = p_pedido_id and p.solicitante_id = public.usuario_atual_id()
                    and exists (select 1 from public.ensaios_os e
                                 where e.pedido_id = p.id and e.status = 'aprovado' and coalesce(e.visivel_campo, false)))
$$;

grant execute on function public._pode_gerir_resumo(uuid), public._resumo_visivel(uuid) to authenticated;

drop policy if exists os_resumos_select on public.os_resumos;
drop policy if exists os_resumos_insert on public.os_resumos;
drop policy if exists os_resumos_update on public.os_resumos;
drop policy if exists os_resumos_delete on public.os_resumos;
create policy os_resumos_select on public.os_resumos for select to authenticated
  using (public._resumo_visivel(pedido_id));
create policy os_resumos_insert on public.os_resumos for insert to authenticated
  with check (public._pode_gerir_resumo(pedido_id));
create policy os_resumos_update on public.os_resumos for update to authenticated
  using (public._pode_gerir_resumo(pedido_id)) with check (public._pode_gerir_resumo(pedido_id));
create policy os_resumos_delete on public.os_resumos for delete to authenticated
  using (public._pode_gerir_resumo(pedido_id));
grant select, insert, update, delete on public.os_resumos to authenticated;

insert into storage.buckets (id, name, public)
values ('resumos', 'resumos', false)
on conflict (id) do update set public = false;

-- pasta = id do pedido
create or replace function public._pasta_pedido(p_nome text)
returns uuid
language sql stable
as $$
  select case when (storage.foldername(p_nome))[1] ~ '^[0-9a-fA-F-]{36}$'
              then ((storage.foldername(p_nome))[1])::uuid end
$$;

drop policy if exists resumos_select on storage.objects;
drop policy if exists resumos_insert on storage.objects;
drop policy if exists resumos_update on storage.objects;
drop policy if exists resumos_delete on storage.objects;
create policy resumos_select on storage.objects for select to authenticated
  using (bucket_id = 'resumos' and public._resumo_visivel(public._pasta_pedido(name)));
create policy resumos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'resumos' and public._pode_gerir_resumo(public._pasta_pedido(name)));
create policy resumos_update on storage.objects for update to authenticated
  using (bucket_id = 'resumos' and public._pode_gerir_resumo(public._pasta_pedido(name)));
create policy resumos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'resumos' and public._pode_gerir_resumo(public._pasta_pedido(name)));

notify pgrst, 'reload schema';

commit;

-- Conferência:
-- select e.nome, f.codigo from public.ensaios e left join public.fichas_ensaio f on f.id = e.ficha_padrao_id
--  where e.ativo order by e.categoria, e.nome;
