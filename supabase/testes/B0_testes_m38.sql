-- Testes da migração 38 (ficha padrão, observação resumida, FR-IMOB-05, resumo da O.S.)
-- Banco local: 00_base_supabase.sql + migrações com 40_catalogo_real.sql antes da 15 + até a 38.
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

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','lab1@x'), ('00000000-0000-0000-0000-00000000000b','lab2@x'),
 ('00000000-0000-0000-0000-00000000000c','campo@x'), ('00000000-0000-0000-0000-0000000000c2','campo2@x');
insert into public.empresas (id, nome, lote, rodovia) values ('10000000-0000-0000-0000-000000000001','Consórcio Alfa','03','BR-163');
insert into public.usuarios (id, auth_id, nome, perfil, email, assinatura_url, status) values
 ('20000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','Laura Lab','LAB','lab1@x','l1/a.png','Ativo'),
 ('20000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b','Lucas Lab','LAB','lab2@x','l2/a.png','Ativo'),
 ('20000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000c','Carlos Campo','CAMPO','campo@x',null,'Ativo'),
 ('20000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000c2','Clara Campo','CAMPO','campo2@x',null,'Ativo');

-- ═════ A. Pedido de jazida com 5 pontos → observação resumida, FR-05 preenchida, ficha padrão ═════
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);  -- Campo
insert into pedidos_ensaio (id, empresa_id, lote, material, sub_tipo, ensaios_ids, dados_amostra, solicitante_id)
values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','03','solos','jazida',
        array[(select id::text from ensaios where codigo_frimob04='ens_granulometria'),
              (select id::text from ensaios where codigo_frimob04='ens_compactacao_nt')],
        '[{"jazida":"JAZIDA VAL DA MERI","km_coleta":"120","data_coleta":"2026-02-10"},
          {"jazida":"JAZIDA VAL DA MERI","km_coleta":"135+500","data_coleta":"2026-02-10"},
          {"jazida":"JAZIDA VAL DA MERI","km_coleta":"128","data_coleta":"2026-02-10"},
          {"jazida":"JAZIDA VAL DA MERI","km_coleta":"125,3","data_coleta":"2026-02-10"},
          {"jazida":"JAZIDA VAL DA MERI","km_coleta":"131","data_coleta":"2026-02-10"}]',
        '20000000-0000-0000-0000-00000000000c');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);  -- Laura
select assumir_pedido('40000000-0000-0000-0000-000000000001');
-- FR-IMOB-05 salva ANTES de gerar a O.S. (caso que deixava a observação vazia)
select salvar_ficha_solicitacao('40000000-0000-0000-0000-000000000001', '{"lote":"03"}');
select t_ok((select observacao like 'FORAM ENTREGUES AO LABORATÓRIO 05 AMOSTRAS DE SOLO DA JAZIDA%'
               from fichas_solicitacao where pedido_id='40000000-0000-0000-0000-000000000001'),
            'A1 FR-05 salva antes da O.S. já tem a observação');
select gerar_os('40000000-0000-0000-0000-000000000001', null, '03');
select t_ok((select observacao like '%DO KM 120,000 AO KM 135,500%' and observacao not like '%KM 128%'
               from fichas_os where pedido_id='40000000-0000-0000-0000-000000000001'),
            'A2 FR-04: 5 pontos viram "DO KM 120,000 AO KM 135,500"');
select t_ok((select observacao = (select observacao from fichas_os where pedido_id='40000000-0000-0000-0000-000000000001')
               from fichas_solicitacao where pedido_id='40000000-0000-0000-0000-000000000001'),
            'A3 FR-05 com o mesmo texto da FR-04');
select t_ok((select string_agg(f.codigo, ',' order by f.codigo) = 'FR-IMOB-34,FR-IMOB-55'
               from ensaios_os e join fichas_ensaio f on f.id = e.ficha_ensaio_id
              where e.pedido_id='40000000-0000-0000-0000-000000000001'), 'A4 O.S. já nasce com as fichas padrão (34 e 55)');
insert into ensaios_os (pedido_id, ensaio_id, nome_ensaio, status)
select '40000000-0000-0000-0000-000000000001', id, nome, 'pendente' from ensaios where codigo_frimob04='ens_equiv_areia';
select t_ok((select f.codigo='FR-IMOB-08' from ensaios_os e join fichas_ensaio f on f.id=e.ficha_ensaio_id
              join ensaios x on x.id=e.ensaio_id where e.pedido_id='40000000-0000-0000-0000-000000000001' and x.codigo_frimob04='ens_equiv_areia'),
            'A5 "+ Adicionar ensaio" já vem com a ficha padrão (FR-08)');
select t_ok((select observacao like '%FOI%' or observacao like '%FORAM%' from fichas_os where pedido_id='40000000-0000-0000-0000-000000000001'),
            'A6 observação apagada volta ao padrão');
update fichas_os set observacao = '' where pedido_id='40000000-0000-0000-0000-000000000001';
select t_ok((select observacao like 'FORAM ENTREGUES%' from fichas_os where pedido_id='40000000-0000-0000-0000-000000000001'),
            'A7 FR-04 com observação vazia recebe o texto padrão');
update fichas_os set observacao = 'TEXTO DO LABORATORISTA' where pedido_id='40000000-0000-0000-0000-000000000001';
select t_ok((select observacao = 'TEXTO DO LABORATORISTA' from fichas_os where pedido_id='40000000-0000-0000-0000-000000000001'),
            'A8 texto editado pelo laboratorista é mantido');

-- ═════ B. Ficha padrão dependente do material ═════
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);
insert into pedidos_ensaio (id, empresa_id, lote, material, sub_tipo, ensaios_ids, dados_amostra, solicitante_id)
values ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','03','solos','cps_solo_cimento',
        array[(select id::text from ensaios where codigo_frimob04='ens_compressao_axial')],
        '[{"identificacao_cp":"7","data_moldagem":"2026-02-01"},{"identificacao_cp":"9","data_moldagem":"2026-02-03"},
          {"identificacao_cp":"15","data_moldagem":"2026-02-05"},{"identificacao_cp":"21","data_moldagem":"2026-02-05"}]',
        '20000000-0000-0000-0000-00000000000c');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);
select assumir_pedido('40000000-0000-0000-0000-000000000002');
select gerar_os('40000000-0000-0000-0000-000000000002', null, '03');
select t_ok((select f.codigo='FR-IMOB-33' from ensaios_os e join fichas_ensaio f on f.id=e.ficha_ensaio_id
              where e.pedido_id='40000000-0000-0000-0000-000000000002'), 'B1 compressão axial de solo-cimento → FR-IMOB-33');
select t_ok((select observacao like 'FORAM ENTREGUES AO LABORATÓRIO 04 CORPOS DE PROVA DE SOLO-CIMENTO.%'
                    and observacao like '%MOLDAGEM FEITA ENTRE OS DIAS 01/02/2026 E 05/02/2026%'
               from fichas_os where pedido_id='40000000-0000-0000-0000-000000000002'),
            'B2 CPs fora de sequência não são listados; moldagem como período');

-- ═════ C. Resumo da O.S. para o Campo ═════
insert into os_resumos (pedido_id, caminho, nome, tipo, tamanho, enviado_por)
values ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001/resumo.png', 'resumo.png', 'image/png', 1000,
        '20000000-0000-0000-0000-00000000000a');
select t_ok((select count(*)=1 from os_resumos), 'C1 laboratorista responsável anexa o resumo');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b', false);  -- Lucas (não é o responsável)
select t_erro($$insert into os_resumos (pedido_id, caminho) values ('40000000-0000-0000-0000-000000000002','x/y.png')$$,
              'row-level security', 'C2 outro laboratorista não anexa');
select t_ok((select count(*)=1 from os_resumos), 'C3 equipe do laboratório vê o resumo');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);  -- Carlos (solicitante)
select t_ok((select count(*)=0 from os_resumos), 'C4 solicitante não vê antes de algum ensaio ser liberado');
reset role;
select set_config('request.jwt.claim.sub','', false);  -- manutenção (SQL Editor)
update ensaios_os set status='aprovado', visivel_campo=true
 where pedido_id='40000000-0000-0000-0000-000000000001' and id = (select id from ensaios_os where pedido_id='40000000-0000-0000-0000-000000000001' limit 1);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);
select t_ok((select count(*)=1 from os_resumos), 'C5 solicitante vê depois que um ensaio é liberado');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c2', false);  -- Clara (outro usuário do Campo)
select t_ok((select count(*)=0 from os_resumos), 'C6 outro usuário do Campo não vê');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);
delete from os_resumos where pedido_id='40000000-0000-0000-0000-000000000001';
select t_ok((select count(*)=0 from os_resumos), 'C7 laboratorista responsável exclui o resumo');
reset role;
select 'TODOS OS TESTES DA MIGRAÇÃO 38 PASSARAM' as resultado;
