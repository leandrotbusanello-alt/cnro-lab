# Entrega 36: "Sair" encerra só a sessão do aparelho (28/10/2026)

Feita sobre o `26568ba` (Entrega 35). Sem SQL.

## Problema
Várias pessoas usando o mesmo login caíam do sistema sem motivo aparente.
O botão **Sair** chamava o logout do Supabase sem dizer o alcance, e o padrão do Supabase é
**encerrar todas as sessões daquela conta, em todos os aparelhos**. Cada vez que alguém saía,
os outros que usavam o mesmo login eram derrubados na próxima renovação do acesso (até ~1 h depois).

## O que muda
`src/store/authStore.js`: os três logouts passam a usar `signOut({ scope: 'local' })`:
- botão **Sair**;
- usuário inativado pelo Gestor (verificação a cada 1 minuto);
- login válido mas sem perfil utilizável.

Agora cada um encerra só a sessão do próprio aparelho.
O bloqueio de quem é inativado continua igual: o banco recusa o acesso e a verificação de 1 minuto tira a pessoa do sistema.

## Arquivos
- `src/store/authStore.js`
