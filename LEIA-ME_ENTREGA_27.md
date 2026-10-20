# Entrega 27: contagem de ensaios por atividade (20/10/2026)

O pacote é **cumulativo**: traz as Entregas 18–23, 25, 26 e 27, sobre o `99e5481`.

A Entrega 27 é **só SQL** e não muda telas, lançamento nem dados. Ela prepara a contagem que o quadro de totais do GestLab (Visão Geral) vai ler.

## Como aplicar
1. No SQL Editor, rode `supabase/migrations/27_contagem_atividades.sql`. Pode rodar de novo sem problema.
2. Confira com:
   ```sql
   select atividade, sum(quantidade) as total
   from contagem_atividades
   group by 1 order by 2 desc;
   ```
3. (Opcional) Para guardar no GitHub, extraia o zip na pasta do projeto e faça `git add -A`, `git commit` e `git push`.

## O que é contado
Cada **corpo de prova, determinação, ponto, furo ou cilindro com dado digitado na ficha** conta como uma unidade. Vale a ficha usada no ensaio, e não o nome do ensaio no pedido.

Exemplos com as fichas reais dos testes:

| Ficha | Contagem |
|---|---|
| Compactação completa (FR-55) | Densidade máx. e umidade ótima 5 · ISC 3 · Expansão 3 · Granulometria 1 · LL e LP 1 · Equivalente de areia 1 (quando preenchidos) |
| Densidade aparente e GC (FR-46) | nº de CPs medidos (6 e 7 nos exemplos) |
| Marshall (FR-13/16) | CPs medidos (até 6) |
| Rice (FR-10) | determinações (até 3) |
| Extração (FR-22) | determinações (normalmente 2) |
| Granulometria de mistura (FR-21/54) | amostras (até 2) |
| Concreto (FR-50) | "Compressão axial e diametral" = nº de CPs com carga lançada |
| Solo-cimento (FR-33) | "Compressão axial e diametral" = CPs rompidos |
| Ligante (FR-14/15/18) | Caracterização de ligante = 1 |

**Moldagem** (vem do pedido do Campo):
- **CP's de concreto:** nº de CPs do pedido quando o "responsável pela moldagem" é **CNRO**. Em branco ou outra opção não conta.
- **CP's solo cimento:** nº de CPs dos pedidos "CPs solo-cimento", sempre.

**O que entra:** só O.S. numeradas e não canceladas. As fichas entram em qualquer situação, porque contam o que já foi digitado. A coluna `status_ensaio` permite filtrar só as aprovadas.

**Colunas da view `contagem_atividades`:** numero_os, empresa, lote, material (asfalto/solos/concreto/especial), status_pedido, aberto_em, finalizado_em, ficha, status_ensaio, atividade, quantidade.

## Teste local
- As regras foram aplicadas aos 49 estados de exemplo das fichas (planilhas reais) e a casos montados de extração, Rice, Marshall, solo-cimento e concreto.
- A moldagem foi testada com concreto CNRO (conta), concreto da construtora ou em branco (não conta), solo-cimento (conta) e O.S. cancelada (não conta).
