# Entrega 26: auditoria enxuta + painel de uso do banco (19/10/2026)

O pacote é **cumulativo** (Entregas 18–23, 25 e 26, sobre o `99e5481`). A Entrega 26 é **só SQL**: o app não muda, não precisa de commit/deploy por causa dela.

## Como aplicar
1. No SQL Editor, rode `supabase/migrations/26_auditoria_enxuta.sql`. A partir daí, a auditoria nova já sai enxuta.
2. **Opcional (recomendado):** numa aba nova, rode `26b_limpeza_auditoria_antiga.sql`. Ele aplica as mesmas regras ao que já foi gravado.
3. Depois do 26b, numa aba nova e **sozinho**, rode:
   ```sql
   vacuum full public.audit_log;
   ```
   Sem isso, o espaço liberado fica reservado para a própria tabela e não aparece como redução no tamanho do banco.
4. Confira: `select * from public.painel_uso_banco();`

> Dica: desligue a tradução automática do navegador no Supabase. Ela troca palavras do SQL ("select" → "selecione") e a consulta quebra.

## O que muda na auditoria
| Situação | Antes | Agora |
|---|---|---|
| Salvamento automático do rascunho (a cada 20 s digitando) | 2 cópias completas do ensaio, com a ficha inteira | **não grava** |
| Linha nova no histórico do pedido | 2 cópias completas do pedido, com o histórico inteiro | **não grava** (o histórico do pedido já é o registro) |
| Iniciar, enviar, aprovar, devolver, trocar ficha, atribuir, corrigir na revisão, editar pedido | 2 cópias completas | **só as colunas que mudaram**, com o valor antes e depois |
| Cadastro (INSERT) e exclusão (DELETE) | cópia completa | igual: cópia completa |

Continua registrado quem fez, quando e em nome de quem. O preenchimento antigo da ficha, na troca de ficha ou na exclusão, continua guardado.
Corrigir a ficha fora do rascunho (por exemplo, na revisão) continua auditado.

**Teste local:** a auditoria de teste caiu de 737 kB para 222 kB (−70%), e a tabela de 1.072 kB para 280 kB depois do `vacuum full`.
Num ensaio iniciado e salvo 3 vezes, ficou 1 registro (o de iniciar) em vez de 7.

## Painel de uso (conferência mensal)
`select * from public.painel_uso_banco();` mostra, numa consulta só:
1. o tamanho do banco e o % do limite do plano Free (500 MB);
2. as 8 maiores tabelas (tamanho e nº de linhas);
3. a auditoria por dia nos últimos 30 dias;
4. pedidos e ensaios por mês (últimos 6 meses);
5. os arquivos do Storage por pasta (limite Free de 1 GB).

Só funciona no SQL Editor: os usuários do sistema não têm acesso.
A rotina mensal está no documento do projeto `CNRO_Lab_Monitoramento_Banco.md`.
