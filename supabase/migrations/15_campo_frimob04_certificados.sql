-- =============================================================================
-- CNRO Lab Control — Migração 15: Campo no padrão FR-IMOB-04 + certificados
-- =============================================================================
-- Pré-requisito: migração 14. Rodar no SQL Editor. Idempotente, transação única.
--
--  1. ensaios.codigo_frimob04: liga cada ensaio do catálogo ao item da FR-IMOB-04
--     (o valor é o nome da coluna da ficha: ens_marshall, ens_rice…)
--  2. Desativa os 22 ensaios do cadastro antigo (não apaga; histórico intacto)
--  3. pedidos_ensaio.especificacoes: itens "Especificação" da FR-IMOB-04 marcados
--     pelo Campo (valor = coluna da ficha: espec_programar_coleta…)
--  4. Ao criar a FR-IMOB-04 (gerar O.S.), já marca as especificações e os ensaios
--     do pedido. O laboratorista pode ajustar depois.
--  5. Storage privado `certificados` (certificado do ligante anexado no Campo)
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Código FR-IMOB-04 no catálogo
-- -----------------------------------------------------------------------------
alter table public.ensaios add column if not exists codigo_frimob04 text;
create unique index if not exists ensaios_codigo_frimob04_uq
  on public.ensaios (codigo_frimob04) where codigo_frimob04 is not null;

update public.ensaios e set codigo_frimob04 = m.codigo
  from (values
    -- Asfalto
    ('c4eea3a4-352c-4966-991b-32a1b4c06a6a'::uuid, 'ens_rice'),
    ('8e3bf7d1-0609-4c8d-b5c0-26f340d481db'::uuid, 'ens_equiv_areia'),
    ('12bc7644-926b-4ffa-b7e1-bfbf265a26bc'::uuid, 'ens_viscosidade'),
    ('8be13d69-2024-4c00-9d52-698d7f5649a9'::uuid, 'ens_penetracao'),
    ('d18221f3-932a-4a61-af8a-6d8c14695e05'::uuid, 'ens_ponto_fulgor'),
    ('e96dae1d-fafa-4505-bae0-e74ec62f5ac3'::uuid, 'ens_ponto_amolecimento'),
    ('94eec579-d662-4e59-83dd-cb3a92e1db25'::uuid, 'ens_recuperacao_elastica'),
    ('7d66e654-7eec-4df7-bd29-ffae6dd4d469'::uuid, 'ens_ductilidade'),
    ('30f31e4a-c461-46bc-bf24-e010f1a7e56b'::uuid, 'ens_conf_espessuras_asf'),
    ('bf5ef45f-59fe-4b4b-8145-39ee9b062e66'::uuid, 'ens_extracao_rotarex'),
    ('58f5eec1-cd52-4cdd-a213-cd3321760671'::uuid, 'ens_extracao_soxhlet'),
    ('79410b9e-096f-4354-8b82-0fd360085ac9'::uuid, 'ens_marshall'),
    ('70ea46f0-32f2-4ad4-86ae-b417a76e1cf5'::uuid, 'ens_dano_umidade'),
    ('10d05d9b-7732-4e24-9373-e6fa78ef6851'::uuid, 'ens_modulo_resiliencia'),
    ('2c1c02ab-d5aa-4d2e-bf7e-8849409baeb8'::uuid, 'ens_fadiga'),
    ('882f0a69-0871-428a-8a6f-3f60fd83b577'::uuid, 'ens_deformacao_perm'),
    ('f7d9dfc4-47be-4d5b-864d-2ccfcc15c88e'::uuid, 'ens_outros_asfalto'),
    -- Solos e Agregados
    ('03052286-0915-4baf-bcff-9c1851759ced'::uuid, 'ens_granulometria'),
    ('c12c5cc6-181d-46f6-b82f-d1c702ba8c31'::uuid, 'ens_compactacao_nt'),
    ('695b34aa-aa9c-4d4e-951b-7fe23c299eda'::uuid, 'ens_compactacao_t'),
    ('1e3a137d-3877-4c44-b182-803e1e43bc60'::uuid, 'ens_teor_umidade'),
    ('0dd2fef4-d077-4b5b-8580-6771dae9ef74'::uuid, 'ens_massa_esp_insitu'),
    ('ac8874a1-6b29-4014-a4df-b661dc8516d3'::uuid, 'ens_resistencia_tracao'),
    ('1fdfaf3c-20a9-46d5-85d6-317c0c02e95f'::uuid, 'ens_conf_espessuras_solo'),
    ('a0236927-ad80-4bea-97a5-1d0773de3cf5'::uuid, 'ens_benkelman'),
    ('32f165e0-3e73-4907-ba72-51f4849311dd'::uuid, 'ens_dens_agr_graudo'),
    ('342668ee-701d-48f8-accb-8f28b1021c4d'::uuid, 'ens_dens_agr_miudo'),
    ('cac4d0ef-b753-42c4-9389-ea07bdf3e913'::uuid, 'ens_outros_solos'),
    -- Concreto
    ('2ef12d5a-be51-4dad-9930-2f649d0900af'::uuid, 'ens_compressao_axial')
  ) as m(id, codigo)
 where e.id = m.id and e.codigo_frimob04 is distinct from m.codigo;

-- -----------------------------------------------------------------------------
-- 2. Cadastro antigo (nomes repetidos/antigos) → inativo
-- -----------------------------------------------------------------------------
update public.ensaios set ativo = false
 where ativo is distinct from false
   and id = any (array[
    'a8628bc3-dccb-4bc3-a3aa-724776292f39', '142ea652-8b17-47cc-bf28-cfc07160ed0f', '160d8a7c-1f49-47ed-aaef-517d54dc82b5',
    'a18e6f8f-b421-4e30-9b0e-64b4ffa517de', 'ecd0e99c-3d9e-44c1-a54d-1fe984a164da', '72ed1d84-0726-4e4c-aa80-b741895c6130',
    'ca8bae94-e40e-4a02-a774-0070fc3e6401', 'eecef32f-6319-4028-9947-a95020ed8864', 'f715e351-24b0-45df-8c41-9e1bbcd23518',
    'e42492df-4ff1-4e1a-8a1d-1d760e4a38a5', '68ac36e6-2a95-4a92-a4d8-5391d3add432', 'cdb0d10f-a7fe-4c63-a067-5f3dc6feff8a',
    '79a32355-adb7-46ed-8d7a-a1dedaa08d97', '2873fedd-0d9c-487b-b54a-9164a129a2e2', '009fb481-cc1c-4ac1-8553-9224fee34b83',
    'e348441b-f428-47b0-96e0-5012b8f36d6e', '8bc505d8-2e90-4b1d-9c67-0279a1a93c3c', 'd165d04d-8a56-4f3a-b353-76c9dee6692d',
    '8d616c28-cb09-4a86-ac53-9fed53564887', '1ea59eb2-c2f9-4058-9842-5209eb20377a', 'b9df9de7-2a25-4fe9-8f2a-b804a18fc5e5',
    '3dd66d2e-a8f6-4235-920f-0af11d6e02a2'
   ]::uuid[]);

-- -----------------------------------------------------------------------------
-- 3. Especificações do pedido
-- -----------------------------------------------------------------------------
alter table public.pedidos_ensaio add column if not exists especificacoes text[] not null default '{}';

-- -----------------------------------------------------------------------------
-- 4. FR-IMOB-04 já marcada ao ser criada
-- -----------------------------------------------------------------------------
-- Só colunas booleanas ens_* / espec_* que existem na ficha (lista fechada).
create or replace function public.tg_fichas_os_prefill()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_p    public.pedidos_ensaio;
  v_json jsonb;
begin
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

drop trigger if exists a10_fichas_os_prefill on public.fichas_os;
create trigger a10_fichas_os_prefill
  before insert on public.fichas_os
  for each row execute function public.tg_fichas_os_prefill();

revoke all on function public.tg_fichas_os_prefill() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Storage privado: certificados/<usuarios.id>/<arquivo>
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('certificados', 'certificados', false)
on conflict (id) do update set public = false;

drop policy if exists certificados_select on storage.objects;
drop policy if exists certificados_insert on storage.objects;
drop policy if exists certificados_delete on storage.objects;

-- Lê: quem enviou, equipe do laboratório e Gestor/DEV
create policy certificados_select on storage.objects for select to authenticated
  using (bucket_id = 'certificados'
         and ((storage.foldername(name))[1] = public.usuario_atual_id()::text
              or public.eh_equipe_lab()));
-- Envia: qualquer usuário ativo, na própria pasta
create policy certificados_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'certificados'
              and (storage.foldername(name))[1] = public.usuario_atual_id()::text);
-- Apaga: quem enviou ou Gestor/DEV
create policy certificados_delete on storage.objects for delete to authenticated
  using (bucket_id = 'certificados'
         and ((storage.foldername(name))[1] = public.usuario_atual_id()::text or public.eh_gestor()));

notify pgrst, 'reload schema';

commit;

-- Fim da migração 15.
