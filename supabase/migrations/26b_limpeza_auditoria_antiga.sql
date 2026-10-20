-- =============================================================================
-- CNRO Lab Control — 26b (OPCIONAL): enxugar a auditoria já gravada
-- =============================================================================
-- Pré-requisito: migração 26. Rodar UMA vez no SQL Editor, depois dela.
-- Aplica às linhas antigas da auditoria as mesmas regras que a migração 26 passou a usar:
--   • apaga os registros de salvamento automático do rascunho (ensaios_os, status em
--     andamento, só dados_resultado/rascunho_em mudaram);
--   • apaga os registros de "linha nova no histórico do pedido" (só historico/updated_at);
--   • nos demais UPDATEs, deixa só as colunas que mudaram (antes/depois).
-- INSERTs, DELETEs e exclusões de pedido (cópias completas) não são tocados.
-- Nenhum dado do sistema é alterado — só a tabela audit_log.
--
-- Depois de rodar, para o espaço voltar de fato ao banco, rode SOZINHO, numa consulta nova:
--     vacuum full public.audit_log;
-- =============================================================================

begin;

-- 1. Rascunhos
delete from public.audit_log a
 where a.tabela = 'ensaios_os' and a.acao = 'UPDATE'
   and a.dados_antes ? 'status' and a.dados_depois ? 'status'      -- linha no formato antigo (completa)
   and a.dados_antes->>'status' = 'em_andamento'
   and a.dados_depois->>'status' = 'em_andamento'
   and (a.dados_depois->'rascunho_em') is distinct from (a.dados_antes->'rascunho_em')
   and (a.dados_depois - array['dados_resultado','rascunho_em','updated_at'])
     = (a.dados_antes  - array['dados_resultado','rascunho_em','updated_at']);

-- 2 e 3. Demais UPDATEs no formato antigo: só o que mudou; sem mudança real → apaga
with dif as (
  select a.id,
         (select jsonb_object_agg(n.key, a.dados_antes->n.key)
            from jsonb_each(a.dados_depois) n
           where n.key not in ('updated_at', 'historico')
             and n.value is distinct from a.dados_antes->n.key) as antes,
         (select jsonb_object_agg(n.key, n.value)
            from jsonb_each(a.dados_depois) n
           where n.key not in ('updated_at', 'historico')
             and n.value is distinct from a.dados_antes->n.key) as depois
    from public.audit_log a
   where a.acao = 'UPDATE'
     and a.dados_antes ? 'id' and a.dados_depois ? 'id'           -- formato antigo (completo)
)
, apagar as (
  delete from public.audit_log a using dif
   where a.id = dif.id and dif.depois is null
  returning a.id
)
update public.audit_log a
   set dados_antes = dif.antes, dados_depois = dif.depois
  from dif
 where a.id = dif.id and dif.depois is not null;

commit;

-- Conferência: select * from public.painel_uso_banco();
