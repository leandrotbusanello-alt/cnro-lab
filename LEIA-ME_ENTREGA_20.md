# Entrega 20: apontamentos dos lançamentos antigos (08/10/2026)

O pacote é **cumulativo**: traz as Entregas 18, 19 e 20, montadas sobre o `99e5481`.
Os apontamentos estão no documento do projeto `CNRO_Lab_Apontamentos_Lancamentos_Antigos.md`.

## Como aplicar (nesta ordem)
1. **SQL das entregas anteriores.** Pule o que já foi rodado:
   - `supabase/migrations/18_ajustes_0710.sql`;
   - `supabase/migrations/19_troca_ficha_auxiliares.sql`.
2. **App.** Extraia o zip na pasta do projeto, substituindo os arquivos, e rode `git add -A` → `git commit` → `git push`.
   - Mensagem do commit: `feat: fichas FR-21/54 (traço do Cadastro) + FR-46 + assinaturas (entrega 20)`.
   - Se a 18/19 ainda não tinham subido, inclua isso na mensagem.
3. **Depois do deploy na Vercel,** rode no SQL Editor, nesta ordem, os quatro SQL das fichas (um por vez, cada um numa aba):
   - `20a_FR-IMOB-21.sql` · `20b_FR-IMOB-54.sql` · `20c_FR-IMOB-46_parte1.sql` · `20d_FR-IMOB-46_parte2.sql` (o 20d só funciona depois do 20c);

   Esses rodam **depois** do deploy porque as fichas novas usam recursos do app novo. Podem ser rodados de novo sem problema.

## O que muda

### FR-IMOB-21 e FR-IMOB-54 — traço de projeto do Cadastro
- A lista **"Traço de projeto"** passa a trazer os traços **ativos do Cadastro**: os da empresa do pedido primeiro, depois os sem empresa definida. Traço de outra empresa não aparece. As listas fixas que vinham do Excel saíram.
- Ao escolher o traço, a **faixa de trabalho** de cada peneira é gravada na ficha. Se o traço for revalidado depois, a ficha já feita não muda.
- A faixa de trabalho fica **limitada à faixa da norma** escolhida (mínimo = o maior entre traço e norma; máximo = o menor). Conferido com o PDF da O.S. 2026.01.19.01.001: 1/2" sai **76,10–89,00**, 3/8" **63,10–77,10** … nº 200 **2,50–6,50**, igual ao papel.
- Peneira que o traço não tem aparece com **"-"** (por exemplo, nº 10, 40 e 80 de um traço da norma 2024 na FR-21).
- A peneira do traço é reconhecida pela abertura, mesmo com nomes diferentes entre normas (12,5 × 12,7 mm; 4,75 × 4,8 mm).
- O laboratorista também troca o traço na revisão. Valores podem ser corrigidos à mão, como já era possível.

### FR-IMOB-21 — lista de faixas (normas atuais)
- **DNIT 031/2006:** faixas B e C.
- **DER-SP ET-DE-P00/027:** DER 25, DER 19, DER 12,5, DER 9,5 e DER 4,75.
- **CCR ES-E-002-R12:** BN25-D, EGL 25, EGL 16 19, EGL 19, EGL 12,5 e EGL 9,5.

Saíram as antigas (II/III/IV DERSA/DER-SP e "DNIT B CCR"). Os valores foram conferidos um a um com as tabelas das normas que você enviou. A ficha continua com as mesmas 9 peneiras (sem a 5/8"), e acima do tamanho máximo continua 100, como na planilha.

### FR-IMOB-46
- **BE / EX / BD:** sem lista com setinha. Um clique marca "X" e clicar de novo desmarca. Só uma posição por CP: marcar EX desmarca o BE. A impressão continua igual (só o "X").
- **Leitura da prensa (RTD):** fica numa **caixa separada, à direita da ficha**, com o título "Leitura da prensa (kgf)". Continua fora da impressão.
- **"Número de amostras"** conferido: com 1 CP mostra 1, com 3 mostra 3.
- A ficha continua na Rev01. Os ensaios já lançados não mudam.

### Assinaturas (todas as fichas)
- Todas aparecem do **mesmo tamanho**, **assentadas sobre a linha** "_____", sem cobrir o texto "Responsável …".
- O recorte automático das margens agora reconhece fundo cinza-claro de scan e ignora pontos de sujeira. A assinatura "pequena demais" vinha disso: ela tinha muita margem em volta. Vale para as assinaturas já cadastradas, sem precisar enviar de novo.

## Versões das fichas
- A FR-IMOB-21 e a FR-IMOB-54 passam a **Rev01.1** no sistema, porque o cálculo da faixa de trabalho mudou. A revisão do formulário no SGI continua Rev01, e o cabeçalho impresso não muda.
- Os ensaios **já iniciados** continuam na versão em que começaram. Os ensaios iniciados depois do SQL 20a usam a Rev01.1.
- **O.S. 2026.01.19.01.001:** troque a ficha do ensaio para a FR-IMOB-54 (Lab → Ensaios da O.S. → Ficha). Ela abre na Rev01.1, com a lista de traços do Cadastro.

## Em aberto (não entrou)
- **FR-IMOB-46, grau de compactação:** a referência é o Gmbl (como na Rev01, que dá 94,5) ou o Gmm (que dá 98,4, como no FR-LAB-45 antigo)? Você vai confirmar com o laboratório.

## Testes feitos
- **Motor:**
  - todas as 48 fichas conferidas com as planilhas; só a FR-21 difere, porque o exemplo da planilha usa a faixa antiga "III DER-SP", que saiu da lista;
  - teste próprio das faixas novas da FR-21 e da faixa de trabalho com o traço Neovia B-19 (igual ao PDF).
- **Banco:**
  - os SQL 20a/20b rodados duas vezes numa base limpa;
  - a Rev01.1 vira a vigente, e a Rev01 fica para os ensaios já iniciados.
- **Navegador:**
  - FR-54: lista com 8 traços (sem o de outra empresa), escolha do traço gravada e o mesmo traço visto na revisão pelo laboratorista;
  - assinatura do executor e do calculista do mesmo tamanho, sobre a linha;
  - FR-46: BE/EX/BD por clique, a caixa da leitura da prensa e o número de amostras = 1;
  - recorte de assinatura com fundo de scan e sujeira: 2400×900 → 414×60.
- Build e lint ok.
