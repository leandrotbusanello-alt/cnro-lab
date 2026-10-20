# Entrega 29: folhas adicionais na ficha (20/10/2026)

O pacote é **cumulativo**: traz as Entregas 18–23, 25 a 29, sobre o `99e5481`.

## Como aplicar (nesta ordem)
1. **App:** extraia o zip na pasta do projeto, substitua os arquivos e rode `git add -A` → `git commit -m "feat: folhas adicionais na ficha (entrega 29)"` → `git push`.
2. **Depois do deploy**, rode no SQL Editor `supabase/migrations/29_contagem_folhas.sql`. A contagem passa a somar todas as folhas. Pode rodar de novo sem problema.
3. Recarregue a página (F5).

## O que muda
Quando o ensaio não cabe numa ficha (por exemplo, densidade aparente com mais de 21 CPs), quem preenche acrescenta outra folha da mesma ficha.

**Assistente (e lançamento histórico):**
- Acima da ficha aparece **"+ Adicionar folha"**.
- A folha nova abre com o **cabeçalho preenchido como na folha anterior** (data do ensaio, material, procedência, informações complementares e o que mais estiver acima da área de CPs/pontos). As opções escolhidas (Sim/Não etc.) também vêm iguais. Os CPs vêm em branco.
- O **CP nº** é digitado à mão, livre.
- **Folha 1, Folha 2…** viram abas, e o botão **"Excluir esta folha"** apaga uma folha extra. A folha 1 nunca é excluída.
- Com a ficha assinada, não dá para acrescentar nem excluir folhas: é preciso remover a assinatura antes. A assinatura aparece em **todas as folhas**.
- Não há limite de folhas. O contador de campos, as validações (campos em vermelho) e o salvamento automático valem para todas as folhas.

**Laboratorista:**
- Revisa a ficha com as abas Folha 1, Folha 2…, podendo corrigir qualquer uma.
- Aprova uma vez só: é o mesmo ensaio, com uma conformidade e uma assinatura do calculista.

**Cálculos e resultados:**
- Cada folha faz as **suas próprias médias**, como no papel.
- Na aprovação, os resultados de **todas as folhas** vão para o Painel (ex.: os CPs das duas folhas da FR-IMOB-46).
- Os quadros de controle (FR-IMOB-39 a 43) também leem todas as folhas.

**Impressão:** sai cada folha em sequência, como a ficha é, sem "Folha 1 de 2".

**Contagem (`contagem_atividades`, migração 29):** soma as unidades de todas as folhas. Atividades que contam 1 por ficha continuam contando 1.

Fichas sem folha adicional ficam exatamente como antes, inclusive no banco.

## Testes
- **Ficha de densidade aparente (FR-IMOB-46):**
  1. O assistente adicionou a folha 2 (com a data do ensaio copiada) e a folha 3; depois excluiu a folha 3.
  2. Assinou (a assinatura aparece na folha 2) e enviou.
  3. O laboratorista viu as duas abas, imprimiu (2 páginas) e aprovou.
  4. Resultado: 3 CPs no Painel (2 da folha 1 + 1 da folha 2), e a contagem deu 3.
- **Ficha de compactação completa (FR-IMOB-55), com uma folha:** sem mudança, e nada novo gravado no banco.
