# Testes do banco (PostgreSQL local, não rodar no Supabase)

1. `00_base_supabase.sql`: simula o Supabase (auth, storage, papéis) e cria as tabelas anteriores à migração 10.
2. Rodar as migrações 10, 11, 12, 13, 13b e 14.
3. `20_testes_m14.sql`: testes da migração 14. Cada linha `ok` é uma verificação; qualquer falha interrompe com `FALHOU`.
   Depois da migração 16 os números têm 3 dígitos: nas verificações, `0001`, `0350`… passam a ser `001`, `350`….
4. `40_catalogo_real.sql` e depois a migração 15; `50_testes_m15.sql`: testes da migração 15.
5. `60a_pre_m16.sql` (cria um pedido no formato antigo), a migração 16 e `60b_testes_m16.sql`:
   conversão dos números, textos da observação por tipo de amostra, previsão +60 dias, contato e Alterar nº.
