-- =============================================================================
-- CNRO Lab Control — Migração 16: numeração com 3+ dígitos e observação padrão
--                    das fichas FR-IMOB-04 / FR-IMOB-05
-- =============================================================================
-- Pré-requisito: migrações 14 e 15. Rodar no SQL Editor. Idempotente, transação única.
--
--  1. Número do PE / final da O.S. como no papel: mínimo de 3 dígitos (094, 137)
--     e, a partir de 1000, cresce normalmente (1000, 1024…). Limite: 99999.
--     Os números já gravados (0094) são convertidos (094), inclusive na O.S.,
--     na FR-IMOB-04 e no texto da observação.
--  2. Observação padrão (gerar_observacao_os) no estilo das fichas em papel, por
--     tipo de amostra, montada com os dados do pedido do Campo. Sai pronta nas
--     duas fichas; o laboratorista só edita se precisar.
--  3. FR-IMOB-04 já sai com previsão de entrega = data da solicitação + 60 dias
--     e com o contato padrão do laboratório (as duas editáveis).
--     FR-IMOB-05 também recebe o contato padrão.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Numeração
-- -----------------------------------------------------------------------------
create or replace function public._fmt_seq(p integer)
returns text
language sql immutable
as $$
  select case when p is null then null
              when p < 1000 then lpad(p::text, 3, '0')
              else p::text end
$$;

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
      raise exception 'O PE-%-% já existe no sistema.', v_ano, public._fmt_seq(v_manual) using errcode = 'P0001';
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
    raise exception 'O PE-%-% já existe no sistema.', v_p.ano, public._fmt_seq(p_sequencial) using errcode = 'P0001';
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

-- Gerar O.S. (versão da migração 14; muda só o final do número: _fmt_seq)
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

-- -----------------------------------------------------------------------------
-- 2. Observação padrão das fichas (FR-IMOB-04 e FR-IMOB-05)
-- -----------------------------------------------------------------------------
-- Auxiliares de texto (maiúsculas, como no papel)

-- "a" | "a E b" | "a, b E c"
create or replace function public._obs_lista(p text[])
returns text
language sql immutable
as $$
  select case coalesce(array_length(p, 1), 0)
           when 0 then null
           when 1 then p[1]
           else array_to_string(p[1:array_length(p, 1) - 1], ', ') || ' E ' || p[array_length(p, 1)]
         end
$$;

-- Valores não vazios de um campo em todas as amostras, na ordem (p_distintos: sem repetir)
create or replace function public._obs_valores(p_amostras jsonb, p_campo text, p_distintos boolean default true)
returns text[]
language sql immutable
as $$
  select coalesce(array_agg(v order by o), '{}')
    from (
      select upper(trim(a->>p_campo)) as v, min(n) as o
        from jsonb_array_elements(coalesce(p_amostras, '[]'::jsonb)) with ordinality as t(a, n)
       where nullif(trim(a->>p_campo), '') is not null
       group by case when p_distintos then upper(trim(a->>p_campo)) else n::text end, upper(trim(a->>p_campo))
    ) x
$$;

-- '2026-03-20' → '20/03/2026'
create or replace function public._obs_data(p text)
returns text
language sql immutable
as $$
  select case when nullif(trim(p), '') is null then null
              when p ~ '^\d{4}-\d{2}-\d{2}' then to_char(substr(p, 1, 10)::date, 'DD/MM/YYYY')
              else upper(trim(p)) end
$$;

-- '728+400' → 'KM 728+400'
create or replace function public._obs_km(p text)
returns text
language sql immutable
as $$
  select case when nullif(trim(p), '') is null then null
              when p ~* '^\s*km' then upper(regexp_replace(trim(p), '^[kK][mM]\s*', 'KM '))
              else 'KM ' || upper(trim(p)) end
$$;

-- '1ª Faixa' → 'FX-01'
create or replace function public._obs_faixa(p text)
returns text
language sql immutable
as $$
  select case when nullif(trim(p), '') is null then null
              when p ~ '^\s*\d' then 'FX-' || lpad(substring(p from '\d+'), 2, '0')
              else upper(trim(p)) end
$$;

-- 'CBUQ' / 'CAUQ' / vazio → 'C.A.U.Q.'
create or replace function public._obs_mistura(p text)
returns text
language sql immutable
as $$
  select case when nullif(trim(p), '') is null
                or upper(regexp_replace(p, '[^A-Za-z]', '', 'g')) in ('CBUQ', 'CAUQ') then 'C.A.U.Q.'
              else upper(trim(p)) end
$$;

-- 'Consórcio X' → 'DO CONSÓRCIO X'; 'Construtora Y' → 'DA CONSTRUTORA Y'
create or replace function public._obs_empresa(p text)
returns text
language sql immutable
as $$
  select case
           when nullif(trim(p), '') is null then 'DE ___'
           when upper(trim(p)) ~ '^(CONS[OÓ]RCIO|GRUPO|DNIT|DER)' then 'DO ' || upper(trim(p))
           when upper(trim(p)) ~ '^(CONSTRUTORA|EMPRESA|CONCESSION[AÁ]RIA|ENGENHARIA|PEDREIRA|USINA)' then 'DA ' || upper(trim(p))
           else 'DE ' || upper(trim(p))
         end
$$;

-- Artigo para a estrutura do concreto: 'DA VIGA…', 'DO PILAR…'
create or replace function public._obs_artigo(p text)
returns text
language sql immutable
as $$
  select case
           when nullif(trim(p), '') is null then null
           when split_part(upper(trim(p)), ' ', 1) ~ '(A|AS|ÇÃO|ÇÕES|GEM|LAJE|LAJES|PAREDE|PAREDES|PONTE|PONTES|BASE|BASES|SAPATA)$'
             then 'DA ' || upper(trim(p))
           else 'DO ' || upper(trim(p))
         end
$$;

-- 'Lote 3' → 'LOTE 03'
create or replace function public._obs_lote(p text)
returns text
language sql immutable
as $$
  select case when nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '') is not null
                then 'LOTE ' || lpad(regexp_replace(p, '\D', '', 'g'), 2, '0')
              when nullif(trim(p), '') is not null then upper(trim(p))
              else 'LOTE ___' end
$$;

-- Nomes dos ensaios do pedido, na ordem do catálogo: 'COMPRESSÃO AXIAL'
create or replace function public._obs_ensaios(p_ids text[])
returns text[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(n order by n), '{}')
    from (select distinct upper(trim(regexp_replace(e.nome, '\s+de\s+corpos?\s+de\s+prova\s*$', '', 'i'))) as n
            from public.ensaios e
           where e.id::text = any(coalesce(p_ids, '{}'))
             and e.nome !~* '^outros') x
$$;

create or replace function public.gerar_observacao_os(p_pedido_id uuid)
returns text
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_p     public.pedidos_ensaio;
  v_ams   jsonb;
  v_am    jsonb;
  v_n     integer;           -- nº de amostras
  v_qtd   integer;           -- nº de CPs
  v_emp   text;
  v_lote  text;
  v_ano   text;
  v_num   text;              -- '137/2026'
  v_ens   text[];
  v_ens_t text;              -- 'O ENSAIO DE X' | 'OS ENSAIOS DE X E Y'
  v_loc   text;              -- 'KM a, KM b / NORTE / FX-01 / 2ª CAMADA'
  v_tipo  text;
  v_txt   text;
  v_x     text;
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
  v_ano  := coalesce(v_p.ano::text, extract(year from v_p.created_at)::text);
  v_num  := coalesce(public._fmt_seq(v_p.sequencial), '___') || '/' || v_ano;
  v_ens  := public._obs_ensaios(v_p.ensaios_ids);
  v_ens_t := case coalesce(array_length(v_ens, 1), 0)
               when 0 then null
               when 1 then 'O ENSAIO DE ' || v_ens[1]
               else 'OS ENSAIOS DE ' || public._obs_lista(v_ens) end;

  -- Localização: estacas (uma por amostra, ou estaca inicial/final), pista, faixa, camada
  v_x := public._obs_lista(array(select public._obs_km(k)
                                   from unnest(public._obs_valores(v_ams, 'estaca', false)) k));
  if v_x is null then
    v_x := concat_ws(' AO ', public._obs_km(v_am->>'estaca_inicial'), public._obs_km(v_am->>'estaca_final'));
  end if;
  v_loc := nullif(concat_ws(' / ',
             nullif(v_x, ''),
             public._obs_lista(public._obs_valores(v_ams, 'pista')),
             public._obs_lista(array(select public._obs_faixa(f) from unnest(public._obs_valores(v_ams, 'faixa')) f)),
             public._obs_lista(public._obs_valores(v_ams, 'camada'))), '');

  v_tipo := v_p.sub_tipo;

  -- Concreto --------------------------------------------------------------
  if v_tipo in ('concreto', 'cp_concreto') then
    v_txt := 'FORAM ENTREGUES AO LABORATÓRIO CORPOS DE PROVA DE CONCRETO'
      || coalesce(' (CPs ' || public._obs_lista(public._obs_valores(v_ams, 'numeracao_cps')) || ')', '')
      || coalesce(' ' || public._obs_artigo(nullif(concat_ws(' ', v_am->>'estrutura', v_am->>'local'), '')), '')
      || '. CORPOS DE PROVA MOLDADOS PARA ' || coalesce(v_ens_t, 'O ENSAIO DE COMPRESSÃO AXIAL')
      || coalesce(', MOLDAGEM FEITA NO DIA ' || public._obs_lista(array(
           select public._obs_data(d) from unnest(public._obs_valores(v_ams, 'data_moldagem')) d)), '')
      || '. CORPOS DE PROVA PROVENIENTES ' || v_emp || ' / ' || v_lote
      || '. REGISTRADOS COM N° ' || v_num || '.';

  -- CPs extraídos de pista -------------------------------------------------
  elsif v_tipo in ('cps_extraidos_pista', 'cp_pista') then
    v_txt := 'FORAM ENTREGUES AO LABORATÓRIO DA CNRO ' || lpad(v_qtd::text, 2, '0')
      || ' CPs DE ' || public._obs_mistura(v_am->>'tipo_mistura')
      || coalesce(' - ' || v_loc, '')
      || coalesce(', COM A DATA REFERENTE AO DIA ' || public._obs_lista(array(
           select public._obs_data(d) from unnest(public._obs_valores(v_ams, 'data_aplicacao')) d)), '')
      || '. CORPOS DE PROVA PROVENIENTES ' || v_emp || ' / ' || v_lote
      || ', PARA CONFERÊNCIA DE PARÂMETROS. REGISTRADO COMO OS N° ' || v_num || '.';

  -- Massa asfáltica -------------------------------------------------------
  elsif v_tipo in ('massa_asfaltica', 'massa') then
    v_x := public._obs_mistura(v_am->>'tipo_mistura')
           || coalesce(' ' || public._obs_lista(public._obs_valores(v_ams, 'faixa_granulometrica')), '');
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

  -- Jazida / caixa de empréstimo -------------------------------------------
  elsif v_tipo in ('jazida', 'caixa_emprestimo') then
    v_x := public._obs_lista(array(
             select regexp_replace(j, '^(JAZIDA|CAIXA DE EMPR[EÉ]STIMO)\s*', '')
               from unnest(public._obs_valores(v_ams, 'jazida')) j));
    v_txt := case when v_n = 1 then 'FOI ENTREGUE AO LABORATÓRIO UMA AMOSTRA DE SOLO'
                  else 'FORAM ENTREGUES AO LABORATÓRIO ' || lpad(v_n::text, 2, '0') || ' AMOSTRAS DE SOLO' end
      || case when v_tipo = 'jazida' then ' DA JAZIDA' else ' DA CAIXA DE EMPRÉSTIMO' end
      || coalesce(' ' || nullif(v_x, ''), '')
      || coalesce(' - ' || public._obs_lista(public._obs_valores(v_ams, 'municipio')), '')
      || coalesce(', PROFUNDIDADE ' || public._obs_lista(public._obs_valores(v_ams, 'profundidade')), '')
      || coalesce(', COLETADA' || case when v_n = 1 then '' else 'S' end || ' NO DIA '
                  || public._obs_data(v_am->>'data_coleta'), '')
      || coalesce(', PARA ' || v_ens_t, '')
      || '. MATERIAL PROVENIENTE ' || v_emp || ' / ' || v_lote
      || '. REGISTRADO COM N° ' || v_num || '.';

  -- Segmento / aterro / sub-base / base -----------------------------------
  elsif v_tipo = 'segmento' then
    v_txt := case when v_n = 1 then 'FOI ENTREGUE AO LABORATÓRIO UMA AMOSTRA DE SOLO'
                  else 'FORAM ENTREGUES AO LABORATÓRIO ' || lpad(v_n::text, 2, '0') || ' AMOSTRAS DE SOLO' end
      || coalesce(' - ' || v_loc, '')
      || coalesce(', PARA ' || v_ens_t, '')
      || coalesce(', PROCTOR ' || upper(nullif(trim(v_am->>'proctor'), '')), '')
      || coalesce(', GC MÍNIMO DE ' || upper(nullif(trim(v_am->>'gc_minimo'), '')) || '%', '')
      || '. MATERIAL PROVENIENTE ' || v_emp || ' / ' || v_lote
      || '. REGISTRADO COM N° ' || v_num || '.';

  -- CPs de solo-cimento ------------------------------------------------------
  elsif v_tipo = 'cps_solo_cimento' then
    v_txt := 'FORAM ENTREGUES AO LABORATÓRIO ' || lpad(v_qtd::text, 2, '0') || ' CORPOS DE PROVA DE SOLO-CIMENTO'
      || coalesce(' (CPs ' || public._obs_lista(public._obs_valores(v_ams, 'numeracao_cps')) || ')', '')
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
      || coalesce(' - ORIGEM: ' || public._obs_lista(public._obs_valores(v_ams, 'origem')), '')
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

  -- Outros / pedidos antigos -------------------------------------------------
  else
    v_txt := 'FOI ENTREGUE AO LABORATÓRIO AMOSTRA DE MATERIAL'
      || coalesce(' - ' || v_loc, '')
      || coalesce(', PARA ' || v_ens_t, '')
      || '. MATERIAL PROVENIENTE ' || v_emp || ' / ' || v_lote
      || '. REGISTRADO COM N° ' || v_num || '.';
  end if;

  return replace(v_txt, '..', '.');   -- 'C.A.U.Q.' no fim de uma frase
end $$;

-- -----------------------------------------------------------------------------
-- 3. Previsão de entrega (+60 dias) e contato padrão nas fichas
-- -----------------------------------------------------------------------------
-- Contato do laboratório que sai nas fichas (editável em cada ficha).
create or replace function public._contato_lab_padrao()
returns text
language sql immutable
as $$ select '(65) 3056 9155'::text $$;

-- FR-IMOB-04: versão da migração 15 + previsão e contato
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

  select jsonb_object_agg(x.c, true) into v_json
    from (
      select e.codigo_frimob04 as c
        from public.ensaios e
       where e.id::text = any(coalesce(v_p.ensaios_ids, '{}')) and e.codigo_frimob04 is not null
      union
      select unnest(coalesce(v_p.especificacoes, '{}'))
    ) x
   where x.c ~ '^(ens|espec)_[a-z0-9_]+$'
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'fichas_os'
                    and column_name = x.c and data_type = 'boolean');

  if v_json is not null then
    new := jsonb_populate_record(new, v_json);
  end if;
  return new;
end $$;

-- FR-IMOB-05: contato padrão
create or replace function public.tg_fichas_sol_prefill()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  new.contato := coalesce(nullif(trim(new.contato), ''), public._contato_lab_padrao());
  return new;
end $$;

drop trigger if exists a10_fichas_sol_prefill on public.fichas_solicitacao;
create trigger a10_fichas_sol_prefill
  before insert on public.fichas_solicitacao
  for each row execute function public.tg_fichas_sol_prefill();

-- -----------------------------------------------------------------------------
-- 4. Converte os números já gravados (0094 → 094) e os textos das fichas
-- -----------------------------------------------------------------------------
do $$
declare r record; v_old text; v_new text;
begin
  for r in select id, ano, sequencial, numero_pe, numero_os
             from public.pedidos_ensaio
            where sequencial is not null
              and numero_pe is distinct from public._fmt_seq(sequencial)
  loop
    v_old := lpad(r.sequencial::text, 4, '0');
    v_new := public._fmt_seq(r.sequencial);
    update public.pedidos_ensaio
       set numero_pe = v_new,
           numero_os = case when numero_os ~ '^\d{4}\.\d{2}\.\d{2}\.\d+\.\d+$'
                            then regexp_replace(numero_os, '[^.]+$', v_new) else numero_os end
     where id = r.id;
    update public.fichas_os
       set numero_os  = case when numero_os ~ '^\d{4}\.\d{2}\.\d{2}\.\d+\.\d+$'
                             then regexp_replace(numero_os, '[^.]+$', v_new) else numero_os end,
           observacao = replace(observacao, 'N° ' || v_old || '/', 'N° ' || v_new || '/')
     where pedido_id = r.id;
    update public.fichas_solicitacao
       set observacao = replace(observacao, 'N° ' || v_old || '/', 'N° ' || v_new || '/')
     where pedido_id = r.id;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Permissões
-- -----------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'gerar_os(uuid, date, text)', 'alterar_numero_pe(uuid, integer)', 'gerar_observacao_os(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array[
    'tg_pedido_numero_pe()', 'tg_fichas_os_prefill()', 'tg_fichas_sol_prefill()', '_obs_ensaios(text[])'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;

-- Fim da migração 16.
