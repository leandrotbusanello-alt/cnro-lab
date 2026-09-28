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
  "area_impressao": "A1:S72",          // opcional: substitui a área de impressão do Excel (rascunho fora da ficha)
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

### Listas suspensas e células auxiliares
- **Listas suspensas** (validação de dados do Excel do tipo lista) em células de `entradas`/`revisao` viram
  automaticamente um campo de escolha (`role.opcoes`, valor salvo como texto). As opções vêm do intervalo
  da própria aba (valores calculados pelo Excel) ou da lista escrita (`"a,b,c"`).
- **Células auxiliares:** células **fora da área da ficha** de que as fórmulas dependem (tabelas de faixas
  granulométricas, tolerâncias, listas) entram em `modelo.aux` — o motor calcula, a ficha não mostra.
  Não é preciso declarar nada na spec; o conversor segue as referências das fórmulas.

### Frente e verso
- Cada aba é uma **folha** do modelo (`modelo.abas`); a impressão sai com **uma página A4 por aba**.
- Dados salvos: `entradas` com endereço completo (`"VERSO!F7": "BAL-01"`) e `verificacoes` (`{"VERSO!B10": true}`).
- O teste com LibreOffice grava e lê em todas as abas.

### Gráficos
- Os gráficos de **dispersão XY / linha** que ficam **dentro da área de impressão** entram no modelo
  (`folha.graficos`) e o sistema os desenha em SVG, na mesma posição e com a formatação do Excel: título,
  eixos (linear ou log, mínimo/máximo, unidades, formato dos números), grades, séries (cor, espessura,
  tracejado, marcadores, linha suavizada), legenda (com as entradas ocultas) e **linha de tendência**
  (potência, exponencial, linear, log, polinomial, com equação e R²).
- O gráfico acompanha a digitação em tempo real, sai na impressão e aparece no fim da visão em lista (celular).
- Gráficos **fora da área da ficha** são ignorados (aviso ⚠). `"graficos": false` na spec desliga os de uma aba.
- As células que o gráfico lê fora da área entram como auxiliares (como as das fórmulas).
- Se a tabela que o gráfico lia foi limpa da ficha, aponte a série para outro lugar:
  `"graficos_series": { "0.0": { "x": "E29:E39", "y": "P47:P57" } }` (gráfico.série, a partir de 0).
- Como no Excel: ponto com erro (`#N/D`) é pulado e a linha liga os vizinhos; célula vazia ou com texto
  interrompe a linha; em eixo log, valores ≤ 0 também interrompem.

### Ajustes de layout e formatos (quando a planilha não tem o que a ficha online precisa)
```jsonc
"formatos": { "H43:H46": "0.00", "H47": "0.0%" },          // formato numérico (célula "Geral" no Excel)
"remover_mesclas": ["B31:N31"],                           // desfaz uma mescla da planilha
"alturas": { "59": 42 },                                  // altura da linha (pt)
"celulas_extras": { "B60": { "v": "Responsável executor:", "estilo_de": "B20", "negrito": true,
                             "h": "center", "v_al": "bottom", "borda": ["top"], "cor": "#002060", "nf": "0.00" } },
"entradas": [ { "celulas": ["B15"], "tipo": "texto", "opcoes": ["Normal", "Intermediário", "Modificado"] } ],  // lista na spec
"graficos_eixos": { "0.x": "auto" },                      // escala automática (ou { "max": 110 })
"graficos_escala": { "0": [0] }                           // só a série 0 define a escala automática
```
- A planilha-mestre não é alterada: os ajustes valem só para a conversão (e o teste com LibreOffice grava
  as mesmas fórmulas/valores na cópia da planilha).
- Campo numérico com formato de porcentagem: digita-se "3,93" (ou "3,93%") e grava 0,0393, como no Excel.

### Quadros de foto
- `"fotos": ["B15", "E15"]` na spec: a célula vira um quadro de foto (o texto do Excel, p.ex. "Inserir Foto 01",
  aparece enquanto não há foto). Rótulo da visão em lista: `rotulos`.
- O assistente tira ou escolhe a foto; ela é reduzida no aparelho (lado maior 1600 px, JPEG), guardada no
  aparelho (funciona sem internet) e enviada ao Storage, bucket privado `fotos`, na pasta do usuário:
  `<usuarios.id>/fichas/<ensaios_os.id>/<célula>-<hora>.jpg`. Em `dados_resultado.fotos` fica o caminho.
- A ficha só vai para revisão (e só é aprovada) com todas as fotos no servidor. O laboratorista pode trocar
  foto na revisão. Trocar/remover não apaga o arquivo antigo do Storage.
- Código: `src/modules/fichas/fotosFicha.js` (redução, envio, URLs) e `components/FotoCelula.jsx`.

### Formatação condicional
- Regras do Excel dentro da área da ficha entram por célula (`cells[a].cf`) e a ficha aplica na hora,
  com os valores calculados: **contém erro** (p.ex. esconder `#N/D` com fonte branca), **não contém erro**,
  **vazio**, **valor da célula** (=, ≠, >, <, ≥, ≤, entre) e **expressão simples** do tipo `$S$16<>100`.
- Estilos: cor da fonte, preenchimento, negrito, itálico. Tipo não suportado gera aviso ⚠.
- Erros digitados como valor na planilha (`#N/A` em tabela de faixas) continuam erro no motor, como no Excel.

## Regras do conversor
- **Fórmulas bloqueadas:** as aleatórias ou voláteis (`RANDBETWEEN`, `RAND`, `NOW`, `TODAY`, `INDIRECT`, `OFFSET`) nunca entram no sistema.
- **Fórmula em célula de entrada:** é descartada, com aviso. É assim que se tira uma fórmula errada da ficha
  enquanto a Qualidade não emite a revisão: a célula vira campo digitado (registre no `_nota` da spec).
- **Motor:** cobre IF, IFERROR, IFNA, SUM, AVERAGE, MIN, MAX, MEDIAN, COUNT, COUNTA, STDEV, PI, ABS, SQRT, LN, LOG, LOG10, EXP, INT, TRUNC, POWER, ROUND*, AND, OR, NOT, IS*, NA, CONCATENATE, VLOOKUP, HLOOKUP, INDEX, MATCH, SLOPE, INTERCEPT, RSQ e CORREL.
  Função fora da lista aparece como `#NAME?` no teste. Nesse caso, acrescente-a em `src/modules/fichas/motor/formulas.js`.
