# Fichas online — como converter uma ficha nova

O Excel original é a **fonte da verdade** do layout e das fórmulas. Nada é redesenhado à mão:
o conversor lê a área de impressão da planilha (larguras, alturas, mesclas, bordas, fontes, cores e logotipo)
e as fórmulas, que o motor calcula no navegador exatamente como o Excel.
A **spec** só diz o papel de cada célula (quem preenche o quê) e como gerar os resultados para o Painel.

## Passo a passo
1. Coloque a planilha em `planilhas/<CODIGO>_<REV>.xlsx`. Use a versão **com fórmulas e sem dados**; se tiver um exemplo preenchido, melhor ainda, porque ele vira teste automático.
2. Crie `specs/<CODIGO>.json` (modelo abaixo; veja as specs existentes).
3. Rode `python3 tools/fichas/converter.py <CODIGO>` e resolva os avisos ⚠.
4. Rode `node tools/fichas/testar_motor.mjs --libreoffice`. Todas as fórmulas precisam conferir.
5. Rode `python3 tools/fichas/converter.py` (sem código): isso regenera `supabase/migrations/13b_fichas_modelo_carga.sql`, que é rodado no SQL Editor.

**Revisão nova (Rev01):** troque `versao` e `arquivo` na spec e gere de novo. Os ensaios já iniciados continuam na revisão anterior.

Requisitos: Python 3.10+ (`openpyxl`, `lxml`), Node 18+ e LibreOffice (só para o teste `--libreoffice`).

## Spec
```jsonc
{
  "codigo": "FR-IMOB-13", "versao": "Rev00", "nome": "…", "arquivo": "FR-IMOB-13_Rev00.xlsx",
  "aba": "…",                         // opcional (padrão: primeira aba)

  // cabeçalho vindo do pedido: os · registro · material · procedencia · complemento · pe · lote · rodovia · empresa
  "pedido": { "C7": "os", "O8": "registro",
              "B7": { "campo": "os", "manter_texto": true } },   // rótulo e valor na mesma célula ("Nº O.S: …")

  // o que o assistente preenche: numero · data · hora · texto (multilinha: true para textarea)
  "entradas": [ { "colunas": ["D","F","H"], "linhas": ["18-21", 29], "tipo": "numero" },
                { "celulas": ["O7"], "tipo": "data" } ],

  // o que só o laboratorista preenche (parâmetros)
  "revisao": [ { "colunas": ["S","T"], "linhas": "18-49", "tipo": "texto" } ],

  // opções exclusivas: ☐/☒ ou, com "marca", a célula mostra "X"
  "escolhas": [ { "grupo": "vida_fadiga", "celulas": { "D53": "Sim", "F53": "Não" } },
                { "grupo": "lanc_1", "marca": "X", "rotulo": "Lançamento", "celulas": { "G20": "Bombeado", "H20": "Convencional" } } ],

  "assinaturas": { "executor": "B56", "calculista": "K56" },
  "linhas_assinatura": [[55, 58]],     // imagens nestas linhas (assinaturas de exemplo) são descartadas

  "formulas": { "N20": "=IF(W20=\"\",\"\",W20/0.07854*0.09807)" },   // quando a planilha não tem a fórmula
  "colunas_tela": "V:X",               // colunas fora da impressão que o assistente usa (aparecem só na tela)
  "limpar": ["H49"],                   // células com lixo (#VALUE! de exemplo etc.)
  "mesclas_extras": ["B40:K45"],

  // visão em lista (celular): grupos e rótulos
  "lista": { "grupos": [ { "titulo": "CP {n}", "colunas": ["D","F","H"] },
                         { "titulo": "Identificação", "celulas": ["O7"] } ] },
  "rotulos": { "O7": "Data do ensaio" },

  // resultados normalizados gravados na aprovação (alimentam o Painel)
  "resultados": [ {
    "tabela": "resultado_marshall",
    "repetir": { "var": "c", "valores": ["D","F","H"], "quando": "=COUNT({c}18:{c}21)>0" },   // 1 linha por CP
    "campos": { "codigo_cp": "=\"CP \"&{n}", "gmb_obtido": "={c}32",
                "data_moldagem": { "expr": "=B20", "tipo": "data" } }                        // data → 'AAAA-MM-DD'
  } ],                                  // ou "linhas": [{ "quando": "…", "campos": {…} }, …]

  // caixas de seleção do Excel (controles de formulário) viram "pontos de verificação" (☐/☒, cada uma
  // independente). Detecção automática; a spec pode listar as células ou desligar com false.
  // Caixas em células que já têm papel na spec (p.ex. Sim/Não em "escolhas") ficam como estão.
  "verificacoes": "auto",

  // frente e verso: outras abas da mesma planilha na mesma ficha (botão Frente/Verso, como as abas do Excel).
  // Cada aba extra aceita as mesmas chaves de papéis (pedido, entradas, revisao, escolhas, verificacoes,
  // formulas, limpar, mesclas_extras, lista, rotulos…). Endereços são os da própria aba.
  // Fora dela (resultados, fórmulas da frente), use "VERSO!F7". Fórmulas entre abas do Excel funcionam.
  "titulo_aba": "Frente",
  "abas_extras": [ { "id": "VERSO", "aba": "FR-IMOB-06 VERSO", "titulo": "Verso",
                     "entradas": [ { "celulas": ["F7", "F8"], "tipo": "texto" } ],
                     "lista": { "grupos": [ { "titulo": "Pontos de verificação", "linhas": "10-14" } ] } } ],

  "pedido_exemplo": { "os": "…", "material": "…" }   // só para o teste
}
```

### Frente e verso
- Cada aba é uma **folha** do modelo (`modelo.abas`); a impressão sai com **uma página A4 por aba**.
- Dados salvos: `entradas` com endereço completo (`"VERSO!F7": "BAL-01"`) e `verificacoes` (`{"VERSO!B10": true}`).
- O teste com LibreOffice grava e lê em todas as abas.

## Regras do conversor
- **Fórmulas bloqueadas:** as aleatórias ou voláteis (`RANDBETWEEN`, `RAND`, `NOW`, `TODAY`, `INDIRECT`, `OFFSET`) nunca entram no sistema.
- **Fórmula em célula de entrada:** é descartada, com aviso.
- **Motor:** cobre IF, IFERROR, IFNA, SUM, AVERAGE, MIN, MAX, MEDIAN, COUNT, COUNTA, STDEV, PI, ABS, SQRT, LN, LOG, LOG10, EXP, INT, TRUNC, POWER, ROUND*, AND, OR, NOT, IS*, NA, CONCATENATE, VLOOKUP, HLOOKUP, INDEX, MATCH, SLOPE, INTERCEPT, RSQ e CORREL.
  Função fora da lista aparece como `#NAME?` no teste. Nesse caso, acrescente-a em `src/modules/fichas/motor/formulas.js`.
