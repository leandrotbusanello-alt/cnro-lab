# Entrega 28: contagem — caracterização de ligante por ensaio (20/10/2026)

O pacote é **cumulativo**: traz as Entregas 18–23, 25, 26, 27 e 28. A Entrega 28 é **só SQL**.

## Como aplicar
No SQL Editor, rode `supabase/migrations/28_contagem_ligante.sql`. Pode rodar de novo sem problema.

## O que muda
Na contagem por atividade (`contagem_atividades`), a **Caracterização de ligante** deixa de contar 1 por ficha. Agora conta **cada ensaio executado**:
- **CAP modificado (FR-IMOB-14/15):** penetração, ponto de amolecimento, recuperação elástica, RTFOT, viscosidade Brookfield e separação de fase. Máximo de 6.
- **CAP 30/45 (FR-IMOB-18):** penetração, ponto de amolecimento, RTFOT, viscosidade e ponto de fulgor. Máximo de 5.

Antes e depois do envelhecimento contam juntos: a penetração conta 1, mesmo medida nas duas etapas. As 3 temperaturas da viscosidade também contam 1.

**Conferido nesta entrega (sem mudança de regra):**
- Solo-cimento: são 8 CPs rompidos (axial e diametral, 7 e 28 dias), e a moldagem também conta.

O arquivo `27_contagem_atividades.sql` do pacote já vem com a regra nova, para o caso de um banco novo. No seu banco, basta rodar a 28.
