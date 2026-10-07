# Entrega 18: ajustes de 07/10/2026

Montada sobre a Entrega 17 (`99e5481`, já no GitHub).

## Como aplicar (nesta ordem)
1. **Banco:** no SQL Editor do Supabase, rode `supabase/migrations/18_ajustes_0710.sql`.
   - É uma transação única: se der erro, nada é aplicado.
   - Pode rodar de novo sem problema.
2. **App:** extraia o zip na pasta do projeto, substituindo os arquivos, e rode:
   `git add -A` → `git commit -m "feat: ajustes 07/10 (migracao 18)"` → `git push`.
3. Rode o SQL **antes** do `git push`.

## O que muda

### Campo
- **CPs extraídos de pista:** a seção 5 (Amostras) não pede mais Idade de ruptura nem Tipo de ruptura. Concreto e solo-cimento continuam iguais.
- **Massa asfáltica aplicada:**
  - Seção 4 (Informações gerais): local da coleta, data de usinagem, hora da coleta, projeto adotado, teor de ligante, temperatura de usinagem, Estaca/Km inicial e Estaca/Km final.
  - Seção 5 (Amostras): identificação do caminhão, temperatura de aplicação, pista, faixa, camada e Estaca/Km de extração.
- **Detalhar Ensaios:** o ensaio novo "Caracterização de Material Asfáltico" (Asfalto) fica sem norma por enquanto.
- **Herança de dados** em todos os pedidos:
  - "+ Nova amostra" copia **todos** os campos da amostra anterior, inclusive o km;
  - a identificação da amostra ou do CP já vem com o número seguinte: `101` → `102`, `CP-09` → `CP-10`;
  - é só ajustar o que for diferente.

### FR-IMOB-04
O ensaio "Caracterização de Material Asfáltico" foi incluído na coluna Asfalto. Os "Outros" já tinham saído na Entrega 17.

### Fichas
- **Cabeçalho editável:**
  - campos Material, Procedência do material e Informações complementares;
  - vale para todas as fichas, para o assistente e para o laboratorista;
  - vêm preenchidos do pedido e podem ser reescritos;
  - na visão "Lista", aparecem no grupo "Cabeçalho".
- **Laboratorista corrige qualquer valor na revisão,** inclusive as células calculadas, como a faixa granulométrica da FR-IMOB-54:
  - o valor corrigido fica **em laranja**, e o topo da ficha mostra quantos foram corrigidos;
  - **apagar** o valor faz a célula voltar ao cálculo; "Voltar todos ao cálculo" desfaz todas as correções;
  - as células que dependem do valor corrigido são recalculadas;
  - a correção é gravada com a ficha em "Salvar correções" ou "Aprovar";
  - na impressão sai só o valor, sem o laranja.
- Os rótulos fixos da ficha (títulos, normas, nomes das linhas) continuam fixos.

### Cadastros
- **Empresas** saiu do módulo Gestor e passou para a aba **Cadastros → Empresas**.
  - O Laboratório também cadastra, altera e exclui empresas.
  - Uma empresa com pedidos, usuários ou traços ligados não pode ser excluída. O sistema avisa para desativá-la.
- O **cadastro de usuários** continua só com o Gestor e o DEV.
- **Traço → granulometria:**
  - tabela de peneiras com a % passante mínima e máxima;
  - cada peneira aparece pelo nome e em mm (por exemplo, "nº 200 — 0,075 mm" ou "3/8" — 9,5 mm");
  - séries prontas (DNIT/DER-SP) para começar, todas editáveis: dá para trocar a peneira, digitar uma abertura que não está na lista ("Outra…"), incluir ou remover linhas;
  - o cartão do traço mostra quantas peneiras ele tem.

### Painel
- O perfil **Gestor** vê só o painel do Gestor.
- O **DEV** continua vendo todos.

### Pedido cancelado
O DEV agora vê os pedidos cancelados (Lab → Todas) e consegue excluí-los pelo botão "🗑 Excluir pedido".

## Testes feitos
- **Banco:**
  - `supabase/testes/80_testes_m18.sql`: 6 verificações, com a migração aplicada duas vezes;
  - os testes da migração 17 (38) continuam ok.
- **Navegador:**
  - CPs extraídos sem ruptura, com herança de `CP-09` para `CP-10` (camada, lado e km herdados);
  - massa aplicada com os campos nas seções certas;
  - o ensaio novo aparece em Detalhar Ensaios;
  - o assistente edita o Material, salva, recarrega e envia para revisão;
  - o laboratorista corrige uma célula calculada da FR-IMOB-13 (fica laranja), apaga para voltar ao cálculo, corrige de novo, salva e reabre com a correção;
  - o laboratorista cria e exclui uma empresa, e a exclusão de uma empresa em uso é bloqueada com aviso;
  - granulometria do traço: incluir "nº 200", salvar e conferir no banco;
  - o painel do Gestor mostra só o bloco do Gestor, e a página Gestor mostra só Usuários;
  - o DEV vê um pedido cancelado e o exclui; o laboratorista não vê o botão;
  - build e lint ok.

## Pendências (não fazem parte desta entrega)
- **FR-IMOB-54:**
  - aviso quando a massa total não bate com a massa inicial;
  - ler a faixa de trabalho do traço escolhido no cadastro.
- **FR-IMOB-23** e as casas decimais da **FR-IMOB-13** (conversa das fichas).
- **Foto da ficha física → preenchimento automático:** fica para um piloto futuro, com uma ficha só.
