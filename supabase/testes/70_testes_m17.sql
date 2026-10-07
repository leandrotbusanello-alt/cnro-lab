-- Testes da migração 17 (rodar DEPOIS da 17). Pré: 00_base, 10–16, 40_catalogo_real, 17.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
create or replace function public.t_ok(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'FALHOU: %', msg; end if; raise warning 'ok  %', msg; end $$;
create or replace function public.t_eq(a text, b text, msg text) returns void language plpgsql as $$
begin if a is distinct from b then raise exception E'FALHOU: %\n  obtido:   %\n  esperado: %', msg, a, b; end if; raise warning 'ok  %', msg; end $$;
create or replace function public.t_erro(cmd text, trecho text, msg text) returns void language plpgsql as $$
begin
  begin execute cmd; exception when others then
    if position(trecho in sqlerrm) > 0 then raise warning 'ok  %', msg; return; end if;
    raise exception E'FALHOU: % (erro diferente: %)', msg, sqlerrm;
  end;
  raise exception 'FALHOU: % (não deu erro)', msg;
end $$;
grant execute on function public.t_ok(boolean,text), public.t_eq(text,text,text), public.t_erro(text,text,text) to authenticated;

insert into auth.users (id,email) values ('00000000-0000-0000-0000-00000000000a','lab@x'),('00000000-0000-0000-0000-00000000000c','campo@x'),('00000000-0000-0000-0000-0000000000d1','dev@x');
insert into empresas (id,nome,lote) values
  ('10000000-0000-0000-0000-000000000001','Consórcio BR 163 (108) - Várzea Grande a Jangada','Lote 2'),
  ('10000000-0000-0000-0000-000000000002','Construtora Tripoloni - Lucas do Rio Verde','Lote 3');
insert into usuarios (id,auth_id,nome,perfil,email) values
 ('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','Samara Rodrigues','LAB','lab@x'),
 ('20000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c','Thyago Biasin','CAMPO','campo@x'),
 ('20000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1','Dev','DEV','dev@x');

-- 1. Km / estaca --------------------------------------------------------------
select t_eq(_km_fmt('545+970'), '545,970', 'km 545+970 → 545,970');
select t_eq(_km_fmt('280+40'), '280,040', 'estaca 280+40 → 280,040 (metros com 3 dígitos)');
select t_eq(_km_fmt('545,9'), '545,900', '545,9 → 545,900');
select t_eq(_km_fmt('KM 545'), '545,000', 'KM 545 → 545,000');
select t_eq(_obs_lista(array['KM 1,000','KM 2,000','KM 3,000'], '; '), 'KM 1,000; KM 2,000 E KM 3,000', 'lista de km separada por ponto e vírgula');

-- 2. Catálogo e FR-IMOB-04 ------------------------------------------------------
select t_ok(not exists (select 1 from ensaios where codigo_frimob04 in ('ens_outros_asfalto','ens_outros_solos') and ativo), 'ensaios "Outros" desativados');
select t_ok(exists (select 1 from information_schema.columns where table_name='fichas_os' and column_name='espec_caract_material_asfaltico'), 'FR-IMOB-04 tem "Caracterização de material asfáltico"');
select t_eq((select count(*)::text from tracos_aprovados), '7', 'carga inicial: 7 traços da FR-IMOB-54');
select t_eq((select jsonb_array_length(faixa_trabalho)::text from tracos_aprovados where nome_traco like 'NEOVIA · TRAÇO FAIXA "B"%'), '13', 'traço com a faixa de trabalho (13 peneiras)');

-- helper: pedido do Campo + O.S. pelo laboratorista
create or replace function public.t_pedido(p_id uuid, p_emp int, p_sub text, p_mat text, p_codigos text[], p_dados jsonb,
                                           p_espec text[] default '{}', p_traco uuid default null)
returns void language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
  insert into pedidos_ensaio (id, empresa_id, lote, material, sub_tipo, tipo_solicitacao, ensaios_ids, especificacoes,
                              dados_amostra, solicitante_id, traco_id, created_at)
  values (p_id, ('10000000-0000-0000-0000-00000000000'||p_emp)::uuid, case p_emp when 1 then 'Lote 2' else 'Lote 3' end,
          p_mat, p_sub, 'rotina', array(select id::text from ensaios where codigo_frimob04 = any(p_codigos)), p_espec,
          p_dados, '20000000-0000-0000-0000-00000000000c', p_traco, '2026-02-24 10:00-04');
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', true);
  perform gerar_os(p_id, '2026-02-24', null);
  reset role;
end $$;
create or replace function public.t_obs(p_id uuid) returns text language sql as $$ select observacao from fichas_os where pedido_id = p_id $$;

-- 3. Observação — formulários novos ---------------------------------------------
-- CPs extraídos (O.S. 127 em papel), com o traço do cadastro
select t_pedido('50000000-0000-0000-0000-000000000001', 2, 'cps_extraidos_pista', 'asfalto', array['ens_marshall'],
 (select jsonb_agg(x || jsonb_build_object('data_aplicacao','2026-02-23','pista','Norte','faixa','1ª Faixa',
                                           'projeto','NEOVIA · TRAÇO FAIXA "C" 031/2024','traco_id',(select id from tracos_aprovados where nome_traco like 'NEOVIA · TRAÇO FAIXA "C"%'),
                                           'info_geral', jsonb_build_object('pista','Norte')))
    from jsonb_array_elements('[{"identificacao_cp":"1","km_extracao":"730+900","camada":"2ª Camada"},
                                {"identificacao_cp":"2","km_extracao":"731+100","camada":"2ª Camada"},
                                {"identificacao_cp":"3","km_extracao":"731+100","camada":"2ª Camada"},
                                {"identificacao_cp":"4","km_extracao":"731+200","camada":"2ª Camada"}]') x),
 '{espec_caract_material_asfaltico}', (select id from tracos_aprovados where nome_traco like 'NEOVIA · TRAÇO FAIXA "C"%'));
select t_eq(t_obs('50000000-0000-0000-0000-000000000001'),
 'FORAM ENTREGUES AO LABORATÓRIO DA CNRO 04 CPs DE C.A.U.Q. - KM 730,900; KM 731,100; KM 731,100 E KM 731,200 / NORTE / FX-01 / 2ª CAMADA, COM A DATA REFERENTE AO DIA 23/02/2026. CORPOS DE PROVA PROVENIENTES DA CONSTRUTORA TRIPOLONI - LUCAS DO RIO VERDE / LOTE 03, PARA CONFERÊNCIA DE PARÂMETROS. REGISTRADO COMO OS N° 001/2026.',
 'CPs extraídos: km com vírgula e ponto e vírgula, mistura do traço');
select t_eq((select string_agg(l->>'km', ' | ') from fichas_solicitacao f, jsonb_array_elements(f.localizacoes) l where pedido_id='50000000-0000-0000-0000-000000000001'),
 '730,900 | 731,100 | 731,100 | 731,200', 'FR-IMOB-05: localizações com o km de extração formatado');
select t_ok((select espec_caract_material_asfaltico and ens_marshall from fichas_os where pedido_id='50000000-0000-0000-0000-000000000001'),
 'FR-IMOB-04 nasce com "Caracterização de material asfáltico" marcada');

-- Concreto (O.S. 137 em papel)
select t_pedido('50000000-0000-0000-0000-000000000002', 1, 'concreto', 'concreto', array['ens_compressao_axial'],
 (select jsonb_agg(jsonb_build_object('identificacao_cp', n::text, 'local_concretagem','Esmerial 6/7','elemento','Viga longarina',
                                      'data_moldagem','2026-03-20','idade_ruptura','28','tipo_ruptura','Axial')) from generate_series(359,364) n));
select t_eq(t_obs('50000000-0000-0000-0000-000000000002'),
 'FORAM ENTREGUES AO LABORATÓRIO CORPOS DE PROVA DE CONCRETO (CPs 359 A 364) DA VIGA LONGARINA ESMERIAL 6/7. CORPOS DE PROVA MOLDADOS PARA O ENSAIO DE COMPRESSÃO AXIAL, MOLDAGEM FEITA NO DIA 20/03/2026. CORPOS DE PROVA PROVENIENTES DO CONSÓRCIO BR 163 (108) - VÁRZEA GRANDE A JANGADA / LOTE 02. REGISTRADOS COM N° 002/2026.',
 'Concreto: CPs a partir da identificação de cada amostra');

-- Massa asfáltica aplicada, com traço
select t_pedido('50000000-0000-0000-0000-000000000003', 1, 'massa_asfaltica', 'asfalto', array['ens_marshall'],
 jsonb_build_array(jsonb_build_object('material_aplicado','Sim','local','Pista','projeto','x','traco_id',(select id from tracos_aprovados where nome_traco like 'CONSÓRCIO BR163 - GUAXE%'),
                                      'identificacao_caminhao','QBA-1234','pista','Sul','km_inicial','545+970','km_final','546')),
 '{}', (select id from tracos_aprovados where nome_traco like 'CONSÓRCIO BR163 - GUAXE%'));
select t_eq(t_obs('50000000-0000-0000-0000-000000000003'),
 'FOI ENTREGUE AO LABORATÓRIO UMA AMOSTRA DE C.A.U.Q. FAIXA C PROVENIENTE DO CONSÓRCIO BR 163 (108) - VÁRZEA GRANDE A JANGADA / LOTE 02. REGISTRADO COM N° 003/2026.',
 'Massa asfáltica: mistura e faixa vêm do traço');

-- Jazida
select t_pedido('50000000-0000-0000-0000-000000000004', 2, 'jazida', 'solos', array['ens_granulometria'],
 '[{"jazida":"Jazida São José","municipio":"Nova Mutum","km_inicial":"700+000","km_final":"701+500","pista":"Sul","camada":"Base","proctor":"Intermediário","data_coleta":"2026-02-20","identificacao":"A1","profundidade":"0,60 m"}]');
select t_eq(t_obs('50000000-0000-0000-0000-000000000004'),
 'FOI ENTREGUE AO LABORATÓRIO UMA AMOSTRA DE SOLO DA JAZIDA SÃO JOSÉ (NOVA MUTUM) - KM 700,000 AO KM 701,500 / SUL / BASE, PROFUNDIDADE 0,60 M, COLETADA NO DIA 20/02/2026, PARA O ENSAIO DE ANÁLISE GRANULOMÉTRICA POR PENEIRAMENTO, PROCTOR INTERMEDIÁRIO. MATERIAL PROVENIENTE DA CONSTRUTORA TRIPOLONI - LUCAS DO RIO VERDE / LOTE 03. REGISTRADO COM N° 004/2026.',
 'Jazida');

-- Caixa de empréstimo: trecho + km da coleta
select t_pedido('50000000-0000-0000-0000-000000000005', 2, 'caixa_emprestimo', 'solos', array['ens_compactacao_nt'],
 '[{"km_inicial":"100","km_final":"101","km_coleta":"100+5","camada":"Subleito","identificacao":"CX-1","quantidade_kg":"30"},
   {"km_inicial":"100","km_final":"101","km_coleta":"100+5","camada":"Subleito","identificacao":"CX-2","quantidade_kg":"30"}]');
select t_ok(t_obs('50000000-0000-0000-0000-000000000005') like 'FORAM ENTREGUES AO LABORATÓRIO 02 AMOSTRAS DE SOLO DA CAIXA DE EMPRÉSTIMO - KM 100,000 AO KM 101,000 (COLETA: KM 100,005 E KM 100,005) / SUBLEITO,%', 'Caixa de empréstimo');

-- Solo-cimento
select t_pedido('50000000-0000-0000-0000-000000000006', 2, 'cps_solo_cimento', 'solos', array['ens_resistencia_tracao'],
 '[{"identificacao_cp":"10","teor_cimento":"4","data_moldagem":"2026-02-19","km_coleta":"710+20","lado":"LD","camada":"Base"},
   {"identificacao_cp":"11","teor_cimento":"4","data_moldagem":"2026-02-19","km_coleta":"710+40","lado":"LD","camada":"Base"}]');
select t_ok(t_obs('50000000-0000-0000-0000-000000000006') like 'FORAM ENTREGUES AO LABORATÓRIO 02 CORPOS DE PROVA DE SOLO-CIMENTO (CPs 10 A 11) - KM 710,020 E KM 710,040 / BASE / LD, COM TEOR DE CIMENTO DE 4%%', 'Solo-cimento');

-- Agregados (pedreira do cadastro)
select t_pedido('50000000-0000-0000-0000-000000000007', 1, 'agregados', 'solos', array['ens_dens_agr_graudo'],
 '[{"pedreira":"Pedreira Cuiabá","data_coleta":"2026-02-21","tipo_agregado":"Brita 1","quantidade_kg":"40"}]');
select t_ok(t_obs('50000000-0000-0000-0000-000000000007') like 'FOI ENTREGUE AO LABORATÓRIO UMA AMOSTRA DE BRITA 1 DA PEDREIRA CUIABÁ, COLETADA NO DIA 21/02/2026, PARA O ENSAIO DE MASSA ESPECÍFICA%', 'Agregados');

-- Ensaio especial
select t_pedido('50000000-0000-0000-0000-000000000008', 1, 'mancha_areia', 'especial', array['ens_marshall'],
 '[{"data_solicitacao":"2026-02-24","km_inicial":"650","km_final":"655","camada":"CBUQ 1ª Camada","pista":"Norte","faixa":"1ª Faixa","lado":"Intercalado","qtd_pontos":"20","data_desejada":"2026-03-01"}]');
select t_eq(t_obs('50000000-0000-0000-0000-000000000008'),
 'SOLICITADA AO LABORATÓRIO A EXECUÇÃO DO ENSAIO DE MANCHA DE AREIA IN LOCO - KM 650,000 AO KM 655,000 / NORTE / FX-01 / CBUQ 1ª CAMADA / INTERCALADO, 20 PONTOS, PREVISTO PARA O DIA 01/03/2026. SOLICITAÇÃO PROVENIENTE DO CONSÓRCIO BR 163 (108) - VÁRZEA GRANDE A JANGADA / LOTE 02. REGISTRADO COM N° 008/2026.',
 'Ensaio especial');

-- 4. Prévia da FR-IMOB-04 ----------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);
insert into pedidos_ensaio (id, empresa_id, lote, material, sub_tipo, tipo_solicitacao, ensaios_ids, especificacoes, dados_amostra, solicitante_id)
values ('50000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001','Lote 2','concreto','concreto','rotina',
        array(select id::text from ensaios where codigo_frimob04='ens_compressao_axial'), '{espec_compressao}',
        '[{"identificacao_cp":"1","data_moldagem":"2026-02-20"}]', '20000000-0000-0000-0000-00000000000c');
select t_erro($$select previa_ficha_os('50000000-0000-0000-0000-000000000009')$$, 'Apenas o laboratório', 'Prévia: o Campo não abre');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);
select t_ok((select (j->'marcados'->>'espec_compressao')::boolean and (j->'marcados'->>'ens_compressao_axial')::boolean
                    and j->>'contato' = '(65) 3056 9155'
                    and (j->>'previsao_entrega')::date = (j->>'data_solicitacao')::date + 60
                    and j->>'observacao' = gerar_observacao_os('50000000-0000-0000-0000-000000000009')
               from (select previa_ficha_os('50000000-0000-0000-0000-000000000009') j) x),
            'Prévia: itens marcados, contato, previsão e observação iguais aos da O.S.');
select t_ok((select numero_os is null and ficha_os_id is null from pedidos_ensaio where id='50000000-0000-0000-0000-000000000009'), 'Prévia não grava nada');
-- gerar a O.S. e gravar os ajustes da ficha na sequência (como o app faz)
select 1 from gerar_os('50000000-0000-0000-0000-000000000009', current_date, null);
select 1 from salvar_ficha_os('50000000-0000-0000-0000-000000000009',
  '{"espec_caract_material_asfaltico":true,"previsao_entrega":"2026-12-31","observacao":"TEXTO AJUSTADO ANTES DA O.S."}');
reset role;
select t_eq((select espec_caract_material_asfaltico || ' ' || previsao_entrega || ' ' || observacao from fichas_os where pedido_id='50000000-0000-0000-0000-000000000009'),
 'true 2026-12-31 TEXTO AJUSTADO ANTES DA O.S.', 'Ajustes feitos antes da O.S. ficam gravados (inclui o item novo)');

-- 5. Número 145/2026 ------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1', false);
select t_erro($$insert into pedidos_ensaio (empresa_id, lote, material, sub_tipo, ensaios_ids, dados_amostra, solicitante_id, sequencial)
               values ('10000000-0000-0000-0000-000000000001','Lote 2','concreto','concreto','{}','[]','20000000-0000-0000-0000-00000000000c', 2)$$,
              'O pedido 002/2026 já existe', 'Mensagem de número repetido no formato 002/2026');
select t_erro($$select excluir_pedido('50000000-0000-0000-0000-000000000008', 'PE-2026-007')$$, 'Digite o número do pedido (008/2026)', 'Excluir: confirmação errada mostra 008/2026');
select (excluir_pedido('50000000-0000-0000-0000-000000000008', '008/2026'))->>'numero';
reset role;
select t_ok(not exists (select 1 from pedidos_ensaio where id='50000000-0000-0000-0000-000000000008'), 'Excluir aceita "008/2026"');

-- 6. Cadastros: permissões, validade e histórico ---------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);
select t_ok((select count(*) = 7 from tracos_aprovados), 'Campo lê os traços');
select t_erro($$insert into jazidas (nome) values ('Jazida do Campo')$$, 'row-level security', 'Campo não cadastra jazida');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);
insert into jazidas (nome, municipio) values ('Jazida São José', 'Nova Mutum');
insert into pedreiras (nome, municipio) values ('Pedreira Cuiabá', 'Cuiabá');
insert into fornecedores_ligante (nome) values ('Petrobras');
select t_erro($$insert into jazidas (nome) values ('JAZIDA SÃO JOSÉ')$$, 'jazidas_nome_uq', 'Nome repetido (maiúsculas/minúsculas) é recusado');
select t_ok((select criado_por = '20000000-0000-0000-0000-00000000000a' from jazidas where nome = 'Jazida São José'), 'Cadastro registra quem criou');
insert into tracos_aprovados (nome_traco, aprovado_em, aprovado_por) values ('TRAÇO TESTE', '2026-04-10', 'Coordenador A');
select t_eq((select valido_ate::text from tracos_aprovados where nome_traco = 'TRAÇO TESTE'), '2026-10-10', 'Validade padrão: 6 meses depois da aprovação');
update tracos_aprovados set aprovado_em = '2026-10-01', valido_ate = '2027-04-01', aprovado_por = 'Coordenador B' where nome_traco = 'TRAÇO TESTE';
select t_eq((select string_agg(aprovado_em || '>' || valido_ate || ' ' || aprovado_por, ' | ' order by registrado_em) from tracos_validacoes
              where traco_id = (select id from tracos_aprovados where nome_traco = 'TRAÇO TESTE')),
            '2026-04-10>2026-10-10 Coordenador A | 2026-10-01>2027-04-01 Coordenador B', 'Histórico: aprovação e revalidação');
update tracos_aprovados set observacoes = 'só uma nota' where nome_traco = 'TRAÇO TESTE';
select t_eq((select count(*)::text from tracos_validacoes where traco_id = (select id from tracos_aprovados where nome_traco = 'TRAÇO TESTE')), '2',
            'Alterar só a observação não cria linha no histórico');
select t_erro($$update tracos_aprovados set valido_ate = '2026-01-01' where nome_traco = 'TRAÇO TESTE'$$, 'anterior à data da aprovação', 'Validade antes da aprovação é recusada');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);
select t_ok((select count(*) = 0 from tracos_validacoes), 'Campo não vê o histórico de validação');
reset role;

-- 7. Documento do traço (bucket privado) -------------------------------------------------
insert into storage.objects (bucket_id, name) values ('tracos', 'x/doc.pdf');
grant select, insert, delete on storage.objects to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);
select t_ok((select count(*) = 0 from storage.objects where bucket_id = 'tracos'), 'Campo não lê documento de traço');
select t_erro($$insert into storage.objects (bucket_id, name) values ('tracos', 'y/doc.pdf')$$, 'row-level security', 'Campo não envia documento de traço');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);
select t_ok((select count(*) = 1 from storage.objects where bucket_id = 'tracos'), 'Laboratório lê o documento do traço');
reset role;
