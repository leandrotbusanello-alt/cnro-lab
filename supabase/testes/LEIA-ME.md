# Testes do banco (PostgreSQL local, não rodar no Supabase)

1. `00_base_supabase.sql`: simula o Supabase (auth, storage, papéis) e cria as tabelas anteriores à migração 10.
2. Rodar as migrações 10, 11, 12, 13, 13b e 14.
3. `20_testes_m14.sql`: testes da migração 14. Cada linha `ok` é uma verificação; qualquer falha interrompe com `FALHOU`.
