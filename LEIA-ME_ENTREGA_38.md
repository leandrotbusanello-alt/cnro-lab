# Entrega 38: empresa "Aparece no Campo" (28/10/2026)

Feita sobre o `b25f739` (Entregas 36/37). **Rodar a migração 37** no SQL Editor.

## Para que serve
Algumas empresas são cadastradas só para vincular usuários (lotes da CNRO, ENGEVVIA/fiscalização…)
e não devem aparecer na lista de empresas do pedido no Campo.

## O que muda
- **Cadastros → Empresas → editar:** nova caixa **"Aparece no Campo"** (também na Nova empresa).
  - Marcada: a empresa aparece no Campo (se estiver ativa).
  - Desmarcada: **"Só cadastro"**: continua ativa para usuários, traços, concreteiras e pedidos antigos,
    mas não aparece para novos pedidos no Campo.
- Lista de empresas: selo **"Só cadastro"** e filtro **Ativas / Só cadastro / Inativas / Todas**.
- **Campo:** a lista de empresas do pedido mostra só as **ativas e marcadas** (também sem internet).
  Pedido devolvido para correção mantém a empresa dele, mesmo que ela tenha sido desmarcada depois.
- Concreteiras/Centrais: sem mudança (o Campo já mostra só as ativas cadastradas para a empresa escolhida).
- Quem altera: Laboratório e Gestor, como hoje.

## Banco — `37_empresas_aparece_campo.sql`
- `empresas.aparece_campo boolean not null default true`: **todas as empresas começam marcadas**.
  Nada some do Campo até alguém desmarcar.

## Como aplicar
1. Rodar `supabase/migrations/37_empresas_aparece_campo.sql` no SQL Editor (pode rodar mais de uma vez).
2. Publicar o app (commit/push → Vercel).
3. Cadastros → Empresas: abrir cada empresa que não deve aparecer, desmarcar **Aparece no Campo** e salvar.

## Testado no navegador (PostgREST local)
ENGEVVIA desmarcada pela laboratorista → selo "Só cadastro", filtro "Só cadastro (1)",
e a empresa sai da lista do pedido no Campo; as demais continuam.

## Arquivos
- `supabase/migrations/37_empresas_aparece_campo.sql` (novo)
- `src/modules/campo/useCampo.js`, `src/modules/campo/components/NovoPedidoForm.jsx`
- `src/modules/gestor/gestorRepo.js`, `src/modules/gestor/components/ModalEmpresa.jsx`, `EmpresasView.jsx`
