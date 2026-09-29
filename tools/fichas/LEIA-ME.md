# Fichas online — como converter uma ficha nova

O Excel original é a **fonte da verdade** do layout e das fórmulas. Nada é redesenhado à mão:
o conversor lê a área de impressão da planilha (larguras, alturas, mesclas, bordas, fontes, cores e logotipo)
e as fórmulas, que o motor calcula no navegador exatamente como o Excel.
A **spec** só diz o papel de cada célula (quem preenche o quê) e como gerar os resultados para o Painel.

## Passo a passo
1. Coloque a planilha em `planilhas/<CODIGO>_<REV>.xlsx`. Use a versão **com fórmulas e sem dados**; se tiver um exemplo preenchido, melhor ainda, porque ele vira teste automático.
2. Crie `specs/<CODIGO>.json` (modelo abaixo; veja as specs existentes).
3. Rode `python3 tools/fichas/converter.py <CODIGO>` e resolva os avisos ⚠.
4. Rode `node tools/fichas/testar_motor.mjs --libreoffice` (ou só as fichas novas: `… --libreoffice FR-IMOB-34 FR-IMOB-35`). Todas as fórmulas precisam conferir.
   Com `--estados`, o LibreOffice recalcula também os dados de teste de `previa/estados/<ficha>*.json` (dados reais — indispensável quando
   os valores aleatórios dão erro em cascata, como na FR-IMOB-55). Erro nos dois lados, de tipo diferente (`#DIV/0!` × `#N/A`), é aviso ⚠ e
   não falha: quando dois erros se combinam, o LibreOffice às vezes devolve o outro. Atenção: o LibreOffice conta FALSO como 0 no
   AVERAGE de um intervalo (o Excel ignora) — o motor segue o Excel.
   Confira também com conta à mão e a prévia de impressão (ver "Ferramentas de conferência").
5. Rode `python3 tools/fichas/converter.py` (sem código): isso regenera `supabase/migrations/13b_fichas_modelo_carga.sql`.
6. SQL do lote para o SQL Editor: `python3 tools/fichas/sql_lote.py lote8 FR-IMOB-44 FR-IMOB-45 … --saida DIR` → partes de até ~200 KB
   (`carga_<lote>_parteN.sql`); ficha maior que isso sai em várias partes (`Na`, `Nb`, `Nc`…, rodar na ordem): a `a` grava o modelo com as
   primeiras células e hash `parcial-2-…`; cada parte seguinte só age na etapa dela e acrescenta células, auxiliares e outras abas;
   a última grava o hash final (FR-IMOB-55: 3 partes por causa da tabela de taras).

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
- Cada aba é uma **folha** do modelo (`modelo.abas`); a impressão sai com **uma página A4 por aba**
  (exceto a folha longa com altura automática — ver "Quebra de página").
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
- Série que lê outra aba ou outra pasta de trabalho (p.ex. `[12]Relatório!…`, relatório do equipamento — FR-IMOB-51/52):
  fica no modelo até a spec trocar a origem com `graficos_series`; sem troca, sai do gráfico (aviso ⚠).
- Se a tabela que o gráfico lia foi limpa da ficha, aponte a série para outro lugar:
  `"graficos_series": { "0.0": { "x": "E29:E39", "y": "P47:P57" } }` (gráfico.série, a partir de 0).
- Eixo log: a "unidade principal" do Excel é o **fator** entre as marcas (10 = uma década; ≤ 1 → uma década) — FR-IMOB-45.
- `"graficos_eixos": { "0.x": "justo" }`: escala automática que **não força o zero** (o Excel começa no zero quando o menor valor é até 5/6
  do maior) e mantém a grade secundária — curvas de compactação/ISC da FR-IMOB-55, que na planilha tinham eixos fixos.
- Rótulos do eixo com "posição alta" (`tickLblPos = high`) saem do lado oposto (eixo Y à direita — granulometria da FR-IMOB-55).
- Marcador sem preenchimento e sem contorno (invisível no Excel) não é desenhado.
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
  **vazio**, **contém texto** (FALSO/VERDADEIRO como no Excel em português — FR-IMOB-55), **valor da célula** (=, ≠, >, <, ≥, ≤, entre)
  e **expressão simples** do tipo `$S$16<>100`.
- Estilos: cor da fonte, preenchimento, negrito, itálico. Tipo não suportado gera aviso ⚠.
- Erros digitados como valor na planilha (`#N/A` em tabela de faixas) continuam erro no motor, como no Excel.

### Planilha-banco (FR-IMOB-32, FR-IMOB-55)
- Ficha que puxa os dados de outra aba por `INDIRECT` (nº de registro): as células viram **entradas** (a fórmula é descartada, com aviso)
  e as abas de dados/taras não entram. `"valores_excel": false` na spec: os valores gravados na planilha vêm de outra linha da aba de
  dados, então não servem de exemplo (o teste usa só o LibreOffice).
- **Tabela de taras dentro da ficha** (FR-IMOB-55, até o cadastro de equipamentos): `celulas_extras` com os valores em colunas livres
  (FB:FH) e `VLOOKUP(nº; tabela; col; FALSE)` no lugar do `LOOKUP` da planilha — nº fora da tabela dá `#N/D`. O teste com LibreOffice
  grava esses valores na cópia (`extras_aux` no `.verificacao.json`).
- **Caixas de seleção de configuração fora da ficha** (pontos da curva, método): viram listas Sim/Não num **painel só da tela**
  (`colunas_tela`), e as células ligadas às caixas recebem fórmula (`"AL7": "=O19<>\"Não\""`). Limpe o estilo das colunas do painel
  (`celulas_extras` com `estilo_de` de uma célula vazia) e desfaça mesclas que invadem o painel.
- `LOGEST` não existe no motor: use `INTERCEPT`/`SLOPE` sobre `LN(y)` (curva do limite de liquidez da FR-IMOB-55).

### Quebra de página (impressão)
- **Quebras fixas** (`"quebras": [74, 153]` na spec, última linha de cada página): a folha sai em páginas cortadas nessas linhas, todas na
  mesma escala (a da página mais alta) — FR-IMOB-55, 3 páginas como no Excel.
- Planilha com "ajustar à largura" e **altura automática** (`fitToHeight = 0`, `pagina.ajuste = [1, 0]`): se a folha, na escala
  da largura, passa de **1,25 página**, ela sai em **várias páginas A4**, cortadas entre linhas, como no Excel (FR-IMOB-37, 124 linhas → 3 páginas).
  Até 1,25 página ela é reduzida para caber numa página (a ficha física é uma página por aba; FR-06 e FR-30 passam 6% e 12%).
- O corte não cai no meio de uma mescla vertical (sobe para o início dela); mescla mais alta que uma página é cortada.
- Código: `paginaDa`/`cortarEmPaginas` em `src/modules/fichas/components/ImpressaoFicha.jsx`. Sem cabeçalho repetido (as planilhas não usam "linhas a repetir").

## Ferramentas de conferência (`tools/fichas/previa/`)
Requisitos extras: Python `playwright` (Chromium já instalado) e `pdftoppm`; `Pillow` para comparar imagens.
- **Prévia no navegador:** `npx vite --config tools/fichas/previa/vite.config.mjs` → `http://localhost:5199/?ficha=FR-IMOB-37_Rev00&estado=aleatorio&modo=impressao`
  (`estado` = arquivo de `estados/` sem `.json`, `aleatorio` ou `vazio`; `modo` = `impressao`, `ficha`; `&assinar=1` põe assinaturas de exemplo).
  Usa os modelos de `tools/fichas/saida` e o código real das fichas (motor, `FichaGrade`, `ImpressaoFicha`); o Supabase é trocado por um stub.
- **Impressão em PDF/PNG:** `python3 tools/fichas/previa/imprimir.py FR-IMOB-37_Rev00 [--todas] [--estado …] [--assinar] [--dpi 90] [--saida DIR]`
  → `DIR/<ficha>__<estado>.pdf`, um PNG por página e `…resultados.json` (linhas de `resultado_*`). Padrão: `previa/saida/` (fora do git);
  estado = `estados/<ficha>.json` se existir (rotulado `dados`), senão `aleatorio`.
- **Dados de teste:** `estados/<ficha>.json` = `{ "pedido": {…}, "estado": { "entradas", "escolhas", "verificacoes" } }` — valores fisicamente
  coerentes, usados na conta à mão (lote 6: FR-34 a 38). O `aleatorio` (`estadoAleatorio.js`, semente fixa) enche todos os campos para ver o layout.
- **Fichas anteriores não podem mudar** ao mexer no motor, conversor ou componentes:
  - cálculos: `node tools/fichas/previa/comparar_motor.mjs --gravar base.json` antes; `--comparar base.json` depois
    (valores de todas as fórmulas, `dados_resultado.calculados` e `resultado_*`, com 3 estados aleatórios + `estados/`; ficha nova = "nova");
  - impressão: `imprimir.py --todas --estado aleatorio --saida antes` com o código antigo (p.ex. `git stash`), de novo com o novo
    (`--saida depois`) e `python3 tools/fichas/previa/comparar_impressao.py antes depois` (pixel a pixel; páginas de fichas novas aparecem como "só depois").

## Quadros de controle (FR-IMOB-39 a 43) — `tools/fichas/quadros/`
Os quadros **não são fichas digitadas**: a tela *Laboratório → Quadros de controle* (`src/modules/quadros`) monta cada
quadro com os resultados **aprovados** e imprime no layout da planilha da Qualidade (decisão de 28/09; escopo no projeto:
`claude/CNRO_Lab_Quadros_Controle_Escopo.md`).
- **Layout:** `python3 tools/fichas/quadros/gerar_quadros.py [CODIGO]` lê `tools/fichas/quadros/planilhas/*.xlsx` com o
  conversor em modo `so_layout` (só o desenho — fórmulas e células auxiliares ficam de fora), marca as células que recebem
  valor (linhas de amostra, estatísticas, cabeçalho da FR-43), compacta as linhas de amostra num **bloco modelo** e grava
  `src/modules/quadros/modelos/<CODIGO>.json` (`{ modelo, quadro: { bloco, estatisticas, … } }`). A função de cada célula de
  estatística (média/máx./mín./desvio) é lida da fórmula da planilha; "Média Período" = amostras do filtro, "Análise global" =
  desde o início com os mesmos filtros. Ajustes de layout da FR-43 (textos que transbordavam no Excel) ficam em `ajustes`.
- **De onde vem cada coluna:** `src/modules/quadros/definicoes.js` — tabelas `resultado_*` ou `dados_resultado` de fichas
  online por código + célula (célula por revisão: `{ Rev00: 'H30', Rev01: … }` — **ficha com revisão nova precisa entrar aqui**).
  Coluna sem fonte (sem ficha online) sai vazia e se preenche quando a ficha existir.
- **Motor:** `src/modules/quadros/motorQuadros.js` (puro): 1 linha por amostra (pedido do material/sub-tipo do quadro com
  ensaios aprovados), estatísticas, expansão do bloco modelo para n amostras (`expandirModelo`), e a FR-43 (séries = moldagens
  da FR-50; ACI 214 com λ/K, fck estimado, V1, média móvel, padrões de controle e conformidade).
- **Teste:** `node tools/fichas/quadros/testar_quadros.mjs [--gravar-estados]` — dados simulados + conta à mão para os 5
  quadros; com `--gravar-estados` grava `previa/estados/quadro_<CODIGO>.json` e o banco simulado `previa/estados/banco_quadros.json`.
- **Prévia:** impressão `python3 tools/fichas/previa/imprimir.py --quadro FR-IMOB-43`; tela inteira (com o banco simulado no
  lugar do Supabase) em `http://localhost:5199/?tela=quadros` (`&perfil=ASSIST` para ver o bloqueio).
- **Formato novo no motor de formatação:** mês por extenso sem dia (`[$-416]mmm\-yy` → "set-26").

## Regras do conversor
- **Códigos:** além das FR-IMOB, o conversor e o `sql_lote.py` aceitam as fichas do laboratório (FR-LAB-01, 02, 51…), que ficam
  lado a lado com as FR-IMOB do mesmo ensaio (decisão de 29/09) e gravam nas mesmas tabelas `resultado_*`.
- **Imagem dentro da célula** ("Colocar na célula" do Excel — logotipo das FR-LAB-02 e 51): com `"imagens_na_celula": true` na spec
  (ou na aba extra), o conversor lê a imagem (richData) e a põe na célula/mescla, reduzida e centralizada; a célula perde o `#VALUE!`.
  É opcional porque a FR-IMOB-33 tem uma assinatura de exemplo dentro de célula, que não deve entrar.
- **Texto girado 90°** (de baixo para cima, "Constante da Prensa" da FR-IMOB-55) é desenhado na vertical; o empilhado (255) não.
- **Texto com quebra de linha (Alt+Enter) em célula sem "quebrar texto automaticamente"**: o Excel mostra numa linha só e a ficha
  quebra — troque o texto por `celulas_extras` `{"v": "…"}` sem a quebra (FR-IMOB-56/57).
- **Linhas ocultas** do Excel ficam com altura 0 e o conteúdo delas não aparece (FR-IMOB-53, peneira 5/8"); não as declare
  como campo (`entradas`).
- **`remover_mesclas`:** o openpyxl apaga a borda das células da mescla desfeita — reponha com `celulas_extras` `{"borda": [...]}`
  quando a borda fizer falta (FR-IMOB-48, 51).
- **Mapa de resultados:** um item por tabela `resultado_*`. O `aprovar_ensaio` apaga as linhas da tabela antes de gravar cada item,
  então dois itens da mesma tabela deixam só o último — use `linhas` com todas as linhas num item só (FR-IMOB-51/52).
- **Imagens:** entram as da área de impressão; restos de desenho (tamanho zero/negativo) e imagens que começam fora da área
  (p.ex. nas colunas só de tela) são descartados (FR-IMOB-46 Rev01).
- **`so_layout`** (spec): só o desenho da planilha, sem fórmulas nem auxiliares — usado pelos quadros de controle.
- **Fórmulas bloqueadas:** as aleatórias ou voláteis (`RANDBETWEEN`, `RAND`, `NOW`, `TODAY`, `INDIRECT`, `OFFSET`) nunca entram no sistema.
- **Fórmula em célula de entrada:** é descartada, com aviso. É assim que se tira uma fórmula errada da ficha
  enquanto a Qualidade não emite a revisão: a célula vira campo digitado (registre no `_nota` da spec).
- **Motor:** cobre IF, IFERROR, IFNA, SUM, AVERAGE, MIN, MAX, MEDIAN, COUNT, COUNTA, STDEV, PI, ABS, SQRT, LN, LOG, LOG10, EXP, INT, TRUNC, POWER, ROUND*, AND, OR, NOT, IS*, NA, CONCATENATE, VLOOKUP, HLOOKUP, INDEX, MATCH, SLOPE, INTERCEPT, RSQ e CORREL.
  Função fora da lista aparece como `#NAME?` no teste. Nesse caso, acrescente-a em `src/modules/fichas/motor/formulas.js`.
