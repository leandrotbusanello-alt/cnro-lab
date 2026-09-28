-- Parte B (rodar DEPOIS da migração 16). Pré: 00_base, 10–15, 40_catalogo_real, 60a_pre_m16.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
create or replace function public.t_ok(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'FALHOU: %', msg; end if; raise warning 'ok  %', msg; end $$;
grant execute on function public.t_ok(boolean,text) to authenticated;
create or replace function public.t_eq(a text, b text, msg text) returns void language plpgsql as $$
begin if a is distinct from b then raise exception E'FALHOU: %\n  obtido:   %\n  esperado: %', msg, a, b; end if; raise warning 'ok  %', msg; end $$;

-- 1. Conversão dos números antigos
select t_eq((select numero_pe||' '||numero_os from pedidos_ensaio where sequencial=94), '094 2026.03.27.02.094', 'PE e O.S. antigos convertidos para 3 dígitos');
select t_eq((select numero_os from fichas_os where pedido_id='40000000-0000-0000-0000-000000000094'), '2026.03.27.02.094', 'FR-IMOB-04: número da O.S. convertido');
select t_ok((select observacao like '%N° 094/2026.' from fichas_os where pedido_id='40000000-0000-0000-0000-000000000094'), 'FR-IMOB-04: número convertido no texto da observação');

-- helper: cria pedido como Campo e gera O.S. como laboratorista
create or replace function public.t_pedido(p_id uuid, p_emp int, p_lote text, p_mat text, p_sub text, p_codigos text[], p_dados jsonb, p_seq int default null, p_data date default '2026-02-24')
returns void language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', case when p_seq is null then '00000000-0000-0000-0000-00000000000c' else '00000000-0000-0000-0000-0000000000d1' end, true);
  insert into pedidos_ensaio (id, empresa_id, lote, material, sub_tipo, tipo_solicitacao, ensaios_ids, dados_amostra, solicitante_id, created_at, sequencial)
  values (p_id, ('10000000-0000-0000-0000-00000000000'||p_emp)::uuid, p_lote, p_mat, p_sub, 'rotina',
          array(select id::text from ensaios where codigo_frimob04 = any(p_codigos)), p_dados,
          '20000000-0000-0000-0000-00000000000c', (p_data::timestamp + time '10:00') at time zone 'America/Cuiaba', p_seq);
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', true);
  perform gerar_os(p_id, p_data, null);
  reset role;
end $$;
create or replace function public.t_obs(p_id uuid) returns text language sql as $$ select observacao from fichas_os where pedido_id = p_id $$;

-- 2. CPs extraídos de pista (exemplo da O.S. 127/2026), como o Campo grava: uma amostra por CP
select t_pedido('50000000-0000-0000-0000-000000000001', 2, 'Lote 3', 'asfalto', 'cps_extraidos_pista', array['ens_marshall'],
 '[{"tipo_mistura":"CBUQ","data_aplicacao":"2026-02-23","estaca":"730+900","pista":"Norte","faixa":"1ª Faixa","camada":"2ª Camada","info_geral":{}},
   {"tipo_mistura":"CBUQ","data_aplicacao":"2026-02-23","estaca":"731+100","pista":"Norte","faixa":"1ª Faixa","camada":"2ª Camada"},
   {"tipo_mistura":"CBUQ","data_aplicacao":"2026-02-23","estaca":"731+100","pista":"Norte","faixa":"1ª Faixa","camada":"2ª Camada"},
   {"tipo_mistura":"CBUQ","data_aplicacao":"2026-02-23","estaca":"KM 731+200","pista":"Norte","faixa":"1ª Faixa","camada":"2ª Camada"}]');
select t_eq(t_obs('50000000-0000-0000-0000-000000000001'),
 'FORAM ENTREGUES AO LABORATÓRIO DA CNRO 04 CPs DE C.A.U.Q. - KM 730+900, KM 731+100, KM 731+100 E KM 731+200 / NORTE / FX-01 / 2ª CAMADA, COM A DATA REFERENTE AO DIA 23/02/2026. CORPOS DE PROVA PROVENIENTES DA CONSTRUTORA TRIPOLONI - LUCAS DO RIO VERDE / LOTE 03, PARA CONFERÊNCIA DE PARÂMETROS. REGISTRADO COMO OS N° 095/2026.',
 'CPs extraídos: texto igual ao da O.S. em papel (numeração automática 095)');
select t_eq((select observacao from fichas_solicitacao where pedido_id='50000000-0000-0000-0000-000000000001'), t_obs('50000000-0000-0000-0000-000000000001'), 'FR-IMOB-05 recebe o mesmo texto');
select t_eq((select numero_pe||' '||numero_os from pedidos_ensaio where id='50000000-0000-0000-0000-000000000001'), '095 2026.02.24.03.095', 'Número automático segue o contador com 3 dígitos');

-- 3. Previsão +60 dias, contato padrão, solicitante
select t_eq((select data_solicitacao||' '||previsao_entrega||' '||contato||' '||solicitante from fichas_os where pedido_id='50000000-0000-0000-0000-000000000001'),
            '2026-02-24 2026-04-25 (65) 3056 9155 Thyago Biasin', 'FR-IMOB-04: previsão = solicitação + 60 dias, contato padrão e solicitante do Campo');
select t_eq((select contato from fichas_solicitacao where pedido_id='50000000-0000-0000-0000-000000000001'), '(65) 3056 9155', 'FR-IMOB-05: contato padrão');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);
select 1 from salvar_ficha_os('50000000-0000-0000-0000-000000000001',
                              '{"previsao_entrega":"2026-05-30","contato":"(65) 9999-0000","observacao":"TEXTO EDITADO"}'::jsonb);
reset role;
select t_eq((select previsao_entrega||' '||contato||' '||observacao from fichas_os where pedido_id='50000000-0000-0000-0000-000000000001'),
            '2026-05-30 (65) 9999-0000 TEXTO EDITADO', 'Previsão, contato e observação continuam editáveis pelo laboratorista');

-- 4. Massa asfáltica (O.S. 094 em papel) — agora com número manual 1024 (DEV)
select t_pedido('50000000-0000-0000-0000-000000000002', 1, 'Lote 2', 'asfalto', 'massa_asfaltica', array['ens_marshall','ens_rice'],
 '[{"tipo_mistura":"CAUQ","faixa_granulometrica":"FX-III DER-SP","trecho":"x"}]', 1024);
select t_eq(t_obs('50000000-0000-0000-0000-000000000002'),
 'FOI ENTREGUE AO LABORATÓRIO UMA AMOSTRA DE C.A.U.Q. FX-III DER-SP PROVENIENTE DO CONSÓRCIO BR 163 (108) - VÁRZEA GRANDE A JANGADA / LOTE 02. REGISTRADO COM N° 1024/2026.',
 'Massa asfáltica: texto no padrão do papel');
select t_eq((select numero_pe||' '||numero_os from pedidos_ensaio where id='50000000-0000-0000-0000-000000000002'), '1024 2026.02.24.02.1024', 'Número acima de 999 cresce normalmente (1024)');
select t_eq((select ultimo::text from contadores_pedido where ano=2026), '1024', 'Contador passa a 1024');

-- 5. Próximo automático depois de 1024
select t_pedido('50000000-0000-0000-0000-000000000003', 1, 'Lote 2', 'concreto', 'concreto', array['ens_compressao_axial'],
 '[{"estrutura":"Pilar","local":"P3","data_moldagem":"2026-02-20","numeracao_cps":"401 A 404"},{"estrutura":"Pilar","local":"P3","data_moldagem":"2026-02-21","numeracao_cps":"405 A 408"}]');
select t_eq(t_obs('50000000-0000-0000-0000-000000000003'),
 'FORAM ENTREGUES AO LABORATÓRIO CORPOS DE PROVA DE CONCRETO (CPs 401 A 404 E 405 A 408) DO PILAR P3. CORPOS DE PROVA MOLDADOS PARA O ENSAIO DE COMPRESSÃO AXIAL, MOLDAGEM FEITA NO DIA 20/02/2026 E 21/02/2026. CORPOS DE PROVA PROVENIENTES DO CONSÓRCIO BR 163 (108) - VÁRZEA GRANDE A JANGADA / LOTE 02. REGISTRADOS COM N° 1025/2026.',
 'Concreto com duas amostras: CPs e datas listados; próximo número 1025');

-- 6. Alterar número (DEV): 1025 → 96, e O.S./observação acompanham
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1', false);
select 1 from alterar_numero_pe('50000000-0000-0000-0000-000000000003', 96);
reset role;
select t_eq((select numero_pe||' '||numero_os from pedidos_ensaio where id='50000000-0000-0000-0000-000000000003'), '096 2026.02.24.02.096', 'Alterar nº: 1025 → 096 no PE e no final da O.S.');
select t_ok(t_obs('50000000-0000-0000-0000-000000000003') like '%REGISTRADOS COM N° 096/2026.', 'Alterar nº: observação acompanha');
select t_eq((select numero_os from fichas_os where pedido_id='50000000-0000-0000-0000-000000000003'), '2026.02.24.02.096', 'Alterar nº: FR-IMOB-04 acompanha');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1', false);
select 1 from alterar_numero_pe('50000000-0000-0000-0000-000000000003', 12345);
reset role;
select t_eq((select numero_pe||' '||numero_os from pedidos_ensaio where id='50000000-0000-0000-0000-000000000003'), '12345 2026.02.24.02.12345', 'Alterar nº: aceita 5 dígitos');
do $$ begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1', true);
  set local role authenticated;
  begin perform alterar_numero_pe('50000000-0000-0000-0000-000000000003', 100000); raise exception 'deveria recusar';
  exception when others then if sqlerrm not like '%entre 1 e 99999%' then raise; end if; end;
end $$;
select t_ok(true, 'Alterar nº: recusa acima de 99999');

-- 7. Demais tipos (estilo do papel). O contador está em 12345 (Alterar nº subiu o contador)
select t_pedido('50000000-0000-0000-0000-000000000004', 1, 'Lote 2', 'asfalto', 'ligante_asfaltico', array['ens_penetracao','ens_ponto_amolecimento','ens_viscosidade'],
 '[{"tipo_ligante":"CAP 50/70","fornecedor":"Petrobras","nota_fiscal":"NF 12345","data_coleta":"2026-02-22","certificado":"certificados/x/y.pdf"}]');
select t_eq(t_obs('50000000-0000-0000-0000-000000000004'),
 'FOI ENTREGUE AO LABORATÓRIO UMA AMOSTRA DE LIGANTE ASFÁLTICO CAP 50/70 DO FORNECEDOR PETROBRAS (NF 12345), COLETADA NO DIA 22/02/2026, PARA OS ENSAIOS DE PENETRAÇÃO, PONTO DE AMOLECIMENTO — MÉTODO ANEL E BOLA E VISCOSIDADE USANDO VISCOSÍMETRO ROTACIONAL BROOKFIELD. MATERIAL PROVENIENTE DO CONSÓRCIO BR 163 (108) - VÁRZEA GRANDE A JANGADA / LOTE 02. REGISTRADO COM N° 12346/2026.',
 'Ligante asfáltico');
select t_pedido('50000000-0000-0000-0000-000000000005', 2, 'Lote 3', 'solos', 'jazida', array['ens_granulometria','ens_compactacao_nt'],
 '[{"jazida":"Jazida São José","municipio":"Nova Mutum","profundidade":"0,60 m","data_coleta":"2026-02-20"}]');
select t_eq(t_obs('50000000-0000-0000-0000-000000000005'),
 'FOI ENTREGUE AO LABORATÓRIO UMA AMOSTRA DE SOLO DA JAZIDA SÃO JOSÉ - NOVA MUTUM, PROFUNDIDADE 0,60 M, COLETADA NO DIA 20/02/2026, PARA OS ENSAIOS DE ANÁLISE GRANULOMÉTRICA POR PENEIRAMENTO E COMPACTAÇÃO DE AMOSTRAS NÃO TRABALHADAS. MATERIAL PROVENIENTE DA CONSTRUTORA TRIPOLONI - LUCAS DO RIO VERDE / LOTE 03. REGISTRADO COM N° 12347/2026.',
 'Jazida');
select t_pedido('50000000-0000-0000-0000-000000000006', 2, 'Lote 3', 'solos', 'segmento', array['ens_massa_esp_insitu'],
 '[{"estaca_inicial":"700+000","estaca_final":"701+000","pista":"Sul","camada":"Sub-base","proctor":"Intermediário (PI)","gc_minimo":"100"},{"estaca_inicial":"700+000","estaca_final":"701+000","pista":"Sul","camada":"Sub-base"}]');
select t_eq(t_obs('50000000-0000-0000-0000-000000000006'),
 'FORAM ENTREGUES AO LABORATÓRIO 02 AMOSTRAS DE SOLO - KM 700+000 AO KM 701+000 / SUL / SUB-BASE, PARA O ENSAIO DE MASSA ESPECÍFICA APARENTE "IN SITU", PROCTOR INTERMEDIÁRIO (PI), GC MÍNIMO DE 100%. MATERIAL PROVENIENTE DA CONSTRUTORA TRIPOLONI - LUCAS DO RIO VERDE / LOTE 03. REGISTRADO COM N° 12348/2026.',
 'Segmento');
select t_pedido('50000000-0000-0000-0000-000000000007', 1, 'Lote 2', 'especial', 'deflectometria', array['ens_benkelman'],
 '[{"equipamento":"Viga Benkelman","estaca_inicial":"650+000","estaca_final":"655+000","pista":"Norte","faixa":"1ª Faixa","qtd_pontos":"50","intervalo":"100 m","data_desejada":"2026-03-01"}]');
select t_eq(t_obs('50000000-0000-0000-0000-000000000007'),
 'SOLICITADA AO LABORATÓRIO A EXECUÇÃO DO ENSAIO DE DEFLECTOMETRIA (VIGA BENKELMAN) IN LOCO - KM 650+000 AO KM 655+000 / NORTE / FX-01, 50 PONTOS, INTERVALO DE 100 M, PREVISTO PARA O DIA 01/03/2026. SOLICITAÇÃO PROVENIENTE DO CONSÓRCIO BR 163 (108) - VÁRZEA GRANDE A JANGADA / LOTE 02. REGISTRADO COM N° 12349/2026.',
 'Ensaio especial (deflectometria)');
select t_pedido('50000000-0000-0000-0000-000000000008', 2, 'Lote 3', 'solos', 'cps_solo_cimento', array['ens_resistencia_tracao'],
 '[{"teor_cimento":"4","data_moldagem":"2026-02-19","qtd_cps":"3","numeracao_cps":"10 A 12","estaca_inicial":"710+000","pista":"Norte","camada":"Base"}]');
select t_ok(t_obs('50000000-0000-0000-0000-000000000008') like 'FORAM ENTREGUES AO LABORATÓRIO 03 CORPOS DE PROVA DE SOLO-CIMENTO (CPs 10 A 12) - KM 710+000 / NORTE / BASE, COM TEOR DE CIMENTO DE 4%. CORPOS DE PROVA MOLDADOS PARA O ENSAIO DE RESISTÊNCIA À TRAÇÃO, MOLDAGEM FEITA NO DIA 19/02/2026.%', 'CPs solo-cimento');
select t_pedido('50000000-0000-0000-0000-000000000009', 1, 'Lote 2', 'solos', 'agregados', array['ens_dens_agr_graudo'],
 '[{"tipo_agregado":"Brita 1","origem":"Pedreira Cuiabá","local_aplicacao":"Base"}]');
select t_ok(t_obs('50000000-0000-0000-0000-000000000009') like 'FOI ENTREGUE AO LABORATÓRIO UMA AMOSTRA DE BRITA 1 - ORIGEM: PEDREIRA CUIABÁ, DESTINADA A BASE, PARA O ENSAIO DE MASSA ESPECÍFICA%', 'Agregados');
-- faltando dados: não quebra
select t_pedido('50000000-0000-0000-0000-000000000010', 1, 'Lote 2', 'asfalto', 'cps_extraidos_pista', array['ens_marshall'], '[{}]');
select t_eq(t_obs('50000000-0000-0000-0000-000000000010'),
 'FORAM ENTREGUES AO LABORATÓRIO DA CNRO 01 CPs DE C.A.U.Q. CORPOS DE PROVA PROVENIENTES DO CONSÓRCIO BR 163 (108) - VÁRZEA GRANDE A JANGADA / LOTE 02, PARA CONFERÊNCIA DE PARÂMETROS. REGISTRADO COMO OS N° 12352/2026.',
 'Sem dados de campo: texto mínimo, sem erro');
select t_ok(gerar_observacao_os('50000000-0000-0000-0000-000000000001') is not null, 'Função continua chamável pelo app');
