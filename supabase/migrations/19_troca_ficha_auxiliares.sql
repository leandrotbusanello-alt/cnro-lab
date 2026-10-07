-- =============================================================================
-- CNRO Lab Control — Migração 19: troca de ficha e assistentes auxiliares
-- =============================================================================
-- Pré-requisito: migração 18. Rodar no SQL Editor. Idempotente, transação única.
--
--  1. Troca de ficha de um ensaio já iniciado (erro de 07/10/2026):
--     antes, a versão da ficha ficava "congelada" (ficha_modelo_id) e o assistente
--     continuava vendo a ficha antiga. Agora, quando o laboratorista troca a ficha:
--       • o congelamento é desfeito (o assistente abre a ficha nova);
--       • o preenchimento antigo sai; o cabeçalho digitado (material, procedência e
--         informações complementares) é aproveitado na ficha nova;
--       • as assinaturas saem;
--       • se o ensaio já tinha sido iniciado/enviado, ele volta ao assistente como
--         "Devolvido", com o motivo "Ficha trocada de X para Y".
--     A cópia do preenchimento antigo fica na auditoria (tg_auditoria).
--     Ensaio aprovado não pode ter a ficha trocada.
--  2. Assistentes auxiliares (ensaios feitos por duas pessoas):
--     ensaios_os.auxiliares_ids. Só o laboratorista responsável (ou Gestor/DEV)
--     inclui ou remove. O auxiliar vê o ensaio só para consulta; quem preenche e
--     assina continua sendo o executor (assistente_id). O ensaio conta para todos.
-- =============================================================================

begin;

alter table public.ensaios_os
  add column if not exists auxiliares_ids uuid[] not null default '{}';

create index if not exists ensaios_os_auxiliares_idx on public.ensaios_os using gin (auxiliares_ids);

-- Troca de ficha + auxiliares (roda depois do a30_ensaio_os_guard)
create or replace function public.tg_ensaio_os_ficha_aux()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_ped   public.pedidos_ensaio;
  v_resp  boolean;
  v_cab   jsonb;
  v_de    text;
  v_para  text;
  v_motivo text;
begin
  select * into v_ped from public.pedidos_ensaio where id = new.pedido_id;
  v_resp := auth.uid() is null or public.eh_gestor() or v_ped.laboratorista_id = public.usuario_atual_id();

  -- ── Auxiliares ────────────────────────────────────────────────────────────
  new.auxiliares_ids := coalesce(new.auxiliares_ids, '{}');
  if new.auxiliares_ids is distinct from old.auxiliares_ids then
    if not v_resp then
      raise exception 'Somente o laboratorista responsável pela O.S. pode incluir ou remover auxiliares.'
        using errcode = 'P0001';
    end if;
  end if;
  -- sem repetição e sem o próprio executor
  new.auxiliares_ids := array(
    select distinct x from unnest(new.auxiliares_ids) x
     where x is not null and x is distinct from new.assistente_id order by 1);

  -- ── Troca de ficha ────────────────────────────────────────────────────────
  if new.ficha_ensaio_id is distinct from old.ficha_ensaio_id and old.ficha_ensaio_id is not null then
    if old.status = 'aprovado' then
      raise exception 'Ensaio aprovado: a ficha não pode ser trocada.' using errcode = 'P0001';
    end if;

    -- cabeçalho DIGITADO na ficha antiga (material, procedência, informações complementares);
    -- o que veio do pedido sem alteração não precisa ser copiado (a ficha nova lê do pedido)
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_cab
      from jsonb_each(coalesce(old.dados_resultado->'cabecalho', '{}'::jsonb)) t(k, v)
     where k in ('material', 'procedencia', 'complemento')
       and nullif(trim(both '"' from v::text), '') is not null;

    new.ficha_modelo_id       := null;
    new.dados_resultado       := case when v_cab = '{}'::jsonb then '{}'::jsonb
                                      else jsonb_build_object('cabecalho', v_cab) end;
    new.assinatura_executor   := null;
    new.assinatura_calculista := null;
    new.rascunho_em           := null;
    new.arquivo_url           := null;

    if old.status in ('em_andamento', 'aguardando_revisao', 'devolvido') then
      select codigo into v_de   from public.fichas_ensaio where id = old.ficha_ensaio_id;
      select codigo into v_para from public.fichas_ensaio where id = new.ficha_ensaio_id;
      v_motivo := 'Ficha trocada de ' || coalesce(v_de, '?') || ' para ' || coalesce(v_para, '(sem ficha)') || '.';
      new.status           := 'devolvido';
      new.devolvido_em     := public._agora();
      new.devolvido_por_id := public.usuario_atual_id();
      new.devolvido_motivo := v_motivo;

      update public.pedidos_ensaio
         set historico = coalesce(historico, '[]'::jsonb)
                         || jsonb_build_array(public._evento('Ensaio devolvido ao assistente',
                              jsonb_build_object('ensaio', new.nome_ensaio, 'motivo', v_motivo)))
       where id = new.pedido_id;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists a40_ensaio_os_ficha_aux on public.ensaios_os;
create trigger a40_ensaio_os_ficha_aux
  before update on public.ensaios_os
  for each row execute function public.tg_ensaio_os_ficha_aux();

-- Lançamentos/correções já feitos: ensaios devolvidos com a ficha trocada antes desta
-- migração continuam com a versão antiga congelada. Libera esses casos (ficha do
-- modelo ≠ ficha do ensaio) para o assistente abrir a ficha certa.
update public.ensaios_os e
   set ficha_modelo_id = null,
       dados_resultado = '{}'::jsonb,
       rascunho_em = null
  from public.fichas_modelo m
 where m.id = e.ficha_modelo_id
   and m.ficha_ensaio_id is distinct from e.ficha_ensaio_id
   and e.status in ('pendente', 'em_andamento', 'devolvido');

notify pgrst, 'reload schema';

commit;

-- Fim da migração 19.
