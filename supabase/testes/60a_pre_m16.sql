-- Parte A (rodar ANTES da migração 16): cria pedidos no formato antigo (4 dígitos)
\set ON_ERROR_STOP 1
set client_min_messages = warning;
insert into auth.users (id,email) values ('00000000-0000-0000-0000-00000000000a','lab@x'),('00000000-0000-0000-0000-00000000000c','campo@x'),('00000000-0000-0000-0000-0000000000d1','dev@x');
insert into empresas (id,nome,lote) values
  ('10000000-0000-0000-0000-000000000001','Consórcio BR 163 (108) - Várzea Grande a Jangada','Lote 2'),
  ('10000000-0000-0000-0000-000000000002','Construtora Tripoloni - Lucas do Rio Verde','Lote 3');
insert into usuarios (id,auth_id,nome,perfil,email) values
 ('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','Samara Rodrigues','LAB','lab@x'),
 ('20000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c','Thyago Biasin','CAMPO','campo@x'),
 ('20000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1','Dev','DEV','dev@x');
-- pedido 94 (concreto) já com O.S. no formato antigo
insert into pedidos_ensaio (id, empresa_id, lote, material, sub_tipo, tipo_solicitacao, ensaios_ids, dados_amostra, solicitante_id, created_at, sequencial)
values ('40000000-0000-0000-0000-000000000094','10000000-0000-0000-0000-000000000001','Lote 2','concreto','concreto','rotina',
  array[(select id::text from ensaios where codigo_frimob04='ens_compressao_axial')],
  '[{"estrutura":"Viga longarina","local":"Esmerial 6/7","data_moldagem":"2026-03-20","numeracao_cps":"359 A 364","qtd_cps":"6"}]',
  '20000000-0000-0000-0000-00000000000c', '2026-03-27 10:00-04', 94);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);
select 1 from gerar_os('40000000-0000-0000-0000-000000000094', '2026-03-27', null);
reset role;
select numero_pe, numero_os from pedidos_ensaio where id='40000000-0000-0000-0000-000000000094';
select observacao from fichas_os where pedido_id='40000000-0000-0000-0000-000000000094';
