# Migração 14: excluir pedido, número manual e lançamento histórico

Entrega de 25/09/2026. Tudo é **somente para o perfil DEV**. Para os demais usuários o sistema continua igual.

## 1. Como aplicar (nesta ordem)

1. **Banco:** no Supabase, abra o SQL Editor, cole todo o arquivo
   `supabase/migrations/14_exclusao_numeracao_historico.sql` e clique em **Run**.
   - O arquivo roda numa única transação: se der erro, nada é aplicado.
   - Pode ser rodado mais de uma vez sem problema.
   - Se aparecer o aviso *"(ano, sequencial) duplicados: índice único NÃO criado"*,
     exclua os pedidos de teste (item 3) e rode o arquivo de novo.
2. **App:** copie os arquivos do pacote para a pasta do projeto, substituindo os existentes, e rode:
   ```bash
   git add -A
   git commit -m "feat: excluir pedido, numero manual e lancamento historico (migracao 14)"
   git push
   ```
   A Vercel publica sozinha em 1 ou 2 minutos.
3. **Ordem importa:** rode o SQL **antes** do `git push`. O app novo consulta
   colunas que só passam a existir depois da migração.

## 2. O que mudou

### Excluir pedido (DEV)
- Botão **🗑 Excluir pedido** no detalhe do pedido (Laboratório). Vale para qualquer status,
  inclusive O.S. finalizada.
- Para confirmar, é preciso digitar o número do PE (ex.: `PE-2026-0047`).
- Apaga o pedido, os ensaios da O.S., os resultados (`resultados` + `resultado_*`) e as fichas
  FR-IMOB-04/05. Usuários, empresas e catálogo **não** são alterados.
- Uma cópia completa do que foi apagado fica em `audit_log` (`acao = 'EXCLUSAO_PEDIDO'`).
- O contador não volta. O número excluído fica livre para ser lançado de novo manualmente.

### Número do PE manual (DEV)
- No lançamento histórico, campo **Nº do PE (papel)**. Em branco, o número é automático.
- **Regra do contador:** passa a ser sempre o **maior** número já usado no ano.
  - Lançou o 0350 → o próximo pedido do Campo é o 0351.
  - Depois lançou o 0120 → o contador continua em 351.
- O sistema recusa números que já existem no ano.
- Botão **# Alterar nº** no detalhe: corrige o número do PE. O número da O.S. termina
  com o mesmo sequencial, então também é atualizado (e a observação das fichas junto).
  Esse ajuste também sobe o contador se o número novo for maior.

### Lançamento histórico (DEV)
Serve para lançar os ensaios antigos (papel) passando pelo fluxo completo, em nome de quem fez de verdade.

| Etapa | Onde | O que o DEV informa |
|---|---|---|
| Pedido | Campo → Novo Pedido → marcar **📜 Lançamento histórico** | Data da solicitação, nº do PE, solicitante e laboratorista |
| O.S. | Laboratório → Validar e gerar O.S. | Data da O.S. (papel) |
| Atribuição | Laboratório → Ensaios da O.S. | Ficha e executor (aparecem também usuários inativos) |
| Execução | Assistente → card "📜 Histórico · <executor>" | Preenche, assina (em nome do executor) e informa a **data da execução** ao enviar |
| Aprovação | Laboratório → Revisar | **Data da aprovação**, conformidade e assinatura (em nome do laboratorista) |
| Finalização | Laboratório → Finalizar O.S. | **Data da finalização** |

Regras:
- O banco age em nome do laboratorista do pedido e do executor de cada ensaio.
  As assinaturas e os nomes nas fichas são os deles.
- Todo evento do histórico mostra **"📜 Lançado por <DEV> em <data real>"**. A auditoria
  (`audit_log`) grava o DEV como autor (`usuario_id`) e a pessoa representada em `em_nome_de`.
  **Nada disso aparece nas fichas impressas.**
- Só o DEV vê e altera pedidos históricos. Laboratoristas e assistentes não os veem nas
  filas, e o banco recusa qualquer alteração vinda deles.
- Uma vez marcado como histórico, o pedido não pode ser desmarcado.
- O lançamento histórico só funciona com internet.
- O banco recusa datas futuras e datas fora de ordem (ex.: O.S. antes do pedido).
- Para o Painel: filtre por `pedidos_ensaio.lancamento_historico = true`. As datas reais
  estão em `resultados.data_execucao` e `resultados.data_revisao`.

### Correção de bug (Módulo Assistente)
A ficha podia abrir **em branco** quando a lista de ensaios recarregava logo depois da tela
abrir (atualização em tempo real ou volta do foco à janela).
Arquivo: `src/modules/assistente/components/ExecucaoEnsaio.jsx`.

## 3. Roteiro para começar

1. Aplique a migração e publique o app (item 1).
2. **Limpe os testes:** abra cada pedido de teste no Laboratório → 🗑 Excluir pedido.
   - A aba "Todas" mostra os pedidos em aberto e os concluídos há até 90 dias.
3. Rode o SQL da migração 14 **de novo**, para criar o índice único caso ele não tenha sido criado.
4. **Antes de liberar o Campo:** lance como histórico o **último** pedido em papel, com o número dele.
   Assim o contador passa a valer a partir desse número.
5. Libere o Campo e vá lançando o restante do histórico, em qualquer ordem.

## 4. Testes feitos antes da entrega
- **Banco:** 60 verificações num PostgreSQL 16 com o esquema de 25/09 e as migrações 10–13b.
  Cobrem o fluxo normal (sem mudanças), o lançamento histórico completo, a numeração, a
  exclusão e 12 tentativas indevidas por perfis que não são DEV
  (`supabase/testes/20_testes_m14.sql`).
- **Navegador:** fluxo completo pelo app (Campo → O.S. → Assistente → revisão → finalização),
  com datas e assinaturas conferidas no banco. Também conferido:
  - o laboratorista e o assistente reais não veem o lançamento;
  - Alterar nº e Excluir funcionam pela tela;
  - um pedido normal do Campo continua funcionando;
  - o build do Vite passa.
