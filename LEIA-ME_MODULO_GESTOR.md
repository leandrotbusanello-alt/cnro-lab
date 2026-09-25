# Módulo Gestor — atualização G1.1 (cadastro em tela única + módulos)

## Instalação desta atualização
1. **Código:** extraia o zip na raiz do projeto (substituindo) e **apague**
   `src/modules/gestor/components/ArquivoUsuario.jsx` (substituído por `CampoArquivo.jsx`).
2. **Edge Function:** no Supabase → Edge Functions → `gestor-usuarios` → **Code** → apague o código,
   cole o novo `supabase/functions/gestor-usuarios/index.ts` e clique em **Deploy**.
   (Sem isso os módulos marcados não são gravados.)
3. **Banco:** nada a rodar — a coluna `modulos_acesso` já veio na migração 13.
4. `npm run dev` para testar → commit → push.

## O que mudou
- **Tudo numa tela só:** dados, módulos de acesso, assinatura e foto são salvos juntos ao clicar em
  "Criar usuário" / "Salvar". A imagem escolhida aparece em prévia e só é enviada ao confirmar.
- **Módulos de acesso:** caixas Dashboard, Campo, Laboratório e Assistente. Ao escolher o perfil, as caixas
  vêm marcadas com o padrão dele e podem ser ajustadas. Pelo menos um módulo é obrigatório.
  GESTOR e DEV têm sempre todos os módulos; o módulo Gestor é exclusivo desses perfis.
  A mudança vale para o usuário em até 1 minuto (o menu dele se atualiza sozinho).
- **Assinatura obrigatória** para quem tem o módulo Laboratório ou Assistente (executam/revisam ensaios).
  Gestor, Dev e quem só tem Campo/Dashboard: opcional. Sem ela, o botão avisa e não salva.
- **Foto:** sempre opcional.
- A lista de usuários mostra os módulos de cada um; "Sem assinatura" (laranja) só aparece para quem precisa.

## Teste rápido
1. Novo usuário → perfil Laboratorista → as 4 caixas vêm marcadas → tente criar sem assinatura
   (deve pedir) → escolha o PNG → Criar usuário. A tela final mostra e-mail/senha.
2. Abra o usuário: a assinatura já aparece. Desmarque "Laboratório" e "Assistente" → a assinatura vira opcional.
3. Entre com esse usuário numa janela anônima e confira que o menu mostra só os módulos marcados.

---

# Módulo Gestor (G1) — usuários, empresas e login

## Instalação (nesta ordem)

### 1. Banco — migração 12
No **SQL Editor** do Supabase, rode `supabase/migrations/12_modulo_gestor.sql`
(as migrações 10 e 11 precisam já ter sido rodadas). Pode rodar mais de uma vez.

### 2. Edge Function `gestor-usuarios`
1. Painel do Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nome da função: **`gestor-usuarios`** (exatamente assim).
3. Apague o código de exemplo e cole todo o conteúdo de `supabase/functions/gestor-usuarios/index.ts`.
4. Clique em **Deploy function**.

Não é preciso configurar chaves: `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`
já existem automaticamente nas Edge Functions. **Nunca** coloque a `service_role` no `.env` do app.

> Se ao criar usuário aparecer erro **401 / Invalid JWT**: na função → **Details** → desligue
> **Verify JWT** e salve. A função já confere o login de quem chama por conta própria.

### 3. Configurações do Auth (painel do Supabase)
- **Authentication → URL Configuration**
  - *Site URL*: o endereço do app na Vercel (ex.: `https://cnro-lab.vercel.app`).
  - *Redirect URLs*: adicione `https://SEU-APP.vercel.app/redefinir-senha` e
    `http://localhost:5173/redefinir-senha`.
- **Authentication → Sign In / Providers → Email** (regras de senha): o tamanho mínimo precisa ser
  **6 ou menos** e a proteção de senhas vazadas deve ficar **desligada** — senão o Supabase recusa a senha
  padrão `123456` (o sistema mostra uma mensagem avisando).

### 4. Código
1. Extraia o zip na raiz do projeto, substituindo os arquivos.
2. **Apague** `src/pages/GestorPage.jsx` (a tela foi para `src/modules/gestor/`).
3. `npm run dev` para testar → commit → push.

## O que mudou

**Gestor → Usuários**
- Lista com busca, filtro por perfil e por situação (Ativos, Inativos, Senha provisória, Todos).
- Criar usuário: nome, e-mail (login), cargo, perfil e empresa (lista). O login é criado com a senha
  **123456** e o sistema obriga a troca no primeiro acesso. A tela final mostra e-mail e senha para repassar.
- Editar dados; trocar o e-mail altera também o login.
- **Resetar senha** → volta para 123456 e obriga nova troca. Usuário antigo sem login mostra "Sem login"
  e o botão vira **Criar login**.
- **Inativar** → perde o acesso na hora: o login é bloqueado, o banco deixa de mostrar qualquer dado a ele
  e o app aberto é desconectado em até 1 minuto. **Reativar** devolve o acesso com a senha que ele já tinha.
- Assinatura (PNG, até 1 MB) e foto (JPG/PNG/WEBP, até 3 MB) — buckets privados `assinaturas` e `fotos`.
- Hierarquia: **DEV** gerencia todos os perfis; **GESTOR** só LAB, ASSIST e CAMPO (GESTOR/DEV aparecem
  em modo leitura). Ninguém altera o próprio perfil ou status. Excluir usuário: só DEV (pelo banco);
  o Gestor inativa.

**Gestor → Empresas**
- Lista com busca e filtro (Ativas, Inativas, Todas), nº de usuários vinculados.
- Criar/editar: nome, lote, rodovia, ativa. Aviso de duplicidade (mesmo nome + lote).
- Renomear a empresa atualiza o nome/lote nos usuários vinculados.

**Login**
- "Olhinho" para mostrar/ocultar a senha (também nas telas de nova senha).
- Troca obrigatória de senha no primeiro acesso / após reset (`/trocar-senha`).
- **Esqueci minha senha**: envia um link por e-mail para definir a senha (pode repetir a antiga).
  Não é possível enviar a senha atual — o Supabase guarda só uma versão criptografada.
- Clicar no próprio nome, no topo, abre "Trocar minha senha".

**Banco (migração 12)**
- `usuarios.trocar_senha` e `usuarios.empresa_id` (empresa/lote do usuário vêm da empresa).
- Guarda de hierarquia DEV > GESTOR > demais; auditoria também em `empresas`.
- Catálogo (`ensaios`, `fichas_ensaio`, `ensaio_resultado_map`): só **DEV** altera; o Gestor visualiza.
- Leitura de todas as tabelas somente para usuários **ativos**.

## Pendente
- **SMTP próprio** (Resend, Brevo, Gmail/Outlook) em Authentication → Emails → SMTP Settings.
  Sem ele, o e-mail de recuperação só chega a membros da equipe do painel Supabase (~2 por hora).
  Até lá, use o **Resetar senha** do Gestor.

## Roteiro de teste
1. Entre como DEV → Gestor → Empresas → cadastre uma empresa (ex.: "Consórcio X", lote 01).
2. Usuários → **Novo usuário** perfil GESTOR → anote e-mail/senha.
3. Em outra janela anônima, entre com esse GESTOR / `123456` → deve pedir a troca de senha → troque.
4. Como GESTOR: crie um usuário CAMPO vinculado à empresa. Confirme que GESTOR/DEV não aparecem na lista
   de perfis e que abrir um GESTOR/DEV mostra "somente o DEV pode alterar".
5. Envie assinatura PNG e foto para um LAB.
6. Entre com o CAMPO numa janela anônima → troque a senha → deixe aberto.
   Como GESTOR, **inative** esse CAMPO → em até 1 minuto a janela dele volta ao login com
   "Seu acesso foi desativado". Tente entrar de novo → "Usuário inativo".
7. Reative → ele entra com a senha que tinha criado.
8. **Resetar senha** do CAMPO → ele entra com `123456` e precisa trocar de novo.
9. Na tela de login, teste o olhinho e o "Esqueci minha senha" com o seu e-mail
   (funciona para membros da equipe do Supabase mesmo sem SMTP).
