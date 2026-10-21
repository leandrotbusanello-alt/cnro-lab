# Entrega 32: correção da revisão gravada como texto — gráfico da FR-IMOB-21 (20/10/2026)

Feita sobre o `f7e1b60` (Entrega 31). Só 3 arquivos + este LEIA-ME.

## O problema
O.S. **2026.02.10.03.068** (FR-IMOB-21): a curva da faixa de trabalho parava na peneira nº 4.
- O traço escolhido (DNIT 2024) não tem as peneiras nº 10, 40 e 80, então a ficha mostrava "-" nelas.
- Na revisão, os valores foram digitados por cima do "-". Como a célula estava com texto, o campo
  gravou o que foi digitado como **texto** ("28,80"). A tabela mostrava, mas o gráfico só desenha números.
- Valia para qualquer ficha: correção digitada numa célula calculada que mostrava texto.

## A correção
- **App:** a correção da revisão que for um número ("28,80", "7", "-1,5", "1.000,5") é gravada como
  **número**, mesmo que a célula estivesse mostrando "-". Texto de verdade (ex.: "A-7-6") continua texto.
- **Motor das fichas:** correções antigas gravadas como texto numérico passam a valer como número no
  cálculo, na tela, no gráfico e na impressão (o ensaio da .068 já aparece certo só com o app novo).
- **SQL 31:** converte para número as correções já gravadas como texto (em `ajustes` e em `calculados`).
  Na consulta de 20/10, eram só as 6 células da .068 (O26–O28 e P26–P28).

## Como aplicar
1. Extraia o zip e copie a pasta `arquivos` para dentro do projeto do CNRO Lab, substituindo os arquivos
   (ex.: `Copy-Item -Path "<pasta extraída>\arquivos\*" -Destination "C:\projetos\cnro-lab" -Recurse -Force`).
2. `git status` deve mostrar **2 modificados** (`FichaGrade.jsx`, `ficha.js`) e **2 novos**
   (`31_ajustes_numericos.sql`, `LEIA-ME_ENTREGA_32.md`).
3. `git add -A` → `git commit -m "fix: correção da revisão gravada como número (entrega 32)"` → `git push`.
4. **Depois do deploy**, no SQL Editor, rode `supabase/migrations/31_ajustes_numericos.sql` **bloco a bloco**:
   - bloco 1: lista o que vai mudar (deve mostrar as 6 células da .068);
   - bloco 2: corrige;
   - bloco 3: não deve retornar nada.
5. Abra a O.S. 2026.02.10.03.068 → FR-IMOB-21: a faixa de tolerância (laranja) vai até a nº 200.

## Testes feitos
- Ficha FR-IMOB-21 calculada com os dados reais da .068: as duas séries da faixa de trabalho saem
  com os 9 pontos (25,4 até 0,075 mm), contínuas.
- Conversão: "28,80" → 28,8 · "1.000,5" → 1000,5 · "OK", "-" e "A-7-6" continuam texto.
- SQL rodado duas vezes num PostgreSQL de teste: converte só os textos numéricos, mantém o resto.
- `npm run build` ok.
