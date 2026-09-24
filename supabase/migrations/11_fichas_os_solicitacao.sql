-- =============================================================================
-- CNRO Lab Control — Migração 11: Fichas FR-IMOB-04 e FR-IMOB-05 editáveis
-- =============================================================================
-- Pré-requisito: migração 10.
-- Idempotente e em transação única.
--
--  1. gerar_os(): "Obra" passa a vir do nome do consórcio/empresa (como nas fichas
--     originais) e as localizações da FR-IMOB-05 no formato {km, pista, trilho}.
--  2. salvar_ficha_solicitacao(): cria/atualiza a FR-IMOB-05 do pedido.
--  3. salvar_ficha_os(): atualiza a FR-IMOB-04 da O.S.
--  4. Localizações antigas {estaca, faixa} convertidas para {km, trilho}.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. gerar_os (versão 11)
-- -----------------------------------------------------------------------------
create or replace function public.gerar_os(p_pedido_id uuid, p_data date default null, p_lote text default null)
returns public.pedidos_ensaio
language plpgsql security definer
set search_path = public
as $$
declare
  v_me       uuid := public.usuario_atual_id();
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
  if not public.eh_lab() then
    raise exception 'Apenas laboratoristas podem gerar O.S.' using errcode = 'P0001';
  end if;

  select * into v_p from public.pedidos_ensaio where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;

  if v_p.laboratorista_id is not null and v_p.laboratorista_id <> v_me and not public.eh_gestor() then
    raise exception 'Somente o laboratorista responsável pode gerar a O.S.' using errcode = 'P0001';
  end if;

  if v_p.numero_os is not null and v_p.numero_os not like 'PROV-%' then
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

  v_data := coalesce(p_data, (now() at time zone 'America/Cuiaba')::date);
  v_num  := to_char(v_data, 'YYYY.MM.DD') || '.' || lpad(v_lote_num, 2, '0') || '.'
            || lpad(v_p.sequencial::text, 4, '0');

  -- Ensaios da O.S. (um por ensaio solicitado)
  insert into public.ensaios_os (pedido_id, ensaio_id, nome_ensaio, status)
  select v_p.id, e.id, e.nome, 'pendente'
    from public.ensaios e
   where e.id::text = any(v_p.ensaios_ids)
     and not exists (select 1 from public.ensaios_os x where x.pedido_id = v_p.id and x.ensaio_id = e.id);

  -- Dados para as fichas
  select nome into v_sol from public.usuarios where id = v_p.solicitante_id;
  -- Obra: nome do consórcio/empresa (como nas fichas originais); editável na ficha
  v_obra := coalesce(v_p.empresa, (select nome from public.empresas where id = v_p.empresa_id));

  update public.pedidos_ensaio set lote = v_lote where id = v_p.id;  -- observação usa o lote final

  -- FR-IMOB-05 — Solicitação de Ensaios
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

  -- FR-IMOB-04 — Ordem de Serviço
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
         assumido_em      = coalesce(assumido_em, now()),
         aberto_por       = coalesce(aberto_por, v_me),
         aberto_em        = coalesce(aberto_em, now()),
         ficha_os_id      = v_ficha_os,
         ficha_sol_id     = v_ficha_sl,
         motivo_devolucao = null,
         historico        = coalesce(historico, '[]'::jsonb) || jsonb_build_array(
                              public._evento('O.S. gerada', jsonb_build_object(
                                'numero_os', v_num,
                                'provisorio', v_p.numero_os)))
   where id = v_p.id
  returning * into v_p;

  return v_p;
end $$;


-- -----------------------------------------------------------------------------
-- Permissão comum: quem pode editar as fichas de um pedido
-- -----------------------------------------------------------------------------
create or replace function public._pode_editar_fichas(p_pedido public.pedidos_ensaio)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
           public.eh_gestor()
           or (public.eh_lab()
               and p_pedido.status not in ('concluido','cancelado')
               and p_pedido.laboratorista_id is not null
               and p_pedido.laboratorista_id = public.usuario_atual_id()),
           false)
$$;

-- Converte texto em data (aceita 'AAAA-MM-DD' ou vazio)
create or replace function public._data_ou_nulo(p text)
returns date language sql immutable as $$
  select case when p ~ '^\d{4}-\d{2}-\d{2}' then left(p, 10)::date else null end
$$;

-- -----------------------------------------------------------------------------
-- 2. FR-IMOB-05 — Solicitação de Ensaios/Estudos
-- -----------------------------------------------------------------------------
create or replace function public.salvar_ficha_solicitacao(p_pedido_id uuid, p_dados jsonb)
returns public.fichas_solicitacao
language plpgsql security definer
set search_path = public
as $$
declare
  v_p public.pedidos_ensaio;
  v_f public.fichas_solicitacao;
  v_id uuid;
begin
  select * into v_p from public.pedidos_ensaio where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode = 'P0001'; end if;
  if not public._pode_editar_fichas(v_p) then
    raise exception 'Somente o laboratorista responsável pode editar a ficha (O.S. finalizada é bloqueada).'
      using errcode = 'P0001';
  end if;

  v_id := v_p.ficha_sol_id;
  if v_id is null then
    select id into v_id from public.fichas_solicitacao where pedido_id = p_pedido_id order by created_at limit 1;
  end if;
  if v_id is null then
    insert into public.fichas_solicitacao (pedido_id, status, criado_por)
    values (p_pedido_id, 'emitida', public.usuario_atual_id())
    returning id into v_id;
  end if;

  update public.fichas_solicitacao set
    obra              = case when p_dados ? 'obra'              then nullif(trim(p_dados->>'obra'), '')        else obra end,
    lote              = case when p_dados ? 'lote'              then nullif(trim(p_dados->>'lote'), '')        else lote end,
    solicitante       = case when p_dados ? 'solicitante'       then nullif(trim(p_dados->>'solicitante'), '') else solicitante end,
    contato           = case when p_dados ? 'contato'           then nullif(trim(p_dados->>'contato'), '')     else contato end,
    tipo_contraprova  = case when p_dados ? 'tipo_contraprova'  then (p_dados->>'tipo_contraprova')::boolean  else tipo_contraprova end,
    tipo_investigacao = case when p_dados ? 'tipo_investigacao' then (p_dados->>'tipo_investigacao')::boolean else tipo_investigacao end,
    tipo_estudo       = case when p_dados ? 'tipo_estudo'       then (p_dados->>'tipo_estudo')::boolean       else tipo_estudo end,
    tipo_outros       = case when p_dados ? 'tipo_outros'       then (p_dados->>'tipo_outros')::boolean       else tipo_outros end,
    tipo_outros_texto = case when p_dados ? 'tipo_outros_texto' then nullif(trim(p_dados->>'tipo_outros_texto'), '') else tipo_outros_texto end,
    localizacoes      = case when jsonb_typeof(p_dados->'localizacoes') = 'array' then p_dados->'localizacoes' else localizacoes end,
    observacao        = case when p_dados ? 'observacao'        then p_dados->>'observacao'                    else observacao end,
    observacao_editada = true,
    status            = 'emitida'
  where id = v_id
  returning * into v_f;

  update public.pedidos_ensaio
     set ficha_sol_id = v_id,
         historico = coalesce(historico, '[]'::jsonb) || jsonb_build_array(public._evento('Ficha FR-IMOB-05 salva'))
   where id = p_pedido_id;

  return v_f;
end $$;

-- -----------------------------------------------------------------------------
-- 3. FR-IMOB-04 — Ordem de Serviço
-- -----------------------------------------------------------------------------
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
  v_bool text[] := array[
    'espec_programar_coleta','espec_caract_agregados','espec_caract_ligante','espec_caract_rap',
    'espec_dosagem_asfaltica','espec_investigativos','espec_compressao','espec_controle_campo',
    'espec_misturas_frescas','espec_misturas_endurecidas','espec_outros',
    'ens_rice','ens_equiv_areia','ens_viscosidade','ens_penetracao','ens_ponto_fulgor',
    'ens_ponto_amolecimento','ens_recuperacao_elastica','ens_ductilidade','ens_conf_espessuras_asf',
    'ens_extracao_rotarex','ens_extracao_soxhlet','ens_marshall','ens_dano_umidade',
    'ens_modulo_resiliencia','ens_fadiga','ens_deformacao_perm','ens_outros_asfalto',
    'ens_granulometria','ens_compactacao_nt','ens_compactacao_t','ens_teor_umidade',
    'ens_massa_esp_insitu','ens_resistencia_tracao','ens_conf_espessuras_solo','ens_benkelman',
    'ens_dens_agr_graudo','ens_dens_agr_miudo','ens_outros_solos','ens_compressao_axial'];
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

  foreach v_col in array v_bool loop
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
-- 4. Localizações antigas → {km, pista, trilho}
-- -----------------------------------------------------------------------------
update public.fichas_solicitacao f
   set localizacoes = (
     select coalesce(jsonb_agg(jsonb_build_object(
              'km',     coalesce(l->>'km', l->>'estaca', ''),
              'pista',  coalesce(l->>'pista', ''),
              'trilho', coalesce(l->>'trilho', l->>'faixa', ''))), '[]'::jsonb)
       from jsonb_array_elements(f.localizacoes) l)
 where jsonb_typeof(f.localizacoes) = 'array'
   and exists (select 1 from jsonb_array_elements(f.localizacoes) l where l ? 'estaca' or l ? 'faixa');

-- Permissões
do $$
declare f text;
begin
  foreach f in array array[
    'gerar_os(uuid, date, text)', 'salvar_ficha_solicitacao(uuid, jsonb)', 'salvar_ficha_os(uuid, jsonb)',
    '_pode_editar_fichas(public.pedidos_ensaio)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

commit;

-- Fim da migração 11.
