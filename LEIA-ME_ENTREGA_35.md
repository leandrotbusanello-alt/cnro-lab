# Entrega 35: concreto — concreteiras/centrais, traços de concreto, FR-IMOB-50 Rev01 e tipo de ruptura (28/10/2026)

Feita sobre o `7b5ada0`. Faz par com a entrega do Gest Lab de 28/10 (Análise estatística do concreto),
que usa os dados que esta entrega passa a gravar.

## O que muda
**Cadastros**
- Nova aba **Concreteiras/Centrais** (Laboratório e Gestor): concreteira, central/cidade, construtoras atendidas
  (várias; nenhuma marcada = todas), ativa. Desativar tira das listas do Campo sem apagar.
- **Traços aprovados** com três botões **CBUQ · TSD · Concreto**, filtro por empresa e lista compacta
  (uma linha por traço; clique abre o detalhe com Revalidar, Histórico e Documento).
  - Traço de **concreto**: nome, empresa, concreteira/central, fck, slump ± tolerância, tipo de cimento, a/c,
    consumo de cimento, documento. **Sem validade.**
  - Os traços já cadastrados viram CBUQ; os que têm "TSD" no nome viram TSD (SQL, bloco 3 mostra a lista antes).

**Campo — pedido de concreto**
- Subcategoria: **"Concreto (Estrutural / Não Estrutural)"**.
- "Local da concretagem" continua (é a estrutura).
- Novo **Concreteira / Central** (obrigatório; só as centrais da construtora do pedido; "Outro (digitar)" para o que
  ainda não está cadastrado).
- **Traço de concreto** (obrigatório; traços da construtora e da central escolhida). O fck e o slump ± tolerância
  vêm do traço (só leitura). Com "Outro (digitar)", o fck e o slump são digitados como antes.
- Dimensões do CP: **10x20** (concreto) e **5x10** (argamassa). Pedidos antigos com outra medida continuam mostrando a sua.

**FR-IMOB-50 Rev01** (13 moldagens × 2 CPs; 7, 14 e 28 dias; colunas S/T desconsideradas)
- Ao iniciar o ensaio, a ficha vem **pré-preenchida** pelo pedido (só uma vez, só células vazias, tudo editável):
  fck, slump ± tol., tipo de CP, e **uma linha por moldagem/caminhão** (data, slump obtido, nº de CPs, peça).
  Material e informações complementares do cabeçalho: "CORPOS DE PROVA DE CONCRETO (DIÂMETRO 10 x 20 cm)" e
  "CPs 101 A 106 | VIGA LONGARINA - PONTE SOBRE O RIO CUIABÁ".
- **Tipo de ruptura de cada CP** (NBR 5739, Anexo A, tipos A–G) numa caixa logo abaixo da ficha, com desenhos próprios.
  Cada CP com carga digitada aparece lá. **Obrigatório** para enviar à revisão e para aprovar
  (exceto lançamento histórico). A ficha e a impressão não mudam.
  Avaliação usada no Gest Lab: A, B, C = Boa · D, E = Razoável · F, G = Ruim.
- Na aprovação, cada CP grava também `tipo_cp` e `tipo_ruptura` em `resultado_compressao_concreto`.
- Ensaios já lançados na Rev00 continuam na Rev00. Contagem de atividades e quadro FR-IMOB-43 leem as duas revisões.

**Observações para a Qualidade (planilha FR-IMOB-50 Rev01)**
- Na lista do tipo de CP, " Argamassa 5x10" tem um espaço no início e a fórmula da constante compara sem o espaço
  (no sistema já está corrigido).
- Aba "FR-LAB-49" dentro do arquivo FR-IMOB-50; aba oculta "Plan2" (NOME/FIGURA) sem uso; colunas S/T sem uso.

## Como aplicar (nesta ordem)
1. **SQL Editor:** rode `supabase/migrations/35_concreto_analise.sql` **bloco a bloco** (pode ser já; só acrescenta):
   - blocos 1 e 2: cadastro de concreteiras e campos do traço;
   - bloco 3: **confira** a lista de traços que vão virar TSD;
   - bloco 4: marca como TSD (o que estiver errado se corrige depois no cadastro: Editar → Tipo);
   - blocos 5 e 6: colunas do resultado do concreto e contagem da Rev01;
   - bloco 7: deve mostrar `1 | 3 | 2 | 116 | …`.
2. Extraia o zip e copie a pasta `arquivos` para dentro do projeto do CNRO Lab, substituindo
   (ex.: `Copy-Item -Path "<pasta extraída>\arquivos\*" -Destination "C:\projetos\cnro-lab" -Recurse -Force`).
3. `git status`: **20 modificados** e **9 novos** (lista abaixo).
4. `git add -A` → `git commit -m "feat: concreto — concreteiras, traços de concreto, FR-IMOB-50 Rev01 e tipo de ruptura (entrega 35)"` → `git push`.
5. **Depois do deploy**, rode `supabase/migrations/35b_FR-IMOB-50_Rev01.sql` (carga da ficha Rev01; inteiro, de uma vez).
6. Cadastre as concreteiras/centrais e os traços de concreto **antes** de o Campo abrir pedidos de concreto
   (enquanto não houver, o Campo usa "Outro (digitar)").

## Arquivos
Modificados: `src/lib/cadastros.js` · `src/modules/assistente/components/ExecucaoEnsaio.jsx` ·
`src/modules/cadastros/CadastrosPage.jsx` · `CadastrosPage.module.css` · `components/ModalTraco.jsx` ·
`src/modules/campo/components/CamposFormulario.jsx` · `src/modules/campo/constants.js` · `src/modules/campo/formularios.js` ·
`src/modules/fichas/camposPedido.js` · `components/FichaComFolhas.jsx` · `motor/ficha.js` · `motor/folhas.js` · `useFicha.js` ·
`useTracosDaFicha.js` · `src/modules/laboratorio/components/RevisaoFicha.jsx` · `src/modules/quadros/motorQuadros.js` ·
`supabase/migrations/13b_fichas_modelo_carga.sql` · `tools/fichas/contagem_regras.py` · `tools/fichas/converter.py` ·
`tools/fichas/specs/FR-IMOB-50.json`

Novos: `src/modules/cadastros/components/ConcreteirasCadastro.jsx` · `components/TracosCadastro.jsx` ·
`src/modules/fichas/components/PainelRupturas.jsx` · `PainelRupturas.module.css` · `src/modules/fichas/preenchimento.js` ·
`supabase/migrations/35_concreto_analise.sql` · `35b_FR-IMOB-50_Rev01.sql` · `tools/fichas/planilhas/FR-IMOB-50_Rev01.xlsx` ·
`LEIA-ME_ENTREGA_35.md`

## Testes feitos
- Pedido simulado (6 CPs, 2 caminhões, fck 30, slump 100 ± 20, 10x20) → ficha Rev01: pré-preenchimento B17=30, G17=100,
  J17=" ± 20", M17="Concreto 10x20", moldagem 1 com 4 CPs e moldagem 2 com 2 CPs, datas e slumps certos;
  material e complemento do cabeçalho certos.
- Duas cargas digitadas → 2 rupturas pendentes (bloqueia o envio); com A e F → 0 pendentes; as linhas de resultado saem
  com `tipo_cp` e `tipo_ruptura` (25,1 t → 246,1 kN → 31,3 MPa); o estado volta igual ao reabrir.
- `testar_motor.mjs` e `testar_quadros.mjs`: tudo confere. `npm run build` ok.
- SQL 35 rodado duas vezes seguidas num PostgreSQL 16 de teste: sem erro; traço de concreto fica sem validade;
  tipo de ruptura fora de A–G é recusado.
