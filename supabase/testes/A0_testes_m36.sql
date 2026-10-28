-- Testes da migração 36 (permissão "Pode lançar histórico")
-- Rodar como postgres num banco local com 00_base_supabase.sql + migrações até a 36 (sem dados de teste).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

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
-- d = DEV · a = Laura (LAB) · a1 = Ana (ASSIST) · c = Carlos (CAMPO) · ee = Gabi (GESTOR)
-- f1 = Paula (CAMPO, com permissão) · f2 = Rui (ASSIST, com permissão) · f3 = Téo (ASSIST, sem permissão)
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000d','dev@x'), ('00000000-0000-0000-0000-00000000000a','lab1@x'),
 ('00000000-0000-0000-0000-0000000000a1','assist1@x'), ('00000000-0000-0000-0000-00000000000c','campo@x'),
 ('00000000-0000-0000-0000-0000000000ee','gestor@x'), ('00000000-0000-0000-0000-0000000000f1','paula@x'),
 ('00000000-0000-0000-0000-0000000000f2','rui@x'), ('00000000-0000-0000-0000-0000000000f3','teo@x');
insert into public.empresas (id, nome, lote, rodovia) values ('10000000-0000-0000-0000-000000000001','Consórcio Alfa','Lote 3','BR-163');
insert into public.usuarios (id, auth_id, nome, perfil, email, assinatura_url, status) values
 ('20000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-00000000000d','Leandro DEV','DEV','dev@x', null,'Ativo'),
 ('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','Laura Lab','LAB','lab1@x','l1/a.png','Ativo'),
 ('20000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','Ana Assist','ASSIST','assist1@x','a1/a.png','Ativo'),
 ('20000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c','Carlos Campo','CAMPO','campo@x',null,'Ativo'),
 ('20000000-0000-0000-0000-0000000000ee','00000000-0000-0000-0000-0000000000ee','Gabi Gestor','GESTOR','gestor@x','g/a.png','Ativo'),
 ('20000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000f1','Paula Digita','CAMPO','paula@x',null,'Ativo'),
 ('20000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000f2','Rui Digita','ASSIST','rui@x','r/a.png','Ativo'),
 ('20000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000f3','Téo Assist','ASSIST','teo@x','t/a.png','Ativo');
insert into public.ensaios (id, nome, categoria, norma) values ('30000000-0000-0000-0000-000000000001','Marshall','asfalto','DNIT 043');

-- ═════════════════════════════════════════════════════════════════════════════
-- A. Ligar/desligar a permissão: só o DEV
-- ═════════════════════════════════════════════════════════════════════════════
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000ee', false);  -- Gestor
select t_erro($$update usuarios set pode_lancar_historico = true where id='20000000-0000-0000-0000-0000000000f1'$$,
              'Somente o DEV', 'A1 Gestor não libera a permissão');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f3', false);  -- Téo (próprio registro)
select t_erro($$update usuarios set pode_lancar_historico = true where id='20000000-0000-0000-0000-0000000000f3'$$,
              'Somente o DEV', 'A2 usuário não libera para si mesmo');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d', false);  -- DEV
update usuarios set pode_lancar_historico = true
 where id in ('20000000-0000-0000-0000-0000000000f1','20000000-0000-0000-0000-0000000000f2');
select t_ok((select count(*)=2 from usuarios where pode_lancar_historico), 'A3 DEV libera para Paula e Rui');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000ee', false);  -- Gestor
update usuarios set cargo = 'Digitadora' where id='20000000-0000-0000-0000-0000000000f1';
select t_ok((select pode_lancar_historico and cargo='Digitadora' from usuarios where id='20000000-0000-0000-0000-0000000000f1'),
            'A4 Gestor edita outros dados sem mexer na permissão');
reset role;

-- ═════════════════════════════════════════════════════════════════════════════
-- B. Paula (perfil CAMPO, com permissão): fluxo histórico completo
-- ═════════════════════════════════════════════════════════════════════════════
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f1', false);  -- Paula
insert into pedidos_ensaio (id, lancamento_historico, empresa_id, lote, material, sub_tipo, ensaios_ids, dados_amostra,
                            solicitante_id, laboratorista_id, created_at, sequencial)
values ('40000000-0000-0000-0000-000000000120', true, '10000000-0000-0000-0000-000000000001','Lote 3','asfalto','massa_asfaltica',
        array['30000000-0000-0000-0000-000000000001'],'[{"km":"20"}]',
        '20000000-0000-0000-0000-00000000000c','20000000-0000-0000-0000-00000000000a', '2026-03-10T12:00:00-04:00', 120);
select t_ok((select numero_pe='120' and lancamento_historico and lancado_por='20000000-0000-0000-0000-0000000000f1'
                    and solicitante_id='20000000-0000-0000-0000-00000000000c'
               from pedidos_ensaio where id='40000000-0000-0000-0000-000000000120'),
            'B1 Paula cria histórico com o nº do papel (120), em nome de Carlos');
select t_erro($$insert into pedidos_ensaio (empresa_id, ensaios_ids, solicitante_id, sequencial)
               values ('10000000-0000-0000-0000-000000000001', array['30000000-0000-0000-0000-000000000001'],
                       '20000000-0000-0000-0000-00000000000a', 500)$$,
              'row-level security', 'B2 pedido normal em nome de outra pessoa continua bloqueado');
insert into pedidos_ensaio (id, empresa_id, ensaios_ids, dados_amostra, solicitante_id, sequencial)
values ('40000000-0000-0000-0000-000000000501','10000000-0000-0000-0000-000000000001',
        array['30000000-0000-0000-0000-000000000001'],'[{"km":"1"}]','20000000-0000-0000-0000-0000000000f1', 777);
select t_ok((select sequencial <> 777 from pedidos_ensaio where id='40000000-0000-0000-0000-000000000501'),
            'B3 pedido normal da Paula: número manual ignorado (só no histórico)');

select assumir_pedido('40000000-0000-0000-0000-000000000120');
select t_ok((select status='em_analise' and laboratorista_id='20000000-0000-0000-0000-00000000000a'
               from pedidos_ensaio where id='40000000-0000-0000-0000-000000000120'), 'B4 assumir em nome da Laura');
select t_ok(public.usuario_atual_id() = '20000000-0000-0000-0000-0000000000f1', 'B5 representação não vaza');
select t_ok((select (previa_ficha_os('40000000-0000-0000-0000-000000000120')->>'data_solicitacao') = '2026-03-10'),
            'B6 prévia da FR-IMOB-04 liberada no histórico');
select gerar_os('40000000-0000-0000-0000-000000000120', '2026-03-11', null);
select t_ok((select numero_os like '2026.03.11.%.120' and aberto_por='20000000-0000-0000-0000-00000000000a'
               from pedidos_ensaio where id='40000000-0000-0000-0000-000000000120'), 'B7 O.S. aberta em nome da Laura');

update ensaios_os set assistente_id = '20000000-0000-0000-0000-0000000000a1',
       ficha_ensaio_id = (select id from fichas_ensaio order by codigo limit 1),
       data_atribuicao = '2026-03-11T12:00:00-04:00'
 where pedido_id = '40000000-0000-0000-0000-000000000120';
select t_ok((select assistente_id='20000000-0000-0000-0000-0000000000a1' from ensaios_os
              where pedido_id='40000000-0000-0000-0000-000000000120'), 'B8 Paula atribui o executor (update direto)');
select adicionar_historico('40000000-0000-0000-0000-000000000120', '{"acao":"Ensaio atribuído","ensaio":"Marshall"}');

select iniciar_ensaio(id) from ensaios_os where pedido_id = '40000000-0000-0000-0000-000000000120';
select salvar_rascunho_ensaio(id, '{"x":2}') from ensaios_os where pedido_id = '40000000-0000-0000-0000-000000000120';
select enviar_para_revisao(id, '{"x":2}', '2026-03-12T12:00:00-04:00') from ensaios_os where pedido_id = '40000000-0000-0000-0000-000000000120';
select t_ok((select status='aguardando_revisao' and assinatura_executor->>'nome' = 'Ana Assist'
               from ensaios_os where pedido_id='40000000-0000-0000-0000-000000000120'), 'B9 execução com a assinatura da Ana');
select salvar_revisao_ensaio(id, '{"x":3}') from ensaios_os where pedido_id = '40000000-0000-0000-0000-000000000120';
select aprovar_ensaio(id, '{"x":3}', '[]', 'Conforme', null, false, '2026-03-13T12:00:00-04:00')
  from ensaios_os where pedido_id = '40000000-0000-0000-0000-000000000120';
select t_ok((select status='aprovado' and aprovado_por_id='20000000-0000-0000-0000-00000000000a'
                    and assinatura_calculista->>'nome'='Laura Lab'
               from ensaios_os where pedido_id='40000000-0000-0000-0000-000000000120'), 'B10 aprovado com a assinatura da Laura');
select t_ok((select count(*)=1 from resultados where pedido_id='40000000-0000-0000-0000-000000000120'),
            'B11 Paula lê o resultado do histórico');
select finalizar_os('40000000-0000-0000-0000-000000000120', '2026-03-14T12:00:00-04:00');
select t_ok((select status='concluido' and finalizado_por='20000000-0000-0000-0000-00000000000a'
               from pedidos_ensaio where id='40000000-0000-0000-0000-000000000120'), 'B12 finalizado em nome da Laura');

-- ações que continuam só do DEV
select t_erro($$select reabrir_os('40000000-0000-0000-0000-000000000120', 'teste')$$, 'somente o DEV', 'B13 Paula não reabre O.S. histórica');
select t_erro($$select excluir_pedido('40000000-0000-0000-0000-000000000120','120')$$, 'Somente o DEV', 'B14 Paula não exclui');
select t_erro($$select alterar_numero_pe('40000000-0000-0000-0000-000000000120', 121)$$, 'Somente o DEV', 'B15 Paula não altera nº');
reset role;
select t_ok((select count(*) > 0 and bool_and(usuario_id='20000000-0000-0000-0000-0000000000f1')
               from audit_log where em_nome_de is not null), 'B16 auditoria: Paula é a autora real, com "em nome de"');
select t_ok((select bool_and(e->>'lancado_por' = 'Paula Digita')
               from pedidos_ensaio p, jsonb_array_elements(p.historico) e
              where p.id='40000000-0000-0000-0000-000000000120'), 'B17 histórico marca "lançado por Paula Digita"');

-- ═════════════════════════════════════════════════════════════════════════════
-- C. Visibilidade e bloqueios
-- ═════════════════════════════════════════════════════════════════════════════
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f2', false);  -- Rui (permissão)
select t_ok((select count(*)=1 from pedidos_ensaio where lancamento_historico), 'C1 Rui vê o histórico lançado pela Paula');
select t_ok((select count(*)=1 from ensaios_os e join pedidos_ensaio p on p.id=e.pedido_id where p.lancamento_historico),
            'C2 Rui vê os ensaios do histórico');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);  -- Carlos (CAMPO, sem permissão)
select t_ok((select count(*)=0 from pedidos_ensaio where id='40000000-0000-0000-0000-000000000501'),
            'C3 Campo sem permissão não vê pedidos de outras pessoas');
select t_erro($$insert into pedidos_ensaio (lancamento_historico, solicitante_id, laboratorista_id, created_at, ensaios_ids)
               values (true,'20000000-0000-0000-0000-00000000000c','20000000-0000-0000-0000-00000000000a', now(), '{}')$$,
              'pode criar lançamentos históricos', 'C4 Campo sem permissão não cria histórico');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f3', false);  -- Téo (ASSIST, sem permissão)
select t_erro($$insert into pedidos_ensaio (lancamento_historico, solicitante_id, laboratorista_id, created_at, ensaios_ids)
               values (true,'20000000-0000-0000-0000-00000000000c','20000000-0000-0000-0000-00000000000a', now(), '{}')$$,
              'pode criar lançamentos históricos', 'C5 Assistente sem permissão não cria histórico');
select t_ok(public.usuario_atual_id() = '20000000-0000-0000-0000-0000000000f3', 'C6 sem permissão não se passa por outra pessoa');

-- DEV reabre; Paula corrige e finaliza de novo
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d', false);  -- DEV
select reabrir_os('40000000-0000-0000-0000-000000000120', 'correção de digitação');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f1', false);  -- Paula
select t_ok((select status in ('em_andamento','aguardando_revisao') from pedidos_ensaio
              where id='40000000-0000-0000-0000-000000000120'), 'C7 DEV reabriu');
select finalizar_os('40000000-0000-0000-0000-000000000120', '2026-03-15T12:00:00-04:00');
select t_ok((select status='concluido' from pedidos_ensaio where id='40000000-0000-0000-0000-000000000120'),
            'C8 Paula finaliza de novo a O.S. reaberta pelo DEV');

-- Permissão desligada: perde o acesso
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d', false);  -- DEV
update usuarios set pode_lancar_historico = false where id = '20000000-0000-0000-0000-0000000000f1';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f1', false);  -- Paula
select t_ok((select count(*)=0 from pedidos_ensaio where lancamento_historico), 'C9 sem a permissão, Paula não vê mais o histórico');
select t_erro($$insert into pedidos_ensaio (lancamento_historico, solicitante_id, laboratorista_id, created_at, ensaios_ids)
               values (true,'20000000-0000-0000-0000-00000000000c','20000000-0000-0000-0000-00000000000a', now(), '{}')$$,
              'pode criar lançamentos históricos', 'C10 sem a permissão, Paula não cria histórico');
reset role;
select 'TODOS OS TESTES DA MIGRAÇÃO 36 PASSARAM' as resultado;
