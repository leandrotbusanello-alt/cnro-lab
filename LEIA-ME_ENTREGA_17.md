# Entrega 17: apontamentos do teste de 06/10/2026 + cadastros

Entrega de 06/10/2026. Montada sobre o código atual do GitHub (`0179f26`, com as fichas até FR-LAB-51).
As decisões estão no documento do projeto `CNRO_Lab_Apontamentos_2026-10-06.md`.

## Como aplicar (nesta ordem)
1. **Banco:** no SQL Editor do Supabase, rode `supabase/migrations/17_apontamentos_cadastros.sql`.
   - Roda numa transação única: se der erro, nada é aplicado.
   - Pode rodar de novo sem problema.
2. **App:** extraia o zip na pasta do projeto, substituindo os arquivos, e rode
   `git add -A` → `git commit -m "feat: apontamentos 06/10 + cadastros (migracao 17)"` → `git push`.
3. Rode o SQL **antes** do `git push`.

## O que muda

### Pedido (Campo)
- **Formulário por tipo de amostra**, conforme as págs. 8 a 11 do documento de apontamentos:
  - os 10 tipos têm "Informações gerais" (preenchidas uma vez) e "Amostras" (com herança e "+ Nova amostra");
  - nos tipos de amostra única (ligante, massa não aplicada, ensaios especiais), a seção "Amostras" não aparece;
  - sai o Trecho/Segmento.
- **Massa asfáltica:** "Material aplicado? Sim/Não".
  - Sim: local Usina ou Pista e amostras por caminhão.
  - Não: local Usina (fixo) e camada, sem caminhão.
- **Listas dos cadastros:**
  - traço ("Projeto adotado"), jazida, pedreira e fornecedor de ligante;
  - todas têm a opção "Outro (digitar)";
  - na jazida, o município vem do cadastro;
  - o traço vencido aparece marcado "VENCIDO" e o pedido avisa o laboratório.
- **Km e estaca com vírgula**, corrigidos ao sair do campo:
  - `545+970` → `545,970`;
  - `280+40` → `280,040`;
  - `545,9` → `545,900`;
  - `545` → `545,000`.
- **Especificação:**
  - entra "Caracterização de material asfáltico";
  - sai "Outros" (pedido do auditor).
- **Detalhar Ensaios:** todos os ensaios, em três grupos, sem depender do material. Saem os "Outros".
- **Observações** no final do pedido, antes de "Enviar Pedido".
- **Número do pedido:** `145/2026` em todas as telas.

### Laboratório
- **FR-IMOB-04 antes da O.S.:**
  - "✓ Validar e gerar O.S." (ou o botão FR-IMOB-04 em Documentos) abre a ficha já preenchida: número previsto da O.S., itens marcados, previsão, contato e observação;
  - o laboratorista ajusta e clica em **✓ Gerar O.S.**, dentro da ficha, e os ajustes são gravados junto;
  - lançamento histórico: a data da O.S. fica na barra da ficha;
  - sem internet, continua o quadro simples de antes.
- **Botão "✓ Atribuir ensaio":** escolher o executor não grava mais sozinho. Aparecem "Atribuir ensaio" e "Cancelar"; para tirar o executor, use "Remover atribuição".
- **Amostras:** na ordem do formulário, com os nomes dos campos novos e o km já com vírgula.
- **Editar pedido:** usa o mesmo formulário do Campo.
- **FR-IMOB-04 (opção A):**
  - já tem "Caracterização de material asfáltico";
  - saem "Outros" da especificação e os dois "Outros" dos ensaios;
  - os ensaios "Outros" do catálogo foram desativados.
- **Observação padrão das fichas:**
  - refeita para os campos novos;
  - pontos separados por ponto e vírgula: "KM 728,400; KM 728,500 E KM 729,000";
  - a mistura e a faixa vêm do traço escolhido;
  - os CPs saem como "359 A 364" quando os números são seguidos.

### Cadastros (menu novo "📚 Cadastros", para Laboratório e Gestor)
- **Traços aprovados:**
  - empresa, tipo de mistura, faixa, teor de ligante, data da aprovação, coordenador, validade e documento (PDF, privado);
  - a validade padrão é de 6 meses e pode ser alterada;
  - **Revalidar** registra a nova aprovação, e o **Histórico** mostra todas as validações;
  - filtros: Ativos, Vencem em 30 dias, Vencidos, Sem validade e Inativos.
- **Jazidas** (nome, município, coordenadas), **Pedreiras** (nome, município) e **Fornecedores de ligante** (nome).
- Nada é apagado: o item é desativado e some das listas do Campo.
- **Aviso no Painel** (Laboratório e Gestor/DEV): traços vencidos e os que vencem em até 30 dias, com link para revalidar.
- **Carga inicial:** os 7 traços da planilha da FR-IMOB-54, com a faixa de trabalho por peneira.
  - Faltam a empresa, a data de aprovação e o coordenador de cada um: complete pela tela.
  - Jazidas, pedreiras e fornecedores começam vazios.

### Assinatura
As margens em branco da imagem são cortadas automaticamente:
- na exibição, para as assinaturas já cadastradas (não precisa subir de novo);
- no envio de uma assinatura nova pelo Gestor.

Assim a assinatura ocupa o espaço dela na ficha.

### Correção encontrada no caminho
Pedido do Campo feito **sem internet** perdia as "Especificações" ao sincronizar. Corrigido (`src/lib/syncQueue.js`).

## Suposições (avise se alguma estiver errada)
1. **Traço vencido:**
   - continua aparecendo para o Campo, marcado "VENCIDO";
   - o laboratório vê um aviso no pedido;
   - o Campo não é bloqueado.
2. **Alertas de validade:**
   - 30 dias antes do vencimento e depois de vencido, no Painel e na tela de Cadastros;
   - por e-mail, não, porque o sistema ainda não tem um serviço de envio.
3. **Coordenador:** só o nome, escrito à mão. Não precisa ser usuário do sistema.
4. **Revalidação:** é o mesmo traço com nova data. Se o traço mudou (teor, faixa), cadastre um traço novo e desative o antigo.
5. **Lista de traços no pedido:** traços da empresa escolhida mais os traços sem empresa.
6. **Ensaios especiais:** a subcategoria "Outros" saiu, porque o documento só lista as quatro. Pedidos antigos continuam com o nome.
7. **Massa não aplicada, ligante e ensaios especiais:** amostra única, porque o documento não pede campos por amostra nesses três.

## Fora desta entrega (conversa das fichas)
- **FR-IMOB-54:**
  - cabeçalho editável;
  - aviso quando a massa total não bate com a massa inicial;
  - ler os traços do cadastro novo. A faixa de trabalho já está no banco, em `tracos_aprovados.faixa_trabalho`.
- **FR-IMOB-23:** diferente do original.
- **FR-IMOB-13:** casas decimais.

## Testes feitos
- **Banco:**
  - `supabase/testes/70_testes_m17.sql`: 38 verificações, com a migração aplicada duas vezes.
  - Os textos das O.S. em papel (127 e 137) conferem no formato novo.
  - Continuam ok: os 60 testes da migração 14 e os da 15 (ajustado para o km com vírgula).
- **Navegador:**
  - Cadastros: editar traço, revalidar, histórico, cadastrar jazida, pedreira e fornecedor.
  - Pedido de CPs extraídos com traço, duas amostras com herança e km normalizado.
  - FR-IMOB-04 antes da O.S.: item novo marcado, observação ajustada e gravada.
  - Atribuir ensaio pelo botão.
  - Massa asfáltica Sim/Não, concreto com dimensão "Outro", jazida com validação e município automático, ensaio especial.
  - Pedido devolvido e corrigido, que reabre com tudo preenchido.
  - Edição pelo Laboratório.
  - Aviso de traço vencido no Painel: aparece para Laboratório e DEV, não para o Campo.
  - Assinatura recortada na ficha.
  - Build ok.

Os arquivos `src/modules/campo/components/subcategorias/Campo*.jsx` não são mais usados. Podem ficar, ou ser apagados depois.
