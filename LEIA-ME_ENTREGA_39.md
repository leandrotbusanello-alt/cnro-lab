# Entrega 39: ficha "tremendo", saídas sem aviso e lote do Campo (29/10/2026)

Feita sobre o `e7a1743` (Entrega 38). **Sem SQL.**

## 1. Ficha "tremendo" (ex.: FR-IMOB-54 no computador da Natalia)
**Causa:** a ficha ajusta o zoom à largura da tela. Em certos tamanhos de janela/zoom com barra de rolagem
clássica (Windows), a ficha crescia → aparecia a barra de rolagem → a área estreitava → a ficha encolhia →
a barra sumia → a ficha crescia de novo, sem parar.
Reproduzido no navegador de teste (1280 px de largura, altura no limite da rolagem: ~30 mudanças de zoom por segundo).
**Correção:**
- `globals.css` / `AppLayout.module.css`: `scrollbar-gutter: stable` (o espaço da barra fica sempre reservado);
- `FichaGrade.jsx`: o zoom só é recalculado se a largura mudar de verdade (≥ 24 px).
Depois da correção, a mesma varredura de tamanhos não mostra nenhuma oscilação.

## 2. Saídas do sistema "sem avisar"
- A verificação de 1 minuto tirava a pessoa do sistema se o banco não devolvesse o cadastro dela
  (o que também acontece numa falha momentânea do login). Agora ela **renova o login e confere de novo**;
  só sai se o cadastro estiver mesmo inativo (ou o login bloqueado pelo Gestor).
- Quando o servidor encerra a sessão (login expirado, encerrado em outro aparelho, relógio do computador errado…),
  a tela de login agora mostra: **"Sua sessão foi encerrada (login expirado ou encerrado em outro aparelho). Entre novamente."**
  Inativado pelo Gestor continua: "Seu acesso foi desativado. Procure o Gestor." Clicar em **Sair** não mostra aviso.
- Recomendações: todos os computadores fecharem e abrirem o sistema (ou **Ctrl+F5**) para pegar a versão nova;
  conferir se o relógio do computador está em "Definir horário automaticamente".

## 3. Lote no Campo
Ao trocar a empresa, o lote agora passa a ser o da **nova** empresa (antes só preenchia se estivesse vazio).
Continua editável.

## Testado no navegador (PostgREST local)
- Lote: Consórcio Alfa → "Lote 3", ENGEVVIA → "02", CNRO → "01".
- Usuária inativada → sai com "Seu acesso foi desativado". Sessão recusada pelo servidor → "Sua sessão foi encerrada…".
  Usuária ativa com verificação → continua logada. "Sair" → sem aviso.
- Ficha FR-IMOB-54: varredura de tamanhos de janela, oscilação antes / nenhuma depois.

## Arquivos
- `src/modules/fichas/components/FichaGrade.jsx`
- `src/styles/globals.css`, `src/components/layout/AppLayout.module.css`
- `src/store/authStore.js`
- `src/modules/campo/components/NovoPedidoForm.jsx`
