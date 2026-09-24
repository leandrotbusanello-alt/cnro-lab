# Módulo Laboratório — instalação

> CNRO Lab Control · pacote de 2026-09-24

## 1. O que vem no pacote

| Arquivo | O que é |
|---|---|
| `supabase/migrations/10_modulo_laboratorio.sql` | Migração do banco (**rodar primeiro**) |
| `src/modules/laboratorio/**` | Módulo completo (fila, detalhe, O.S., revisão, finalização, impressão) |
| `src/lib/syncQueue.js` | **Novo.** Fila offline genérica, compartilhada por todos os módulos |
| `src/lib/offlineDB.js` | Atualizado para v2 (novos stores; as funções do Campo continuam iguais) |
| `src/hooks/useOnlineSync.js` | Atualizado: envia a fila nova (inclui os pedidos offline do Campo) |
| `src/components/ui/Modal.jsx` + `.module.css` | **Novo.** Modal genérico reutilizável |
| `src/App.jsx` | Rota `laboratorio` → `laboratorio/*`, importando do módulo |
| `src/pages/LaboratorioPage.jsx` | **Apagar** (placeholder substituído) |

## 2. Instalação

1. **Banco:** no Supabase, abra o SQL Editor, cole todo o conteúdo de
   `supabase/migrations/10_modulo_laboratorio.sql` e clique em **Run**. A migração pode ser rodada mais de uma vez sem problema e, se algo falhar, nada é aplicado.
2. **Código:** extraia o zip na raiz do repositório (sobrescrevendo os arquivos) e apague
   `src/pages/LaboratorioPage.jsx`.
3. Rode `npm run build` para conferir e depois faça commit e push. A Vercel publica sozinha.

> ⚠️ **Antes de testar em produção, confira o login.** O `authStore` busca o perfil por
> `usuarios.id = <id do login>`, mas o banco usa `usuarios.auth_id`. Rode esta consulta no SQL Editor:
> ```sql
> select nome, perfil from usuarios where auth_id is not null and id <> auth_id;
> ```
> Se ela retornar linhas, essas pessoas não conseguem entrar até a conversa de integração corrigir o `authStore`.
> O banco já aceita os dois vínculos.

## 3. O que a migração faz

- **Numeração automática:** o PE recebe `numero_pe` (`'0047'`), `sequencial` e `ano` no INSERT,
  com contador global por ano. Pedidos antigos sem número também são numerados.
- **O.S. `AAAA.MM.DD.LL.SSSS`** é gerada pela função `gerar_os()`: data da validação, lote do pedido e sequencial do PE.
  A mesma função cria os ensaios da O.S. e as fichas FR-IMOB-04 e FR-IMOB-05.
- **Colunas novas:**
  - em `pedidos_ensaio`: `laboratorista_id` (responsável), `assumido_em`, `data_validacao`, `offline_id` e `empresa_id`;
  - em `ensaios_os`: `updated_at`, `aprovado_por_id` e `aprovado_em`.
- **Status com CHECK.** Nomes antigos são convertidos automaticamente (`aguardando_analise` → `aguardando_lab`,
  `devolvido` → `devolvido_campo`).
- **Regras garantidas pelo banco:**
  - só um laboratorista é responsável por pedido (`assumir_pedido`, operação atômica);
  - só o responsável edita;
  - O.S. finalizada fica bloqueada, e só o Gestor reabre;
  - só dá para finalizar com todos os ensaios aprovados;
  - o assistente não aprova o próprio ensaio;
  - ninguém altera o próprio perfil.
- **Status do pedido acompanha os ensaios:** vira `aguardando_revisao` quando há ensaio enviado para revisão.
- **Auditoria automática** no `audit_log`, com antes e depois de cada alteração. Também vale para o que chega pela sincronização offline.
- **Segurança (RLS):**
  - a leitura agora exige login (antes era pública);
  - o bucket privado `assinaturas` guarda as assinaturas em `<usuarios.id>/assinatura.png`.
- **Realtime:** `pedidos_ensaio` e `ensaios_os` entram na publicação, e a fila atualiza sozinha.
- **Manutenção:** consultas feitas no SQL Editor (sem usuário logado) não são bloqueadas pelas guardas, para permitir correções pontuais.

## 4. Como o módulo funciona

**Tela principal (`/laboratorio`):**
- **Fila geral:** pedidos sem responsável, do mais antigo para o mais novo, visíveis para todos os laboratoristas.
- **Minhas O.S.:** dividida em Em análise · Com o campo · Em andamento · Para revisar · Para finalizar · Concluídas (últimos 90 dias).
- **Todas:** visão geral somente leitura, mostrando o responsável de cada pedido.
- **Filtros:** busca (PE, O.S., empresa, lote, pessoas), empresa, material, período e status.

**Detalhe do pedido (`/laboratorio/:id`):**
- **Abrir não reserva o pedido.** O laboratorista vira responsável na primeira ação: salvar edição, devolver ao campo ou gerar a O.S. Se só olhar e sair, o pedido continua na fila, na mesma posição.
- **Antes da O.S.:**
  - editar empresa, lote, material, observações, ensaios e amostras (usa os formulários do Campo);
  - devolver ao campo, com motivo obrigatório;
  - validar e gerar a O.S., com lote obrigatório.
- **Pedido corrigido pelo campo volta para o mesmo laboratorista**, destacado como "Correção recebida".
- **Depois da O.S.:**
  - por ensaio: ficha, executor (assistente ou o próprio laboratorista), status e chave "Visível ao campo";
  - adicionar ou remover ensaios;
  - revisar, aprovar (com opção de já liberar ao campo) ou devolver ao assistente com motivo;
  - transferir a O.S.;
  - finalizar, com conferência e assinatura.
- **Documentos:** FR-IMOB-04 e FR-IMOB-05 em pré-visualização A4 → Imprimir / Salvar PDF. Número provisório sai com a marca "PROVISÓRIO".
- **Histórico:** linha do tempo com cada ação, pessoa e horário.

**Sem internet:**
- tudo funciona com os dados salvos no aparelho;
- as ações entram numa fila e são enviadas na ordem quando a conexão volta;
- PE e O.S. criados offline têm número provisório, e o banco atribui o próximo número da sequência na sincronização;
- se algo falhar, uma faixa vermelha mostra o erro com as opções "Tentar novamente" e "Descartar".

## 5. Testes realizados

Com o esquema do banco reconstruído localmente (PostgreSQL 16 + PostgREST) e o app rodando no navegador:
- a migração rodou 2× sem erro sobre dados no formato antigo;
- regras testadas com usuários de cada perfil: assumir em dobro, editar sem ser o responsável, campo corrigindo, assistente tentando aprovar, finalizar com pendência, alterar O.S. finalizada, virar DEV, acesso sem login, pasta de assinatura de outra pessoa;
- fluxo completo no navegador: fila → editar → gerar O.S. → atribuir → revisar (aprovar e devolver) → reenviar → finalizar → imprimir (PDF A4 com 1 página);
- **cenário da mancha de areia:** pedido criado offline + O.S. + atribuição ao próprio laboratorista, tudo sem internet. Ao reconectar, virou PE-0004 e O.S. definitiva, com histórico completo;
- telas conferidas em desktop (1366 px) e celular (390 px).

## 6. Pendências fora deste módulo

**Para a conversa de integração:**
1. `authStore` deve buscar o perfil por `auth_id` (ver aviso no item 2).
2. Não existe a coluna `usuarios.modulos_acesso`, então o menu fica vazio. Criar a coluna ou derivar os módulos do perfil (`DEV`, `GESTOR`, `LAB`, `ASSIST`, `CAMPO`).
3. **Módulo Campo:**
   - consultar `empresas.nome` (e não `nome_fantasia`/`cnpj`, que não existem; hoje a lista de empresas vem vazia);
   - enviar status `aguardando_lab` (o banco já converte `aguardando_analise`);
   - tratar `devolvido_campo` no lugar de `devolvido`: o botão "Corrigir" hoje procura `devolvido` e não vai aparecer;
   - `useCampo` carrega pedidos com `empresa:empresas(nome_fantasia)`, e esse relacionamento não existe;
   - `dados_amostra` segue como **array de amostras** (formato atual do Campo, mantido);
   - no `reenviarPedido` manual, usar a fila (`processarFila()`) para não duplicar o envio.
4. `node_modules/` está versionado no Git (inclusive binários de Windows). Rodar `git rm -r --cached node_modules` e fazer commit.
5. Não existe `public/favicon.svg` (referenciado no `index.html` e no PWA).

**Para a conversa do Módulo Assistente:**
- Usar `src/lib/syncQueue.js` para funcionar offline. Não criar outra fila.
- Status do ensaio (`ensaios_os.status`): o assistente só pode definir `em_andamento` e `aguardando_revisao`.
  Os status `aprovado` e `devolvido` são exclusivos do laboratorista, e o banco bloqueia.
- Ao enviar para revisão, gravar em `ensaios_os`:
  - `status = 'aguardando_revisao'`;
  - `data_conclusao`;
  - `dados_resultado` (JSON) e/ou `resultado_id` (tabelas `resultados` + `resultado_*`);
  - `modo_preenchi` (`digital`/`upload`) e `arquivo_url` (caminho `bucket/arquivo` no Storage, ou URL).
- O status do pedido é recalculado sozinho pelo banco.
- Quando devolvido, `ensaios_os.devolvido_motivo` traz o motivo.
- Registrar eventos no histórico do pedido com `rpc('adicionar_historico', { p_pedido_id, p_evento: { acao: '...' } })`.
- Assinatura: `usuarios.assinatura_url` = caminho no bucket privado `assinaturas`. Use `urlAssinatura()` de
  `src/modules/laboratorio/labRepo.js`, que funciona offline depois do primeiro download.
- **Componente pedido pelo Lab:** `<FichaEnsaio ensaioOs={...} modo="revisao" onSalvar={...} />`, para o laboratorista corrigir valores na revisão.
  Enquanto não existir, a revisão mostra o resultado de forma genérica (aprovar e devolver já funcionam).
