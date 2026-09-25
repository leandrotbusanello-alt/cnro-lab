-- Testes da migração 14 (rodar como postgres, depois de 00 + 10..13b + 14)
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- ── Utilitários de teste ─────────────────────────────────────────────────────
create or replace function public.t_ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if;
  raise warning 'ok  %', msg;
end $$;
create or replace function public.t_erro(cmd text, trecho text, msg text) returns void language plpgsql as $$
begin
  begin
    execute cmd;
  exception when others then
    if position(lower(trecho) in lower(sqlerrm)) > 0 then
      raise warning 'ok  % → "%"', msg, sqlerrm; return;
    end if;
    raise exception 'FALHOU: % — erro inesperado: %', msg, sqlerrm;
  end;
  raise exception 'FALHOU: % — deveria ter dado erro', msg;
end $$;
grant execute on function public.t_ok(boolean, text), public.t_erro(text, text, text) to authenticated;

-- ── Dados base ───────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000d','dev@x'), ('00000000-0000-0000-0000-00000000000a','lab1@x'),
 ('00000000-0000-0000-0000-00000000000b','lab2@x'), ('00000000-0000-0000-0000-00000000000c','campo@x'),
 ('00000000-0000-0000-0000-0000000000a1','assist1@x'), ('00000000-0000-0000-0000-0000000000a2','assist2@x'),
 ('00000000-0000-0000-0000-0000000000ee','gestor@x');
insert into public.empresas (id, nome, lote, rodovia) values ('10000000-0000-0000-0000-000000000001','Consórcio Alfa','Lote 3','BR-163');
insert into public.usuarios (id, auth_id, nome, perfil, email, assinatura_url, status) values
 ('20000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-00000000000d','Leandro DEV','DEV','dev@x', null,'Ativo'),
 ('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','Laura Lab','LAB','lab1@x','l1/a.png','Ativo'),
 ('20000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b','Lucas Lab','LAB','lab2@x','l2/a.png','Ativo'),
 ('20000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c','Carlos Campo','CAMPO','campo@x',null,'Ativo'),
 ('20000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','Ana Assist','ASSIST','assist1@x','a1/a.png','Ativo'),
 ('20000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2','Bruno Assist','ASSIST','assist2@x',null,'Inativo'),
 ('20000000-0000-0000-0000-0000000000ee','00000000-0000-0000-0000-0000000000ee','Gabi Gestor','GESTOR','gestor@x','g/a.png','Ativo');
insert into public.ensaios (id, nome, categoria, norma) values ('30000000-0000-0000-0000-000000000001','Marshall','asfalto','DNIT 043');
update public.fichas_ensaio set ensaio_id = '30000000-0000-0000-0000-000000000001' where codigo = 'FR-IMOB-13';

-- ═════════════════════════════════════════════════════════════════════════════
-- A. Fluxo NORMAL continua igual
-- ═════════════════════════════════════════════════════════════════════════════
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);  -- Campo
insert into pedidos_ensaio (id, empresa_id, lote, material, sub_tipo, ensaios_ids, dados_amostra, solicitante_id, created_at, sequencial)
values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Lote 3','asfalto','massa_asfaltica',
        array['30000000-0000-0000-0000-000000000001'],'[{"km":"10"}]','20000000-0000-0000-0000-00000000000c', now(), 999);
select t_ok((select numero_pe = '0001' and sequencial = 1 from pedidos_ensaio where id = '40000000-0000-0000-0000-000000000001'),
            'A1 Campo: número automático 0001 (sequencial enviado pelo app é ignorado)');
select t_erro($$insert into pedidos_ensaio (lancamento_historico, solicitante_id, laboratorista_id, created_at, ensaios_ids)
               values (true, '20000000-0000-0000-0000-00000000000c','20000000-0000-0000-0000-00000000000a', now(), '{}')$$,
              'Somente o DEV', 'A2 Campo não cria lançamento histórico');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);  -- Lab1
select assumir_pedido('40000000-0000-0000-0000-000000000001');
select gerar_os('40000000-0000-0000-0000-000000000001', current_date, null);
update ensaios_os set assistente_id = '20000000-0000-0000-0000-0000000000a1',
       ficha_ensaio_id = (select id from fichas_ensaio where codigo='FR-IMOB-13'), data_atribuicao = now()
 where pedido_id = '40000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1', false);  -- Assist1
select iniciar_ensaio(id) from ensaios_os where pedido_id = '40000000-0000-0000-0000-000000000001';
select enviar_para_revisao(id, '{"x":1}', now()) from ensaios_os where pedido_id = '40000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);  -- Lab1
select aprovar_ensaio(id, '{"x":1}', '[{"tabela":"resultado_marshall","linhas":[{"codigo_cp":"CP 1","va_pct":4.1}]}]', 'Conforme', null, true, now())
  from ensaios_os where pedido_id = '40000000-0000-0000-0000-000000000001';
select finalizar_os('40000000-0000-0000-0000-000000000001');
reset role;
select t_ok((select status = 'concluido' and finalizado_por = '20000000-0000-0000-0000-00000000000a' and not lancamento_historico
               from pedidos_ensaio where id = '40000000-0000-0000-0000-000000000001'), 'A3 fluxo normal completo (finalizado por Lab1)');
select t_ok((select bool_and(not (e ? 'lancado_por')) from pedidos_ensaio p, jsonb_array_elements(p.historico) e
              where p.id = '40000000-0000-0000-0000-000000000001'), 'A4 histórico normal sem marcação de lançamento');
select t_ok((select count(*) = 0 from audit_log where em_nome_de is not null), 'A5 auditoria normal sem "em nome de"');
select t_ok((select data_revisao = current_date from resultados where pedido_id = '40000000-0000-0000-0000-000000000001'),
            'A6 resultado normal com data de revisão = hoje');

-- ═════════════════════════════════════════════════════════════════════════════
-- B. Numeração manual (DEV) e contador pelo maior
-- ═════════════════════════════════════════════════════════════════════════════
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d', false);  -- DEV
insert into pedidos_ensaio (id, lancamento_historico, empresa_id, lote, material, sub_tipo, ensaios_ids, dados_amostra,
                            solicitante_id, laboratorista_id, created_at, sequencial)
values ('40000000-0000-0000-0000-000000000350', true, '10000000-0000-0000-0000-000000000001','Lote 3','asfalto','massa_asfaltica',
        array['30000000-0000-0000-0000-000000000001'],'[{"km":"20"}]',
        '20000000-0000-0000-0000-00000000000c','20000000-0000-0000-0000-00000000000a', '2026-09-20T12:00:00-04:00', 350);
select t_ok((select numero_pe='0350' and ano=2026 and lancamento_historico and lancado_por='20000000-0000-0000-0000-00000000000d'
               and laboratorista_id='20000000-0000-0000-0000-00000000000a' and status='aguardando_lab'
               from pedidos_ensaio where id='40000000-0000-0000-0000-000000000350'), 'B1 DEV lança o último pedido em papel: PE-2026-0350');
reset role;
select t_ok((select ultimo = 350 from contadores_pedido where ano = 2026), 'B2 contador foi para 350');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);  -- Campo
insert into pedidos_ensaio (id, empresa_id, lote, material, ensaios_ids, solicitante_id, created_at)
values ('40000000-0000-0000-0000-000000000351','10000000-0000-0000-0000-000000000001','Lote 3','asfalto',
        array['30000000-0000-0000-0000-000000000001'],'20000000-0000-0000-0000-00000000000c', now());
select t_ok((select numero_pe='0351' from pedidos_ensaio where id='40000000-0000-0000-0000-000000000351'),
            'B3 próximo pedido do Campo recebe 0351');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d', false);  -- DEV
insert into pedidos_ensaio (id, lancamento_historico, empresa_id, lote, material, sub_tipo, ensaios_ids, dados_amostra,
                            solicitante_id, laboratorista_id, created_at, sequencial)
values ('40000000-0000-0000-0000-000000000120', true, '10000000-0000-0000-0000-000000000001','Lote 3','asfalto','massa_asfaltica',
        array['30000000-0000-0000-0000-000000000001'],'[{"km":"5"}]',
        '20000000-0000-0000-0000-00000000000c','20000000-0000-0000-0000-00000000000a', '2026-03-10T12:00:00-04:00', 120);
select t_ok((select numero_pe='0120' from pedidos_ensaio where id='40000000-0000-0000-0000-000000000120'), 'B4 DEV lança número menor (0120)');
select t_erro($$insert into pedidos_ensaio (lancamento_historico, solicitante_id, laboratorista_id, created_at, sequencial, ensaios_ids)
               values (true,'20000000-0000-0000-0000-00000000000c','20000000-0000-0000-0000-00000000000a','2026-03-01T12:00:00-04:00',120,'{}')$$,
              'já existe', 'B5 número repetido é recusado');
select t_erro($$insert into pedidos_ensaio (lancamento_historico, solicitante_id, laboratorista_id, created_at, sequencial, ensaios_ids)
               values (true,'20000000-0000-0000-0000-00000000000c','20000000-0000-0000-0000-00000000000a', now() + interval '3 days', 7,'{}')$$,
              'futura', 'B6 data futura é recusada');
select t_erro($$insert into pedidos_ensaio (lancamento_historico, solicitante_id, laboratorista_id, created_at, sequencial, ensaios_ids)
               values (true,'20000000-0000-0000-0000-00000000000c','20000000-0000-0000-0000-0000000000a1','2026-03-01T12:00:00-04:00',8,'{}')$$,
              'módulo Laboratório', 'B7 laboratorista precisa ter o módulo Laboratório');
select t_erro($$insert into pedidos_ensaio (lancamento_historico, solicitante_id, created_at, sequencial, ensaios_ids)
               values (true,'20000000-0000-0000-0000-00000000000c','2026-03-01T12:00:00-04:00',9,'{}')$$,
              'laboratorista', 'B8 laboratorista obrigatório');
reset role;
select t_ok((select ultimo = 351 from contadores_pedido where ano = 2026), 'B9 contador continua em 351 depois do 0120');

-- ═════════════════════════════════════════════════════════════════════════════
-- C. Fluxo completo do lançamento histórico (DEV agindo em nome das pessoas)
-- ═════════════════════════════════════════════════════════════════════════════
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d', false);  -- DEV
select assumir_pedido('40000000-0000-0000-0000-000000000120');
select t_ok((select status='em_analise' and laboratorista_id='20000000-0000-0000-0000-00000000000a'
                    and assumido_em = '2026-03-10T12:00:00-04:00'::timestamptz
               from pedidos_ensaio where id='40000000-0000-0000-0000-000000000120'), 'C1 assumir: responsável continua Laura, data = data do pedido');
select t_ok(public.usuario_atual_id() = '20000000-0000-0000-0000-00000000000d', 'C2 representação não vaza para a próxima transação');

select t_erro($$select gerar_os('40000000-0000-0000-0000-000000000120', null, null)$$, 'data da O.S.', 'C3 O.S. histórica exige data');
select t_erro($$select gerar_os('40000000-0000-0000-0000-000000000120', '2026-03-01', null)$$, 'anterior', 'C4 O.S. não pode ser anterior ao pedido');
select gerar_os('40000000-0000-0000-0000-000000000120', '2026-03-11', null);
select t_ok((select numero_os='2026.03.11.03.0120' and data_validacao='2026-03-11' and aberto_por='20000000-0000-0000-0000-00000000000a'
               from pedidos_ensaio where id='40000000-0000-0000-0000-000000000120'), 'C5 O.S. 2026.03.11.03.0120 aberta em nome de Laura');
select t_ok((select criado_por='20000000-0000-0000-0000-00000000000a' and data_solicitacao='2026-03-10'
               from fichas_os where pedido_id='40000000-0000-0000-0000-000000000120'), 'C6 FR-IMOB-04 criada em nome de Laura, data 10/03');

update ensaios_os set assistente_id = '20000000-0000-0000-0000-0000000000a1',
       ficha_ensaio_id = (select id from fichas_ensaio where codigo='FR-IMOB-13'),
       data_atribuicao = '2026-03-11T12:00:00-04:00'
 where pedido_id = '40000000-0000-0000-0000-000000000120';
select adicionar_historico('40000000-0000-0000-0000-000000000120', '{"acao":"Ensaio atribuído","ensaio":"Marshall"}');

select iniciar_ensaio(id) from ensaios_os where pedido_id = '40000000-0000-0000-0000-000000000120';
select t_ok((select status='em_andamento' and iniciado_em='2026-03-11T12:00:00-04:00'::timestamptz
               from ensaios_os where pedido_id='40000000-0000-0000-0000-000000000120'), 'C7 iniciar em nome da Ana, data da atribuição');
select salvar_rascunho_ensaio(id, '{"x":2}') from ensaios_os where pedido_id = '40000000-0000-0000-0000-000000000120';
select t_erro($$select enviar_para_revisao(id, '{"x":2}', now() + interval '5 days') from ensaios_os where pedido_id = '40000000-0000-0000-0000-000000000120'$$,
              'futura', 'C8 envio com data futura é recusado');
select enviar_para_revisao(id, '{"x":2}', '2026-03-12T12:00:00-04:00') from ensaios_os where pedido_id = '40000000-0000-0000-0000-000000000120';
select t_ok((select status='aguardando_revisao' and data_conclusao='2026-03-12T12:00:00-04:00'::timestamptz
                    and assinatura_executor->>'usuario_id' = '20000000-0000-0000-0000-0000000000a1'
                    and assinatura_executor->>'nome' = 'Ana Assist'
               from ensaios_os where pedido_id='40000000-0000-0000-0000-000000000120'), 'C9 enviado com assinatura da Ana em 12/03');
select salvar_revisao_ensaio(id, '{"x":3}') from ensaios_os where pedido_id = '40000000-0000-0000-0000-000000000120';
select aprovar_ensaio(id, '{"x":3}', '[{"tabela":"resultado_marshall","linhas":[{"codigo_cp":"CP 1","va_pct":4.0}]}]',
                      'Conforme', null, false, '2026-03-13T12:00:00-04:00')
  from ensaios_os where pedido_id = '40000000-0000-0000-0000-000000000120';
select t_ok((select status='aprovado' and aprovado_por_id='20000000-0000-0000-0000-00000000000a'
                    and aprovado_em='2026-03-13T12:00:00-04:00'::timestamptz
                    and assinatura_calculista->>'nome'='Laura Lab'
               from ensaios_os where pedido_id='40000000-0000-0000-0000-000000000120'), 'C10 aprovado com assinatura da Laura em 13/03');
select t_ok((select laboratorista_id='20000000-0000-0000-0000-00000000000a' and assistente_id='20000000-0000-0000-0000-0000000000a1'
                    and data_execucao='2026-03-12' and data_revisao='2026-03-13' and status='aprovado'
               from resultados where pedido_id='40000000-0000-0000-0000-000000000120'), 'C11 resultados: execução 12/03, revisão 13/03 (Painel)');
select t_ok((select count(*)=1 from resultado_marshall m join resultados r on r.id=m.resultado_id
              where r.pedido_id='40000000-0000-0000-0000-000000000120' and m.created_at='2026-03-13T12:00:00-04:00'::timestamptz),
            'C12 resultado_marshall gravado com data 13/03');
select t_erro($$select finalizar_os('40000000-0000-0000-0000-000000000120')$$, 'data da finalização', 'C13 finalizar histórico exige data');
select finalizar_os('40000000-0000-0000-0000-000000000120', '2026-03-14T12:00:00-04:00');
select t_ok((select status='concluido' and finalizado_por='20000000-0000-0000-0000-00000000000a'
                    and finalizado_em='2026-03-14T12:00:00-04:00'::timestamptz
               from pedidos_ensaio where id='40000000-0000-0000-0000-000000000120'), 'C14 finalizado por Laura em 14/03');
select t_ok((select inicio_ensaios='2026-03-11' and fim_ensaios='2026-03-12' and analise_ensaios='2026-03-14'
               from fichas_os where pedido_id='40000000-0000-0000-0000-000000000120'), 'C15 FR-IMOB-04 com datas 11/03 → 12/03 → 14/03');
reset role;
select t_ok((select count(*) >= 7 and bool_and(e->>'lancado_por' = 'Leandro DEV')
               from pedidos_ensaio p, jsonb_array_elements(p.historico) e
              where p.id='40000000-0000-0000-0000-000000000120'), 'C16 todo evento do histórico marca "lançado por Leandro DEV"');
select t_ok((select string_agg(e->>'usuario', ',' order by ord) = 'Carlos Campo,Laura Lab,Laura Lab,Laura Lab,Ana Assist,Ana Assist,Laura Lab,Laura Lab,Laura Lab'
               from pedidos_ensaio p, jsonb_array_elements(p.historico) with ordinality x(e, ord)
              where p.id='40000000-0000-0000-0000-000000000120'), 'C17 cada evento em nome da pessoa real (Campo, Lab, Assist)');
select t_ok((select count(*) > 0 and bool_and(usuario_id='20000000-0000-0000-0000-00000000000d')
               from audit_log where em_nome_de is not null), 'C18 auditoria: autor real DEV + "em nome de"');
select t_ok((select count(distinct em_nome_de)=2 from audit_log where em_nome_de is not null), 'C19 auditoria registra Laura e Ana como representadas');

-- ═════════════════════════════════════════════════════════════════════════════
-- D. Bloqueios para quem não é DEV
-- ═════════════════════════════════════════════════════════════════════════════
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d', false);  -- DEV cria outro histórico
insert into pedidos_ensaio (id, lancamento_historico, empresa_id, lote, material, ensaios_ids, dados_amostra,
                            solicitante_id, laboratorista_id, created_at, sequencial)
values ('40000000-0000-0000-0000-000000000121', true, '10000000-0000-0000-0000-000000000001','Lote 3','asfalto',
        array['30000000-0000-0000-0000-000000000001'],'[{}]','20000000-0000-0000-0000-00000000000c','20000000-0000-0000-0000-00000000000a',
        '2026-04-01T12:00:00-04:00', 200);
select gerar_os('40000000-0000-0000-0000-000000000121', '2026-04-02', null);
update ensaios_os set assistente_id = '20000000-0000-0000-0000-0000000000a2',   -- Bruno: inativo e sem assinatura
       ficha_ensaio_id = (select id from fichas_ensaio where codigo='FR-IMOB-13'), data_atribuicao = '2026-04-02T12:00:00-04:00'
 where pedido_id = '40000000-0000-0000-0000-000000000121';
select iniciar_ensaio(id) from ensaios_os where pedido_id = '40000000-0000-0000-0000-000000000121';
select t_ok((select status='em_andamento' from ensaios_os where pedido_id='40000000-0000-0000-0000-000000000121'),
            'D1 executor inativo é aceito no histórico (pode ter saído da empresa)');
select t_erro($$select enviar_para_revisao(id, '{"x":1}', '2026-04-03T12:00:00-04:00') from ensaios_os where pedido_id = '40000000-0000-0000-0000-000000000121'$$,
              'Bruno Assist ainda não tem assinatura', 'D2 executor sem assinatura bloqueia o envio (mensagem com o nome)');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);  -- Lab1 (a responsável!)
select t_erro($$update pedidos_ensaio set observacoes='x' where id='40000000-0000-0000-0000-000000000121'$$,
              'somente o DEV', 'D3 laboratorista real não altera pedido histórico');
select t_erro($$select assumir_pedido('40000000-0000-0000-0000-000000000121')$$, 'somente o DEV', 'D4 laboratorista não usa RPC em histórico');
select t_erro($$update ensaios_os set visivel_campo = true where pedido_id='40000000-0000-0000-0000-000000000121'$$,
              'somente o DEV', 'D5 laboratorista não altera ensaio histórico');
select t_erro($$select excluir_pedido('40000000-0000-0000-0000-000000000351','0351')$$, 'Somente o DEV', 'D6 laboratorista não exclui pedido');
select t_erro($$select alterar_numero_pe('40000000-0000-0000-0000-000000000351', 400)$$, 'Somente o DEV', 'D7 laboratorista não altera número');
select set_config('cnro.agir_como', '20000000-0000-0000-0000-00000000000d', false);
select t_ok(public.usuario_atual_id() = '20000000-0000-0000-0000-00000000000a', 'D8 não-DEV não consegue se passar por outra pessoa');
select set_config('cnro.agir_como', '', false);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1', false);  -- Ana (Assist)
select t_erro($$select iniciar_ensaio(id) from ensaios_os where pedido_id = '40000000-0000-0000-0000-000000000121'$$,
              'somente o DEV', 'D9 assistente não mexe em ensaio histórico');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000ee', false);  -- Gestor
select t_erro($$insert into pedidos_ensaio (lancamento_historico, solicitante_id, laboratorista_id, created_at, ensaios_ids)
               values (true,'20000000-0000-0000-0000-00000000000c','20000000-0000-0000-0000-00000000000a','2026-03-01T12:00:00-04:00','{}')$$,
              'Somente o DEV', 'D10 Gestor não cria lançamento histórico');
select t_erro($$update pedidos_ensaio set observacoes='x' where id='40000000-0000-0000-0000-000000000121'$$,
              'somente o DEV', 'D11 Gestor não altera pedido histórico');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d', false);  -- DEV
update pedidos_ensaio set lancamento_historico = false where id = '40000000-0000-0000-0000-000000000121';
select t_ok((select lancamento_historico from pedidos_ensaio where id='40000000-0000-0000-0000-000000000121'),
            'D12 marcação histórica não pode ser removida');

-- ═════════════════════════════════════════════════════════════════════════════
-- E. Alterar número e excluir (DEV)
-- ═════════════════════════════════════════════════════════════════════════════
select t_erro($$select alterar_numero_pe('40000000-0000-0000-0000-000000000120', 350)$$, 'já existe', 'E1 alterar para número existente é recusado');
select alterar_numero_pe('40000000-0000-0000-0000-000000000120', 122);
select t_ok((select numero_pe='0122' and numero_os='2026.03.11.03.0122' from pedidos_ensaio where id='40000000-0000-0000-0000-000000000120'),
            'E2 PE e O.S. passam a terminar em 0122 (mesmo com O.S. finalizada)');
select t_ok((select numero_os='2026.03.11.03.0122' and observacao like '%N° 0122/2026%' from fichas_os where pedido_id='40000000-0000-0000-0000-000000000120'),
            'E3 FR-IMOB-04 atualizada (número e observação)');

select t_erro($$select excluir_pedido('40000000-0000-0000-0000-000000000120','0350')$$, 'não confere', 'E4 confirmação errada não exclui');
select excluir_pedido('40000000-0000-0000-0000-000000000120','PE-2026-0122');
select excluir_pedido('40000000-0000-0000-0000-000000000001','1');       -- pedido normal já finalizado
reset role;
select t_ok((select count(*)=0 from pedidos_ensaio where id in ('40000000-0000-0000-0000-000000000120','40000000-0000-0000-0000-000000000001')),
            'E5 pedidos excluídos (incluindo O.S. finalizada)');
select t_ok((select count(*)=0 from ensaios_os where pedido_id in ('40000000-0000-0000-0000-000000000120','40000000-0000-0000-0000-000000000001')), 'E6 ensaios da O.S. excluídos');
select t_ok((select count(*)=0 from resultados where pedido_id in ('40000000-0000-0000-0000-000000000120','40000000-0000-0000-0000-000000000001')), 'E7 resultados excluídos');
select t_ok((select count(*)=0 from resultado_marshall), 'E8 resultado_marshall excluído');
select t_ok((select count(*)=0 from fichas_os where pedido_id in ('40000000-0000-0000-0000-000000000120','40000000-0000-0000-0000-000000000001'))
        and (select count(*)=0 from fichas_solicitacao where pedido_id in ('40000000-0000-0000-0000-000000000120','40000000-0000-0000-0000-000000000001')),
            'E9 fichas FR-IMOB-04/05 excluídas');
select t_ok((select count(*)=2 from audit_log where acao='EXCLUSAO_PEDIDO' and usuario_id='20000000-0000-0000-0000-00000000000d'
                and jsonb_array_length(dados_antes->'ensaios_os')=1), 'E10 auditoria guarda cópia do que foi excluído');
select t_ok((select count(*)=3 from usuarios where nome like '%Lab%' or nome like 'Carlos%') and (select count(*)=1 from empresas),
            'E11 usuários e empresas intactos');
select t_ok((select ultimo = 351 from contadores_pedido where ano = 2026), 'E12 contador não volta após exclusão');

-- ═════════════════════════════════════════════════════════════════════════════
-- F. Número liberado pode ser reutilizado manualmente
-- ═════════════════════════════════════════════════════════════════════════════
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d', false);
insert into pedidos_ensaio (lancamento_historico, solicitante_id, laboratorista_id, created_at, sequencial, ensaios_ids)
values (true,'20000000-0000-0000-0000-00000000000c','20000000-0000-0000-0000-00000000000a','2026-01-15T12:00:00-04:00',1,'{}');
reset role;
select t_ok((select count(*)=1 from pedidos_ensaio where ano=2026 and sequencial=1), 'F1 número 0001 (excluído) relançado manualmente');
select t_ok((select count(*)=1 from pg_indexes where indexname='pedidos_ensaio_ano_seq_uq'), 'F2 índice único (ano, número) existe');

select 'TODOS OS TESTES PASSARAM' as resultado;
