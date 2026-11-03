# Entrega 41: FR-IMOB-55 Rev00.2, ajustes pedidos pelo laboratório (03/11/2026)

Feita sobre o `9d25678` (Entrega 40).
**Ordem:** 1) publicar o app (commit e push, depois esperar o deploy da Vercel); 2) rodar no SQL Editor `39a` → `39b` → `39c`, nessa ordem.

## O que muda na FR-IMOB-55 (revisão nova Rev00.2: vale para os ensaios NOVOS)
Os ensaios já iniciados continuam na Rev00.1 (decisão do usuário).

1. **Gráficos "Análise Gráfica", ISC e Expansão sem o "zoom"**
   - A escala passa a seguir a faixa que o laboratório usa no Excel, sempre centrada nos dados do ensaio.
   - **Densidade:** faixa de 300 kg/m³, de 50 em 50, com linhas a cada 10 (ex.: 1.500 a 1.800 no Registro 035).
   - **Umidade:** faixa de 3%, de 1 em 1%, com linhas a cada 0,1% (ex.: 17,5% a 20,5%).
2. **Assinaturas nas 3 folhas:** executor e calculista assinam uma vez, e a assinatura sai na compactação, no ISC/expansão e na granulometria/limites.
3. **Umidade de moldagem:** se a moldagem não for preenchida, a "Umidade Média" (D91) vale a **Umidade Ótima**.
   - Esse valor entra no cálculo da densidade do cilindro da moldagem ótima e na escolha da umidade das curvas.
   - Preenchida a moldagem, vale a média dos dados digitados.
4. **Umidade higroscópica:** a fonte era branca na planilha. Agora os valores aparecem em preto.
5. **Gráficos de penetração:** aparecem os valores do eixo (0,63 · 1,27 · 1,90 · 2,54 · 3,81 · 5,08 · 6,35 · 7,62) e o título "Penetração (mm)", como no Excel.

## Correções de exibição (valem para todas as fichas)
- **Gráfico por cima dos dados:** se alguma linha cresce na tela (texto que quebra com outra fonte ou largura, como no computador do laboratório), os gráficos e imagens abaixo dela descem junto. Só na tela; a impressão continua com as alturas do Excel.
- **Assinatura grande demais:** o espaço da assinatura não entra mais por baixo de gráficos nem de imagens.
  - Na FR-55, as duas assinaturas ficam do mesmo tamanho, sem cobrir o gráfico.
  - Na FR-IMOB-32, a assinatura do calculista também deixou de invadir o gráfico. Foi a única outra ficha que mudou na comparação de impressão.

## Arquivos
- `src/modules/fichas/motor/grafico.js`: escala "janela".
- `src/modules/fichas/components/Grafico.jsx`: rótulos de dados e título de eixo oculto. Só aparecem nos gráficos marcados na spec.
- `src/modules/fichas/components/FichaGrade.jsx`: gráficos e imagens acompanham as linhas na tela; o espaço da assinatura respeita os desenhos.
- `tools/fichas/converter.py`:
  - novos campos da spec: assinatura em várias células, eixo `janela`, `graficos_rotulos` e `fonte_cor`;
  - rótulos de dados (`dLbls`).
- `tools/fichas/specs/FR-IMOB-55.json`: Rev00.2.
- `tools/fichas/previa/estados/FR-IMOB-55_Rev00.2__*.json`: dados de teste.
- `supabase/migrations/13b_fichas_modelo_carga.sql`: regenerado. Só o bloco da FR-55 mudou.
- `supabase/migrations/39a/39b/39c_FR-IMOB-55_Rev00.2_parteN.sql`: carga da revisão nova, em 3 partes. Pode rodar de novo sem duplicar.

## Testes
- **Motor × LibreOffice:**
  - 3 rodadas aleatórias e os exemplos exA, exC, exD e planRev00: 1571/1571 fórmulas iguais.
  - "planAntiga": 16 diferenças nos limites (AW198…), que não vêm desta entrega. A tabela de limites não foi mexida; a única fórmula nova é a D91.
- **Outras fichas:** os cálculos de todas as 48 fichas ficaram iguais aos de antes. Na impressão só mudou a assinatura da FR-32, que estava por cima do gráfico.
- **Prévia de impressão (exemplo exA):**
  - escala nova nos gráficos;
  - valores da penetração;
  - assinaturas nas 3 folhas;
  - Umidade Média da moldagem = 11,1% (a ótima);
  - umidade higroscópica visível.
- **Tela:** uma linha que cresce 74 px faz os gráficos abaixo dela descerem os mesmos 74 px. Os de cima não se movem.
- **SQL:** as 3 partes rodadas duas vezes num banco local. Ficam a Rev00.1 e a Rev00.2 ativas, e a vigente para os novos ensaios é a Rev00.2.
