\set ON_ERROR_STOP 1
set client_min_messages = warning;
create or replace function public.t_ok(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'FALHOU: %', msg; end if; raise warning 'ok  %', msg; end $$;
grant execute on function public.t_ok(boolean,text) to authenticated;
insert into auth.users (id,email) values ('00000000-0000-0000-0000-00000000000a','lab@x'),('00000000-0000-0000-0000-00000000000c','campo@x'),('00000000-0000-0000-0000-0000000000a1','as@x');
insert into empresas (id,nome,lote) values ('10000000-0000-0000-0000-000000000001','Alfa','Lote 3');
insert into usuarios (id,auth_id,nome,perfil,email) values
 ('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','Laura','LAB','lab@x'),
 ('20000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c','Carlos','CAMPO','campo@x'),
 ('20000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','Ana','ASSIST','as@x');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);
insert into pedidos_ensaio (id, empresa_id, lote, material, sub_tipo, tipo_solicitacao, ensaios_ids, especificacoes, dados_amostra, solicitante_id, created_at)
values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Lote 3','asfalto','massa_asfaltica','rotina',
  array['79410b9e-096f-4354-8b82-0fd360085ac9','bf5ef45f-59fe-4b4b-8145-39ee9b062e66'],
  array['espec_controle_campo','espec_misturas_frescas','espec_hackeado; drop','ens_nao_existe'],
  '[{"km":"12","pista":"Norte","estaca_inicial":"250+00","certificado":"certificados/x/y.pdf"}]','20000000-0000-0000-0000-00000000000c', now());
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);
select 1 from gerar_os('40000000-0000-0000-0000-000000000001', current_date, null);
reset role;
select t_ok((select ens_marshall and ens_extracao_rotarex and not ens_extracao_soxhlet and espec_controle_campo and espec_misturas_frescas
               and not espec_programar_coleta from fichas_os where pedido_id='40000000-0000-0000-0000-000000000001'),
            'FR-IMOB-04 nasce marcada: Marshall, Rotarex, controle em campo, misturas frescas (e só isso)');
select t_ok((select count(*)=2 from ensaios_os where pedido_id='40000000-0000-0000-0000-000000000001'), 'O.S. com os 2 ensaios do catálogo');
select t_ok((select localizacoes->0->>'km'='12' and localizacoes->0->>'pista'='Norte' from fichas_solicitacao where pedido_id='40000000-0000-0000-0000-000000000001'),
            'FR-IMOB-05 com km/pista vindos da amostra');
-- storage
insert into storage.objects (bucket_id, name) values ('certificados','20000000-0000-0000-0000-00000000000c/cert.pdf');
grant select, insert, delete on storage.objects to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);
select t_ok((select count(*)=1 from storage.objects where bucket_id='certificados'), 'Campo vê o próprio certificado');
insert into storage.objects (bucket_id, name) values ('certificados','20000000-0000-0000-0000-00000000000c/cert2.pdf');
do $$ begin
  begin insert into storage.objects (bucket_id, name) values ('certificados','20000000-0000-0000-0000-0000000000a1/x.pdf');
        raise exception 'FALHOU: gravou na pasta de outro';
  exception when insufficient_privilege then raise warning 'ok  Campo não grava na pasta de outro usuário'; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1', false);
select t_ok((select count(*)=2 from storage.objects where bucket_id='certificados'), 'Assistente (equipe do lab) vê os certificados');
reset role;
delete from auth.users where id='00000000-0000-0000-0000-0000000000ff';
select 'TESTES M15 OK';
