# Entrega 21: Campo — faixas e quantidade de material (08/10/2026)

O pacote é cumulativo (18 a 21). **Esta entrega não tem SQL:** é só extrair o zip e fazer o push.
Se a Entrega 20 já está no ar, mudam só 3 arquivos do Campo.

Commit: `feat: campo - faixa por CP, varias faixas na massa e sacos (entrega 21)`

## O que muda no Campo
- **CPs extraídos de pista:** a **Faixa** saiu das Informações Gerais (seção 4) e passou para **cada CP** (seção 5).
  - Ela é herdada no "+ Nova amostra"; é só trocar onde for diferente.
  - Pedidos antigos, ao serem reabertos, trazem a faixa em cada CP.
- **Massa asfáltica aplicada:** na seção 5, a **Faixa(s)** aceita **várias marcações** (1ª Faixa, 2ª Faixa, Acostamento…).
  - Clicar marca e clicar de novo desmarca; a nova amostra herda as marcações.
  - Grava como "1ª Faixa, 2ª Faixa e Acostamento".
- **Massa asfáltica (aplicada e não aplicada):** a seção 4 ganhou **Quantidade de sacos** e **Peso por saco (kg)**.
  - O sistema mostra e grava a **Quantidade de material (kg)** (ex.: 3 × 20 = 60).
  - Aparece no Laboratório, nos dados do pedido.
  - A observação da FR-IMOB-04 não mudou (a quantidade não entra nela).

## Testes
- Funções do formulário: juntar/separar faixas, total de sacos, herança e reabertura de pedido antigo de CPs (9 verificações).
- **Navegador:**
  - pedido de CPs com 3 CPs em 1ª Faixa, 2ª Faixa e Acostamento;
  - pedido de massa aplicada com 3 faixas e 3 sacos × 20 kg, herdado na 2ª amostra;
  - conferido no Laboratório e na prévia da FR-IMOB-04.
- Build e lint ok.
