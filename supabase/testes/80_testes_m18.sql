-- Testes da migração 18 (rodar DEPOIS da 18). Pré: 00_base, 10–17, 40_catalogo_real, 18.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
create or replace function public.t_ok(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'FALHOU: %', msg; end if; raise warning 'ok  %', msg; end $$;
create or replace function public.t_erro(cmd text, trecho text, msg text) returns void language plpgsql as $$
begin
  begin execute cmd; exception when others then
    if position(trecho in sqlerrm) > 0 then raise warning 'ok  %', msg; return; end if;
    raise exception E'FALHOU: % (erro diferente: %)', msg, sqlerrm;
  end;
  raise exception 'FALHOU: % (não deu erro)', msg;
end $$;
grant execute on function public.t_ok(boolean,text), public.t_erro(text,text,text) to authenticated;

insert into auth.users (id,email) values ('00000000-0000-0000-0000-00000000000a','lab@x'),('00000000-0000-0000-0000-00000000000c','campo@x');
insert into empresas (id,nome,lote) values ('10000000-0000-0000-0000-000000000001','Consórcio X','Lote 2');
insert into usuarios (id,auth_id,nome,perfil,email) values
 ('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','Samara','LAB','lab@x'),
 ('20000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c','Thyago','CAMPO','campo@x');

select t_ok((select count(*) = 1 from ensaios where codigo_frimob04 = 'ens_caract_material_asfaltico' and ativo and categoria = 'Asfalto'),
            'Ensaio "Caracterização de Material Asfáltico" no catálogo (Asfalto)');

-- FR-IMOB-04 nasce marcada com o ensaio novo
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);
insert into pedidos_ensaio (id, empresa_id, lote, material, sub_tipo, ensaios_ids, dados_amostra, solicitante_id)
values ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Lote 2','asfalto','massa_asfaltica',
        array(select id::text from ensaios where codigo_frimob04 = 'ens_caract_material_asfaltico'), '[{"material_aplicado":"Não","local":"Usina"}]',
        '20000000-0000-0000-0000-00000000000c');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);
select 1 from gerar_os('50000000-0000-0000-0000-000000000001', current_date, null);
select t_ok((select ens_caract_material_asfaltico from fichas_os where pedido_id = '50000000-0000-0000-0000-000000000001'),
            'FR-IMOB-04: ensaio novo marcado em "Detalhar ensaios" (coluna Asfalto)');
select t_ok((select observacao like '%CARACTERIZAÇÃO DE MATERIAL ASFÁLTICO%' or observacao like 'FOI ENTREGUE%' from fichas_os where pedido_id = '50000000-0000-0000-0000-000000000001'),
            'Observação gerada normalmente');

-- Empresas: Laboratório cadastra, altera e exclui; Campo não
insert into empresas (id, nome, lote) values ('10000000-0000-0000-0000-000000000009', 'Empresa do Lab', 'Lote 9');
update empresas set rodovia = 'BR-163' where id = '10000000-0000-0000-0000-000000000009';
delete from empresas where id = '10000000-0000-0000-0000-000000000009';
select t_ok(not exists (select 1 from empresas where id = '10000000-0000-0000-0000-000000000009'), 'Laboratório cadastra, altera e exclui empresa');
select t_erro($$delete from empresas where id = '10000000-0000-0000-0000-000000000001'$$, 'foreign key', 'Empresa com pedidos não pode ser excluída (desativar)');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);
select t_erro($$insert into empresas (nome) values ('Do Campo')$$, 'row-level security', 'Campo não cadastra empresa');
reset role;
