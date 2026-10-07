# Entrega 19: troca de ficha e assistentes auxiliares

Entrega de 07/10/2026. O pacote é **cumulativo**: traz a Entrega 18 e a 19 juntas, montadas sobre o `99e5481`.

## Como aplicar (nesta ordem)
1. **Banco**, no SQL Editor do Supabase:
   - se a **migração 18 ainda não foi rodada**, rode `supabase/migrations/18_ajustes_0710.sql` primeiro;
   - depois rode `supabase/migrations/19_troca_ficha_auxiliares.sql`.

   As duas rodam em transação única e podem ser rodadas de novo sem problema.
2. **App:** extraia o zip na pasta do projeto, substituindo os arquivos, e faça o commit:
   - se a Entrega 18 **já subiu**: `git add -A` → `git commit -m "fix: troca de ficha + auxiliares (migracao 19)"` → `git push`;
   - se **não subiu**: `git commit -m "feat: ajustes 07/10 + troca de ficha e auxiliares (migracoes 18 e 19)"`.
3. Rode o SQL **antes** do `git push`.

## 1. Correção: troca de ficha
**Problema:** quando o laboratorista trocava a ficha de um ensaio já iniciado, o assistente continuava vendo a ficha antiga. Ao iniciar o ensaio, o sistema "congela" a versão da ficha, e a troca não desfazia isso.

**Agora,** quando o laboratorista troca a ficha (Lab → Ensaios da O.S. → coluna Ficha):
- Se o ensaio já foi iniciado, enviado ou devolvido, o sistema pede confirmação.
- O ensaio volta ao assistente como **Devolvido**, com o motivo "Ficha trocada de FR-IMOB-16 para FR-IMOB-13". Isso vale também se o ensaio estiver aguardando revisão: não precisa devolver antes.
- O assistente clica em "Iniciar correção" e abre a **ficha nova**.
- O que ele **digitou** no cabeçalho (material, procedência e informações complementares) passa para a ficha nova. O resto da ficha errada sai, junto com as assinaturas.
- Se o aparelho do assistente tinha um rascunho da ficha antiga, ele é ignorado.
- O histórico do pedido registra "Ficha do ensaio alterada (FR-IMOB-16 → FR-IMOB-13)" e "Ensaio devolvido ao assistente".
- Uma cópia do preenchimento antigo fica na auditoria.
- Ensaio aprovado não pode ter a ficha trocada.
- **Casos já existentes:** a migração libera os ensaios em que a ficha já tinha sido trocada antes desta correção.

## 2. Assistentes auxiliares (ensaio feito por duas pessoas)
Por exemplo: um mede o CP e outro anota; um faz o quarteamento e outro o peneiramento.
- **Laboratorista:**
  - na linha do ensaio, abaixo do executor, fica o campo **"+ Auxiliar…"**;
  - cada auxiliar aparece como 🤝 Nome, e o × remove;
  - só o laboratorista responsável pela O.S. (ou Gestor/DEV) inclui e remove auxiliares.
- **Quem preenche e assina a ficha continua sendo um só: o executor.** A ficha impressa não muda.
- **Auxiliar, no módulo Assistente:**
  - o ensaio aparece na seção **"Como auxiliar"**, abaixo de "Meus ensaios";
  - ele abre a ficha **só para consulta**: sem Iniciar, Salvar, Enviar nem assinatura.
- **Painel:**
  - o ensaio conta para o executor e para os auxiliares;
  - o assistente vê "Como auxiliar (em aberto)" e "Aprovados no período (N como auxiliar)".
- **Revisão:** o quadro "Execução" mostra os auxiliares.
- O histórico do pedido registra "Auxiliar incluído" e "Auxiliar removido".

## 3. Troca de executor
Exemplo: o assistente começou ontem e hoje faltou.
- A troca continua sendo **só do laboratorista**: "Trocar executor" na linha do ensaio.
- O novo executor continua de onde o anterior parou, com o que foi salvo no servidor.
- Se o novo executor era auxiliar, ele sai da lista de auxiliares.

## Testes feitos
- **Banco:**
  - `supabase/testes/90_testes_m19.sql`: 14 verificações (troca durante a execução, durante a revisão e com o ensaio pendente; aprovado bloqueado; auxiliares; permissões);
  - continuam ok os testes da migração 17 (38) e da 18 (6).
- **Navegador:**
  - a Ana inicia na FR-IMOB-16 e digita o material;
  - o laboratorista troca para a FR-IMOB-13, com confirmação;
  - a Ana vê "Devolvido · Ficha trocada de FR-IMOB-16 para FR-IMOB-13", inicia a correção na FR-IMOB-13 e o material digitado está lá;
  - o laboratorista inclui a Bia como auxiliar. A Bia vê o ensaio em "Como auxiliar", só para consulta, e o Painel dela conta 1;
  - o laboratorista passa a execução para a Bia, que continua com o que foi salvo, e o ensaio sai da fila da Ana;
  - build e lint ok.

A Entrega 18 continua descrita no `LEIA-ME_ENTREGA_18.md`.
