# Entrega 37: permissão "Pode lançar histórico" (28/10/2026)

Feita sobre a Entrega 36 (inclui os arquivos dela). **Rodar a migração 36** no SQL Editor.

## Para que serve
Antes, só o DEV fazia lançamento histórico (ensaios antigos em papel). Agora o DEV pode liberar isso
para pessoas escolhidas, cada uma com o próprio login. A auditoria passa a mostrar **quem digitou de verdade**.

## Regras (decididas em 28/10)
| Tema | Regra |
|---|---|
| Quem liga/desliga | Só o DEV (Gestor → Usuários → editar → **📜 Pode lançar histórico**). O banco recusa qualquer outro. |
| O que a pessoa faz | Fluxo histórico completo: criar o pedido (com o **nº original do PE**), O.S., execução, revisão, aprovação e finalização, em nome das pessoas reais, com as assinaturas delas |
| O que a pessoa vê | **Todos** os pedidos históricos |
| Só do DEV | Excluir pedido, Alterar nº, Reabrir O.S. histórica finalizada |
| Depois que o DEV reabre | Quem tem a permissão corrige e finaliza de novo |
| Módulos | A permissão abre **Campo, Lab e Assistente** no menu. No módulo que não é do perfil dela, a pessoa vê só os históricos |
| Trabalho normal | Não muda (pedidos não históricos seguem o perfil e os módulos de sempre) |
| Registro | Histórico do pedido: "Lançado por <pessoa>". Auditoria: `usuario_id` = quem digitou, `em_nome_de` = pessoa representada |

## Banco — `36_lancador_historico.sql`
- `usuarios.pode_lancar_historico` (padrão `false`) e gatilho `a32_usuario_lancador_guard`: só o DEV altera.
- `eh_lancador_historico()` = DEV **ou** permissão ligada (sempre o usuário logado, nunca o representado).
- "Somente o DEV" → "DEV ou quem tem a permissão" em: `usuario_atual_id` (representação), `_representar`,
  `tg_pedido_historico`, `tg_pedido_numero_pe` (nº manual só no pedido histórico), `tg_ensaio_os_guard`,
  `_reaberta_editavel`, `_pode_editar_fichas` (fichas FR-IMOB-04/05) e `previa_ficha_os`.
- Continuam com `eh_dev_real()`: `excluir_pedido`, `alterar_numero_pe`, `reabrir_os` (histórico).
- RLS: pedidos históricos (ler, criar, alterar), ensaios da O.S. (ler, incluir, alterar, remover),
  `resultados` (ler) e assinaturas (ler) liberados para quem tem a permissão.
- Testes: `supabase/testes/A0_testes_m36.sql`, 33 verificações, todas ok.

## App
- `lib/historico.js`: `podeLancarHistorico(perfil)`, `soHistoricoNoModulo(perfil, modulo)`.
- `authStore`: `perfil.modulos_menu` (menu com Campo/Lab/Assistente quando a permissão está ligada);
  a verificação de 1 minuto também percebe quando o DEV liga/desliga a permissão.
- Campo: seção "📜 Lançamento histórico" para quem tem a permissão (sem o módulo Campo, já vem marcada).
- Laboratório: carrega os históricos; sem o módulo Laboratório, só eles. Selo e aviso do pedido com o texto novo.
  Impressão da revisão liberada no histórico.
- Assistente: ensaios históricos de qualquer executor; sem o módulo Assistente, só eles
  (e sem o aviso de "você não tem assinatura": vale a do executor real).
- Gestor: caixa **📜 Pode lançar histórico** (só aparece para o DEV) e selo "📜 Histórico" na lista de usuários.

## Testado no navegador (PostgREST local)
Usuária CAMPO com a permissão: menu Campo/Lab/Assistente; no Lab vê só o pedido histórico (não o normal do Campo);
gera a O.S. em nome da laboratorista; atribui o executor; o ensaio aparece no Assistente como "Histórico · executor".
Laboratorista sem a permissão não vê o histórico. Assistente com a permissão vê só os históricos no Lab.
DEV liga a permissão no cadastro; Gestor não vê a caixa. "Sair" chama `logout?scope=local`.

## Como aplicar
1. Rodar `supabase/migrations/36_lancador_historico.sql` no SQL Editor (idempotente).
2. Publicar o app (commit/push → Vercel).
3. Gestor → Usuários → editar a pessoa → marcar **📜 Pode lançar histórico** → Salvar (logado como DEV).
   A pessoa vê os módulos novos em até 1 minuto (ou ao entrar de novo).
4. Conferência: `select nome, perfil from usuarios where pode_lancar_historico;`

## Arquivos
- `supabase/migrations/36_lancador_historico.sql` (novo)
- `supabase/testes/A0_testes_m36.sql` (novo)
- `src/lib/historico.js`, `src/store/authStore.js`, `src/components/layout/AppLayout.jsx`
- `src/modules/campo/useCampo.js`, `src/modules/campo/components/NovoPedidoForm.jsx`
- `src/modules/laboratorio/useLaboratorio.js`, `src/modules/laboratorio/labRepo.js`,
  `src/modules/laboratorio/components/PedidoDetalhe.jsx`, `PedidoCard.jsx`, `RevisaoFicha.jsx`
- `src/modules/assistente/assistenteRepo.js`, `src/modules/assistente/components/FilaAssistente.jsx`
- `src/modules/gestor/gestorRepo.js`, `src/modules/gestor/components/ModalUsuario.jsx`, `UsuariosView.jsx`
