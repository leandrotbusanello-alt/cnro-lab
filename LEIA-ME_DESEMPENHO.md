# Desempenho (carregamento mais leve) + Migração 34

Entrega de 22/10/2026. Nenhuma tela, regra ou permissão mudou. O sistema baixa menos coisa
e repete menos trabalho.

## Como aplicar
1. **Banco (recomendado):** no SQL Editor do Supabase, rode `supabase/migrations/34_indices_desempenho.sql`.
   Ela só cria índices e pode rodar mais de uma vez, antes ou depois de publicar o app.
2. **App:** publicar normalmente (Vercel).

## O que mudou
- **Código dividido por módulo.** Antes o app inteiro vinha num arquivo só (~870 kB, 261 kB
  compactado). Agora a abertura baixa ~130 kB compactados. Campo, Lab, Assistente, Gestor e
  Cadastros são baixados quando a tela é aberta, e a tela de destino começa a baixar junto com
  a verificação do login. React e Supabase ficam em arquivos próprios, que o navegador
  reaproveita quando só o código do sistema muda. Se uma versão nova for publicada com o app
  aberto, a página recarrega sozinha uma vez.
- **Login.** O perfil era buscado duas vezes ao abrir o app e de novo a cada renovação do token
  ou volta para a aba. Cada busca fazia Painel, Lab e Assistente recarregarem tudo. Agora é
  buscado uma vez. Mudanças feitas pelo Gestor continuam chegando pela verificação de 1 minuto.
- **Atualizações automáticas do Lab** (tempo real, foco na aba, a cada 2 min). Antes baixavam de
  novo todas as fichas preenchidas (`ensaios_os.dados_resultado`) de todos os pedidos. Agora
  conferem só a versão (`updated_at`) e baixam apenas os ensaios que mudaram. Abrir o módulo e o
  botão "Atualizar" continuam baixando tudo.
- **Cache do aparelho (IndexedDB).** Uma única conexão por aba (antes era uma conexão nova a cada
  leitura ou gravação). Os dados só são regravados quando mudam. A lista de modelos de ficha não
  relê mais todos os modelos completos a cada atualização.
- **Consultas em paralelo.** No Campo, no Assistente e no Lab, consultas que esperavam umas pelas
  outras agora saem juntas. No Campo, falha de conexão no meio da carga passa a mostrar o que está
  salvo no aparelho, em vez de deixar a lista vazia.

## Migração 34
Índices para os filtros usados a cada carga: datas do Painel (solicitados, finalizados,
cancelados, aprovados), finalizados e reaberturas da fila do Lab, "Meus pedidos" do Campo e
`usuarios.auth_id`, usado no login e em todas as regras de acesso.

## Observação
A atualização incremental do Lab depende do `updated_at`, que o banco atualiza em toda alteração
feita pelo app. Uma correção feita direto no SQL Editor não altera o `updated_at`, então só
aparece ao abrir o módulo de novo ou clicar em "Atualizar".
