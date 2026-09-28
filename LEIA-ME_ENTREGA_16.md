# Entrega 16: observação pronta nas fichas FR-IMOB-04/05 + numeração com 3 dígitos

Entrega de 25/09/2026. **Pacote acumulado:** traz também o Campo v2 e a migração 15
(ver `LEIA-ME_CAMPO_V2.md`). Se você já aplicou o Campo v2, é só seguir os passos abaixo.

## Como aplicar (nesta ordem)
1. **Banco (SQL Editor do Supabase):**
   1. `supabase/migrations/15_campo_frimob04_certificados.sql`, se ainda não rodou (pode rodar de novo, sem problema);
   2. `supabase/migrations/16_numeracao_observacao_fichas.sql`.
   Cada uma roda numa transação única: se der erro, nada é aplicado.
2. **App:** extraia o zip na pasta do projeto, substituindo os arquivos, e rode:
   `git add -A` → `git commit -m "feat: observacao padrao das fichas + numeracao 3 digitos (migracao 16)"` → `git push`
3. Rode o SQL **antes** do `git push`.

## O que muda

### Observação pronta nas duas fichas
Ao gerar a O.S., a observação da FR-IMOB-04 e da FR-IMOB-05 já sai escrita no padrão do papel,
com os dados que o Campo informou. O laboratorista só edita se precisar.

Exemplo (CPs extraídos de pista):
> FORAM ENTREGUES AO LABORATÓRIO DA CNRO 04 CPs DE C.A.U.Q. - KM 730+900, KM 731+100, KM 731+100 E KM 731+200 / NORTE / FX-01 / 2ª CAMADA,
> COM A DATA REFERENTE AO DIA 23/02/2026. CORPOS DE PROVA PROVENIENTES DA CONSTRUTORA TRIPOLONI - LUCAS DO RIO VERDE / LOTE 03,
> PARA CONFERÊNCIA DE PARÂMETROS. REGISTRADO COMO OS N° 127/2026.

| Tipo | Base do texto |
|---|---|
| Concreto | O.S. 136/137 em papel: CPs, estrutura, ensaio, data da moldagem |
| CPs extraídos de pista | O.S. 125/126/127: quantidade, estacas, pista, faixa, camada, data da aplicação |
| Massa asfáltica | O.S. 094: mistura e faixa granulométrica |
| Ligante, jazida/caixa, segmento, solo-cimento, agregados, ensaios especiais | Mesmo estilo (textos novos) |

Regras do texto:
- Tudo em maiúsculas.
- "DO CONSÓRCIO…" e "DA CONSTRUTORA…".
- "LOTE 03" com dois dígitos.
- Faixa "1ª Faixa" vira "FX-01".
- CBUQ/CAUQ (ou vazio) vira "C.A.U.Q.".
- Um campo em branco sai do texto, sem erro.

**Campos novos no Campo** (usados no texto):
- Concreto e CPs solo-cimento: **Numeração dos CPs** (ex.: 359 A 364), digitada à mão.
- CPs extraídos: **Tipo de mistura** (em branco = C.A.U.Q.) e **Data da aplicação** (a "data referente"). A data passa para a próxima amostra.
- Massa asfáltica: **Faixa granulométrica** (ex.: FX-III DER-SP).

### Outros campos das fichas
- **Previsão de entrega:** FR-IMOB-04 = data da solicitação + 60 dias. Pode ser editada.
- **Contato:** "(65) 3056 9155" nas duas fichas. Pode ser editado. ⚠️ Confirme se é o número certo.
  Para trocar o padrão: função `_contato_lab_padrao()` na migração 16.
- **Solicitante:** quem pediu no Campo (já era assim).

### Número do PE e da O.S. como no papel
- Mínimo de 3 dígitos: `PE-2026-094`, O.S. `2026.03.27.02.094`.
- Acima de 999 cresce normalmente: `1000`, `1024`…
- Limite: 99999 (antes era 9999).
- Os números já gravados são convertidos (`0094` → `094`) no pedido, na O.S., na FR-IMOB-04 e no número dentro da observação.
- O **texto** das fichas já emitidas não é refeito. Só o número é trocado.
- Lançamento histórico e "# Alterar nº" aceitam até 5 dígitos.

## Testes feitos
- Banco:
  - `supabase/testes/60b_testes_m16.sql`: 26 verificações, com a migração 16 aplicada duas vezes.
    - Os textos das O.S. 094, 127 e 137 saem iguais aos do papel.
    - Também cobre a conversão dos números antigos, previsão, contato, edição pelo laboratorista,
      números 1024/12345, Alterar nº e o limite de 99999.
  - Continuam ok: os 60 testes da migração 14 (com os números em 3 dígitos) e os da migração 15.
- Navegador:
  - pedido de CPs extraídos pelo Campo, com duas amostras (toast `PE-2026-352`);
  - O.S. gerada pelo laboratorista, com a FR-IMOB-04 já preenchida (observação, previsão 24/11, contato e solicitante);
  - DEV alterando para 1024, com a O.S. e a observação acompanhando;
  - build ok.
- Montado sobre o código atual do GitHub (`9865695`), com as fichas FR-IMOB-11 a 17 intactas.
