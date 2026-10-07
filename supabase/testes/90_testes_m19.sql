-- Testes da migração 19 (rodar DEPOIS da 19). Pré: 00_base, 10–18, 40_catalogo_real, 19.
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

insert into auth.users (id,email) values
 ('00000000-0000-0000-0000-00000000000a','lab@x'),('00000000-0000-0000-0000-00000000000c','campo@x'),
 ('00000000-0000-0000-0000-0000000000a1','ana@x'),('00000000-0000-0000-0000-0000000000b1','bia@x');
insert into empresas (id,nome,lote) values ('10000000-0000-0000-0000-000000000001','Consórcio X','Lote 2');
insert into usuarios (id,auth_id,nome,perfil,email) values
 ('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','Samara','LAB','lab@x'),
 ('20000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c','Thyago','CAMPO','campo@x'),
 ('20000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','Ana','ASSIST','ana@x'),
 ('20000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1','Bia','ASSIST','bia@x');
update usuarios set assinatura_url = 'assinaturas/ana.png' where email = 'ana@x';

select set_config('t.f13', (select id::text from fichas_ensaio where codigo = 'FR-IMOB-13'), false);
select set_config('t.f14', (select id::text from fichas_ensaio where codigo = 'FR-IMOB-14'), false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);
insert into pedidos_ensaio (id, empresa_id, lote, material, sub_tipo, ensaios_ids, dados_amostra, solicitante_id)
values ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Lote 2','asfalto','cps_extraidos_pista',
        array(select id::text from ensaios where nome ilike 'Ensaios Marshall%' limit 1), '[{"identificacao_cp":"101"}]',
        '20000000-0000-0000-0000-00000000000c');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);
select 1 from gerar_os('50000000-0000-0000-0000-000000000001', current_date, null);
select set_config('t.eo', (select id::text from ensaios_os where pedido_id = '50000000-0000-0000-0000-000000000001' limit 1), false);

-- Lab atribui a ficha ERRADA (FR-IMOB-14) para a Ana
update ensaios_os set ficha_ensaio_id = current_setting('t.f14')::uuid,
       assistente_id = '20000000-0000-0000-0000-0000000000a1' where id = current_setting('t.eo')::uuid;

-- Ana inicia e salva (material editado no cabeçalho)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1', false);
select 1 from iniciar_ensaio(current_setting('t.eo')::uuid);
select 1 from salvar_rascunho_ensaio(current_setting('t.eo')::uuid,
  '{"entradas":{"C20":12.3},"pedido":{"os":"2026.10.07.02.0001","material":"CBUQ FAIXA C (ANA)","procedencia":"Consórcio X","complemento":"do pedido"},"cabecalho":{"material":"CBUQ FAIXA C (ANA)","procedencia":"Consórcio X"}}');
select t_ok((select m.ficha_ensaio_id = current_setting('t.f14')::uuid from ensaios_os e join fichas_modelo m on m.id = e.ficha_modelo_id
              where e.id = current_setting('t.eo')::uuid), 'Ao iniciar, a versão da FR-IMOB-14 fica congelada');
select t_erro($$update ensaios_os set auxiliares_ids = '{20000000-0000-0000-0000-0000000000b1}' where id = current_setting('t.eo')::uuid$$,
              'Use as ações', 'Assistente não inclui auxiliar');

-- Lab troca para a ficha CERTA
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);
update ensaios_os set ficha_ensaio_id = current_setting('t.f13')::uuid where id = current_setting('t.eo')::uuid;
select t_ok((select ficha_modelo_id is null from ensaios_os where id = current_setting('t.eo')::uuid), 'Troca de ficha desfaz o congelamento');
select t_ok((select status = 'devolvido' and devolvido_motivo = 'Ficha trocada de FR-IMOB-14 para FR-IMOB-13.' and devolvido_em is not null
               from ensaios_os where id = current_setting('t.eo')::uuid), 'Ensaio iniciado volta ao assistente como Devolvido, com o motivo');
select t_ok((select dados_resultado = '{"cabecalho":{"material":"CBUQ FAIXA C (ANA)","procedencia":"Consórcio X"}}'::jsonb
               from ensaios_os where id = current_setting('t.eo')::uuid), 'Só o cabeçalho digitado é aproveitado (entradas da ficha errada e valores do pedido saem)');
select t_ok((select historico @> '[{"acao":"Ensaio devolvido ao assistente"}]' from pedidos_ensaio where id = '50000000-0000-0000-0000-000000000001'),
            'Histórico do pedido registra a devolução');

-- Ana inicia a correção: abre a FR-IMOB-13
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1', false);
select 1 from iniciar_ensaio(current_setting('t.eo')::uuid);
select t_ok((select m.ficha_ensaio_id = current_setting('t.f13')::uuid from ensaios_os e join fichas_modelo m on m.id = e.ficha_modelo_id
              where e.id = current_setting('t.eo')::uuid), 'Ao reiniciar, o assistente recebe a FR-IMOB-13');
select 1 from enviar_para_revisao(current_setting('t.eo')::uuid, '{"entradas":{"C20":1},"cabecalho":{"material":"CBUQ FAIXA C (ANA)"}}', now());

-- Troca durante a revisão: devolve sozinho
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);
update ensaios_os set ficha_ensaio_id = current_setting('t.f14')::uuid where id = current_setting('t.eo')::uuid;
select t_ok((select status = 'devolvido' and assinatura_executor is null and dados_resultado = '{"cabecalho":{"material":"CBUQ FAIXA C (ANA)"}}'::jsonb
               from ensaios_os where id = current_setting('t.eo')::uuid), 'Troca com o ensaio em revisão: devolvido, sem assinatura, cabeçalho mantido');
select t_ok((select status = 'em_andamento' from pedidos_ensaio where id = '50000000-0000-0000-0000-000000000001'),
            'Pedido sai de "aguardando revisão"');

-- Auxiliares
update ensaios_os set auxiliares_ids = '{20000000-0000-0000-0000-0000000000b1,20000000-0000-0000-0000-0000000000a1,20000000-0000-0000-0000-0000000000b1}'
 where id = current_setting('t.eo')::uuid;
select t_ok((select auxiliares_ids = '{20000000-0000-0000-0000-0000000000b1}' from ensaios_os where id = current_setting('t.eo')::uuid),
            'Auxiliar incluído (sem repetir e sem o executor)');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1', false);
select t_ok((select count(*) = 1 from ensaios_os where auxiliares_ids @> '{20000000-0000-0000-0000-0000000000b1}'), 'Auxiliar enxerga o ensaio');
select t_erro($$select iniciar_ensaio(current_setting('t.eo')::uuid)$$, '', 'Auxiliar não inicia nem preenche o ensaio');

-- Pendente: troca simples, sem devolver
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);
insert into ensaios_os (pedido_id, ensaio_id, nome_ensaio, status, ficha_ensaio_id)
values ('50000000-0000-0000-0000-000000000001', (select id from ensaios where nome ilike 'Extração%' limit 1), 'Outro', 'pendente', current_setting('t.f14')::uuid);
update ensaios_os set ficha_ensaio_id = current_setting('t.f13')::uuid where nome_ensaio = 'Outro';
select t_ok((select status = 'pendente' and devolvido_motivo is null from ensaios_os where nome_ensaio = 'Outro'), 'Ensaio pendente: troca simples');

-- Aprovado: não troca
reset role;
update ensaios_os set status = 'aprovado' where nome_ensaio = 'Outro';
set role authenticated;
select t_erro($$update ensaios_os set ficha_ensaio_id = current_setting('t.f14')::uuid where nome_ensaio = 'Outro'$$,
              'Ensaio aprovado', 'Ensaio aprovado: ficha não pode ser trocada');
reset role;
