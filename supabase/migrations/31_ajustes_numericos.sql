-- ─────────────────────────────────────────────────────────────────────────────
-- CNRO Lab — Entrega 32 (20/10/2026): correções da revisão gravadas como texto.
--
-- Quando a célula calculada mostrava "-" (ex.: FR-IMOB-21, peneira que o traço não tem)
-- e o laboratorista digitava um valor por cima, o valor era gravado como TEXTO ("28,80").
-- A tabela mostrava o número, mas o gráfico não desenhava o ponto.
-- O app novo grava como número; este SQL converte as correções já gravadas.
--
-- Converte só textos que são números no formato brasileiro (ex.: "28,80", "7", "-1,5"),
-- em `dados_resultado.ajustes` e na mesma célula de `dados_resultado.calculados`.
-- Rodar no SQL Editor, BLOCO A BLOCO, nesta ordem. Pode rodar de novo sem problema.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) CONFERIR (só leitura): o que vai mudar
select p.numero_os, eo.nome_ensaio, a.key as celula, a.value as valor_texto,
       replace(a.value #>> '{}', ',', '.')::numeric as vira_numero
from public.ensaios_os eo
join public.pedidos_ensaio p on p.id = eo.pedido_id,
     jsonb_each(coalesce(eo.dados_resultado->'ajustes', '{}'::jsonb)) a
where jsonb_typeof(a.value) = 'string'
  and a.value #>> '{}' ~ '^-?[0-9]+(,[0-9]+)?$'
order by 1, 2, 3;

-- 2) CORRIGIR
with alvo as (
  select eo.id,
         (select jsonb_object_agg(e.key,
                   case when jsonb_typeof(e.value) = 'string' and e.value #>> '{}' ~ '^-?[0-9]+(,[0-9]+)?$'
                        then to_jsonb(replace(e.value #>> '{}', ',', '.')::numeric)
                        else e.value end)
            from jsonb_each(eo.dados_resultado->'ajustes') e) as ajustes,
         (select coalesce(jsonb_object_agg(e.key, to_jsonb(replace(e.value #>> '{}', ',', '.')::numeric)), '{}'::jsonb)
            from jsonb_each(eo.dados_resultado->'ajustes') e
           where jsonb_typeof(e.value) = 'string' and e.value #>> '{}' ~ '^-?[0-9]+(,[0-9]+)?$') as numeros
    from public.ensaios_os eo
   where exists (select 1 from jsonb_each(coalesce(eo.dados_resultado->'ajustes', '{}'::jsonb)) e
                  where jsonb_typeof(e.value) = 'string' and e.value #>> '{}' ~ '^-?[0-9]+(,[0-9]+)?$')
)
update public.ensaios_os eo
   set dados_resultado = case
         when jsonb_typeof(eo.dados_resultado->'calculados') = 'object'
           then jsonb_set(jsonb_set(eo.dados_resultado, '{ajustes}', alvo.ajustes),
                          '{calculados}', (eo.dados_resultado->'calculados') || alvo.numeros)
         else jsonb_set(eo.dados_resultado, '{ajustes}', alvo.ajustes)
       end
  from alvo
 where eo.id = alvo.id;

-- 3) CONFERIR DE NOVO: não deve retornar nada
select p.numero_os, eo.nome_ensaio, a.key as celula, a.value
from public.ensaios_os eo
join public.pedidos_ensaio p on p.id = eo.pedido_id,
     jsonb_each(coalesce(eo.dados_resultado->'ajustes', '{}'::jsonb)) a
where jsonb_typeof(a.value) = 'string'
  and a.value #>> '{}' ~ '^-?[0-9]+(,[0-9]+)?$';
