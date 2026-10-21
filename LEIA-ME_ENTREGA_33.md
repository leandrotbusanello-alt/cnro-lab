# Entrega 33: resultados liberados no Módulo Campo (21/10/2026)

O pacote é **cumulativo**: traz as Entregas 18–23 e 25 a 33, inclusive a **32** (correção da revisão gravada como texto, feita em outra conversa).

## Como aplicar (nesta ordem)
1. **SQL, antes do app:** rode no SQL Editor `supabase/migrations/32_resultados_campo.sql`. Pode rodar de novo sem problema.
2. **App:** extraia o zip na pasta do projeto, substitua os arquivos e rode `git add -A` → `git commit -m "feat: resultados no Campo (entrega 33, inclui 32)"` → `git push`.
3. **Depois do deploy**, se ainda não rodou, rode o `supabase/migrations/31_ajustes_numericos.sql` da Entrega 32, **bloco a bloco**, como diz o LEIA-ME_ENTREGA_32.
4. Recarregue a página (F5). No celular, feche e abra o app.

## O que muda: Campo → "Meus pedidos"
Cada inspetor vê só os pedidos que ele abriu. Nos pedidos com O.S., aparece a lista de **Ensaios**:
- **Liberado pelo laboratorista** (aprovado e com "Liberar para o campo" ligado):
  - selo "Resultado liberado", conformidade, data da aprovação e observação do laboratorista;
  - **"▸ Ver resultados":** os valores gravados na aprovação (ex.: CPs, Gmb, GC, espessura);
  - **"📄 Ver ficha":** a ficha completa só para leitura, com todas as folhas e as assinaturas, e o botão **"🖨 Imprimir / PDF"**.
- **Não liberado:** só o status: "Pendente", "Em execução", "Em revisão" ou "Concluído — aguardando liberação".

A liberação vale **por ensaio**, sem precisar finalizar a O.S. Se o laboratorista desligar a liberação, ou devolver o ensaio ao assistente, o resultado volta a aparecer só como status até ser aprovado e liberado de novo.

Os resultados precisam de internet; sem conexão, o cartão mostra só os dados do pedido.

## No banco (migração 32)
Quem é **só do Campo** (sem Laboratório, Assistente ou Gestor) passa a ler apenas:
- os **próprios pedidos**;
- os ensaios e resultados dos próprios pedidos que estão **aprovados e liberados**;
- as imagens das assinaturas de quem executou e aprovou esses ensaios, para a ficha impressa.

O status dos demais ensaios vem por uma função que não entrega os dados. Laboratório, Assistente, Gestor e DEV continuam vendo tudo. O GestLab não muda, porque lê com a chave de serviço.

## Testes
- **Dois usuários de campo** (simulação no banco): cada um vê só os próprios pedidos. Um ensaio em revisão com "liberar" ligado não é entregue, porque ainda não foi aprovado.
- **Inspetor (tela):**
  - o pedido .001 mostra "Rotarex — Em revisão" e "Densidade — Resultado liberado / Conforme";
  - "Ver resultados" mostra os 3 CPs;
  - "Ver ficha" abre as 2 folhas com as assinaturas;
  - a impressão sai em 2 páginas.
- **Laboratório e Assistente** continuam funcionando.
