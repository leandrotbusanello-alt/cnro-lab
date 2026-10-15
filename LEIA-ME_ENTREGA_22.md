# Entrega 22: FR-IMOB-55 com aba de Lançamento (15/10/2026)

O pacote é **cumulativo**: traz as Entregas 18 a 22, montadas sobre o `99e5481`. Se a 21 já subiu, só mudam os arquivos da lista abaixo.
O escopo e as decisões estão no documento do projeto `CNRO_Lab_FR-IMOB-55_Reformulacao.md`.

## Como aplicar (nesta ordem)
1. **App.** Extraia o zip na pasta do projeto, substituindo os arquivos, e rode `git add -A` → `git commit -m "feat: FR-IMOB-55 com aba Lançamento (entrega 22)"` → `git push`.
2. **Depois do deploy na Vercel**, rode no SQL Editor do Supabase os quatro SQL da ficha, **um por vez, cada um numa aba nova, nesta ordem**:
   - `supabase/migrations/23a_FR-IMOB-55_parte1.sql`
   - `23b_FR-IMOB-55_parte2.sql`
   - `23c_FR-IMOB-55_parte3.sql`
   - `23d_FR-IMOB-55_parte4.sql`

   Cada um deve responder "Success. No rows returned". A ficha nova só passa a valer depois do 23d.
   Os SQL rodam **depois** do deploy porque a ficha nova usa recursos do app novo. Rodar de novo não estraga nada.
3. Recarregue a página (F5).

Conferência (opcional), o hash esperado é `5439a26191f800d5`:
```sql
select f.codigo, m.versao, m.hash from fichas_modelo m join fichas_ensaio f on f.id = m.ficha_ensaio_id
where f.codigo = 'FR-IMOB-55' order by m.publicado_em desc limit 1;
```

## O que muda na FR-IMOB-55
### Duas abas: Lançamento e Ficha
- **Lançamento:** formulário na ordem da aba "Digitar Dados dos Ensaios" da planilha. Tem as seções:
  - opções do ensaio;
  - identificação;
  - umidade higroscópica;
  - compactação (pontos 1 a 6 em colunas);
  - ISC (moldagem, expansão e penetração por cilindro);
  - granulometria;
  - limites;
  - equivalente de areia.

  Os valores calculados aparecem **em cinza ao lado** (umidade, densidade seca por ponto etc.). No fim de cada seção vêm os resultados: umidade ótima, densidade máxima, ISC, expansão, LL, LP, IP, IG, HRB e outros. Também aparecem os gráficos.
- **Ficha:** as 3 páginas, iguais à impressão.
- O que se digita no Lançamento é o mesmo dado da Ficha; não existe cópia.
- **Assistente:** digita só no Lançamento. Na aba Ficha ele confere e assina; a assinatura também pode ser feita no fim do Lançamento.
- **Laboratorista (revisão):** corrige nas duas abas. Na aba Ficha continua valendo a correção à mão de valores calculados, em laranja, como nas outras fichas.
- No celular, o Lançamento fica em blocos, e as tabelas rolam para o lado com o nome da linha fixo.

### Opções da planilha (no topo do Lançamento e na caixa à direita da Ficha)
| Opção | Padrão | O que faz |
|---|---|---|
| **Compactação:** Completa / Simples | Completa | "Simples" esconde as páginas 2 e 3 (na tela, no Lançamento e na impressão), e o resumo fica sem ISC e expansão. Os dados dessas páginas continuam guardados e voltam se mudar para "Completa". |
| **Umidade dos pontos:** Pela higroscópica / Pelas cápsulas | Pela higroscópica | Igual à planilha: a densidade seca e a curva usam a umidade pela água adicionada ou pela cápsula de cada ponto. |
| **Água adicionada:** Inicial + % por ponto / Digitada por ponto | Inicial + % por ponto | **Inicial + %**, como a planilha: digita-se a água do ponto 1, a % acrescentada por ponto e o peso do material, e os pontos 2 a 6 são calculados. **Digitada por ponto**, como estava no sistema: digita-se a água de cada ponto. Assistente e laboratorista podem trocar. |
| **Amostra:** Não trabalhada / Trabalhada | Não trabalhada | Substitui a lista "Curva / Cil. ótima". Trabalhada: ISC e expansão pelo cilindro da moldagem ótima. Não trabalhada: pela curva. |

- "Entra na curva?" (pontos e cilindros) aparece como **Sim** enquanto nada for escolhido, que era como já funcionava.

### Versão
- A ficha passa a **Rev00.1** no sistema. A revisão do SGI continua 00, e o cabeçalho impresso não muda.
- Os ensaios FR-IMOB-55 **já iniciados** continuam na Rev00, como estão. Os iniciados depois do SQL 23d usam as duas abas.

## Testes feitos
- **Conferência com o Excel:** usei as duas planilhas que você enviou, com os dados da aba de digitação lançados no sistema.
  - **Rev00, registro 174:** umidade ótima 9,6%, densidade máxima 1.955, ISC 79,0, expansão 0,10, água 315/455/595/735/875. Igual ao Excel.
  - **Planilha anterior, registro 80, com LL:** umidade ótima 27,1%, densidade máxima 1.482, ISC 12,9, expansão 1,61, LL 62,5%, LP 31,1%, IP 31,4%, IG 20, HRB A-7-5. Igual ao Excel.
  - Ficam de fora só os dois pontos já decididos no lote 10:
    - a umidade da moldagem ótima, que vem só das cápsulas de moldagem;
    - as datas da página 2, que são digitadas.
- **Motor × LibreOffice:**
  - 3 rodadas aleatórias e 5 estados, 1571 fórmulas cada, incluindo os dois modos de água, as duas umidades, Simples e Trabalhada;
  - a única diferença, no LP da planilha antiga, é do LibreOffice (média com FALSO); o sistema segue o Excel;
  - as outras fichas continuam conferindo.
- **SQL:** as 4 partes rodaram duas vezes numa base limpa. O modelo gravado é igual ao gerado, a Rev00.1 vira a vigente e nenhuma linha passa de ~2.100 caracteres.
- **Navegador:**
  - a Ana inicia, digita os 107 campos no Lançamento e vê os resultados do Excel;
  - troca o modo da água (ponto 2 vira campo e volta a ser calculado) e marca "Simples" (somem as seções de ISC/granulometria e as páginas 2–3);
  - na aba Ficha ela não consegue digitar e vê o aviso;
  - assina no Lançamento e envia;
  - a Laura revisa nas duas abas, e a impressão sai com 3 páginas (Completa) e 1 página (Simples);
  - no celular (390 px) a página não rola para o lado.
- Build ok. O lint não mostra erros, só os 2 avisos antigos.

## Observação para a Qualidade
- O texto de referência da página 1 é fixo, "DNIT 164 – Compactação utilizando amostras **não trabalhadas**", como na planilha, mesmo com "Trabalhada" marcado; a norma de amostras trabalhadas é a DNIT 162. Mantive igual à planilha. Se quiser, o texto pode mudar com a opção.
