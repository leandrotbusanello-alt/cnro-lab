# Campo v2 (design novo) + Migração 15

Entrega de 25/09/2026. O design do Campo feito em 25/09 (commit `492d73d`) foi mantido.
O que ele gravava errado foi corrigido, e o que ele tinha desfeito foi restaurado.

## Como aplicar (nesta ordem)
1. **Banco:** no SQL Editor do Supabase, rode `supabase/migrations/15_campo_frimob04_certificados.sql`.
   Pode rodar mais de uma vez.
2. **App:** extraia o zip na pasta do projeto, substituindo os arquivos, e rode:
   `git add -A` → `git commit -m "feat: Campo v2 + migracao 15"` → `git push`

## Migração 15
- `ensaios.codigo_frimob04`: liga 29 ensaios do catálogo aos itens da FR-IMOB-04.
- Desativa os 22 ensaios do cadastro antigo (não apaga).
- `pedidos_ensaio.especificacoes`: itens de "Especificação" marcados no Campo.
- A FR-IMOB-04 já nasce com as especificações e os ensaios do pedido marcados.
  O laboratorista pode ajustar depois.
- Bucket privado `certificados`: o certificado do ligante pode ser lido por quem enviou e pela equipe do laboratório.

## Campo v2
- **Mantido:** o layout em 6 seções, o tipo de solicitação, as listas no padrão FR-IMOB-04,
  as informações gerais, as abas de amostras com herança e o visual novo de "Meus pedidos".
- **Corrigido:**
  - os ensaios gravam o id do catálogo, e o Laboratório monta a O.S. com eles;
  - o material é gravado em `material`;
  - as informações gerais vão para dentro de cada amostra, com os nomes que o Laboratório e as fichas leem;
  - o certificado vai para o local privado (`certificados/…`) e aparece no Laboratório como
    "📎 Abrir certificado". O anexo precisa de internet.
- **Removido:** a coluna `cnpj`, a busca `empresa:empresas(nome)`, a gravação em `tipo_amostra`,
  os status antigos e o reenvio que inseria o pedido direto (risco de duplicar).
- **Restaurado:**
  - o `authStore.js` correto (login, senha e menu);
  - a fila offline;
  - o lançamento histórico (DEV);
  - o filtro vindo do Painel;
  - os lançamentos históricos escondidos da lista do Campo.

## Testes
- Banco: migração 15 aplicada duas vezes; `supabase/testes/50_testes_m15.sql`
  (FR-IMOB-04 marcada, O.S. com os ensaios, FR-IMOB-05, permissões do certificado); os 60 testes da migração 14 continuam ok.
- Navegador:
  - pedido do Campo pelo formulário novo;
  - O.S. gerada pelo Laboratório com os ensaios e a FR-IMOB-04 marcada;
  - lançamento histórico de ligante com certificado;
  - pedido devolvido → corrigido (reabre com tudo preenchido);
  - filtro do Painel;
  - build ok.

⚠️ Chats de módulo: sempre partam do código atual do GitHub. Um chat que trabalha com arquivos antigos desfaz o que já estava pronto.
