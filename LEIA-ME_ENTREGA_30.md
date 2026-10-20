# Entrega 30: reabrir O.S. finalizada (20/10/2026)

O pacote é **cumulativo**: traz as Entregas 18–23, 25 a 30, sobre o `99e5481`.

## Como aplicar (nesta ordem)
1. **SQL, antes do app:** rode no SQL Editor `supabase/migrations/30_reabrir_os.sql`. Pode rodar de novo sem problema.
2. **App:** extraia o zip na pasta do projeto, substitua os arquivos e rode `git add -A` → `git commit -m "feat: reabrir O.S. finalizada (entrega 30)"` → `git push`.
3. Recarregue a página (F5).

## Como funciona
**Laboratorista responsável:**
1. Na O.S. finalizada, clica em **"🔓 Solicitar reabertura"** e informa o motivo, que é obrigatório.
2. A O.S. passa a mostrar o selo "Reabertura solicitada" e o aviso "aguardando o Gestor".

**Gestor:**
- No **Módulo Laboratório**, um aviso acima das abas lista as O.S. aguardando autorização, com link para cada uma.
- Dentro da O.S., escolhe **"✓ Autorizar reabertura"** (o motivo do laboratorista já vem preenchido) ou **"✕ Recusar"** (com motivo).
- Também pode reabrir direto, sem pedido, pelo botão **"🔓 Reabrir O.S."**.
- **Lançamento histórico:** só o DEV reabre.

**Com a O.S. reaberta** (selo "🔓 Reaberta", com o aviso e o motivo):
- **A finalização anterior é desconsiderada:** a assinatura e a data de finalização são apagadas, e a O.S. precisa ser **finalizada e assinada de novo**. A FR-IMOB-04 é gerada na hora, então sai sempre uma só versão, a atual.
- **Ensaios:** os aprovados continuam aprovados. O laboratorista pode devolver ou revisar um ensaio específico. Os resultados continuam visíveis ao campo.
- **✏️ Editar pedido:** empresa, lote, material, subcategoria, observações, informações gerais e amostras.
  - Os ensaios continuam sendo ajustados na lista de ensaios da O.S.
  - Empresa e lote também passam para a FR-IMOB-04 e a FR-IMOB-05, a não ser que o campo tenha sido mudado à mão na ficha.
  - O Gestor também pode editar; ao fazer isso, não vira o responsável.
- **📅 Datas da O.S.:** data da solicitação e data da O.S.
  - **O número da O.S. muda junto com a data**, mantendo lote e sequencial, no pedido e na FR-IMOB-04.
  - A data da solicitação não pode mudar de ano, porque o ano faz parte do nº do PE. Esse caso continua sendo pelo "Alterar nº" do DEV.
- **📅 Datas** em cada ensaio: atribuição, início, envio e aprovação. As datas das assinaturas na ficha e as datas do resultado acompanham. O sistema confere a ordem das datas e não aceita data no futuro.
- **Histórico:** tudo é registrado — pedido, recusa, reabertura (com a finalização desconsiderada), datas anteriores e novas, e as edições.

Fora da reabertura, tudo continua travado como antes.

## Teste
O fluxo completo foi testado na O.S. 2026.09.28.03.1030:
1. Laura pediu a reabertura, Gil recusou, Laura pediu de novo e Gil autorizou.
2. A data da O.S. mudou e o nº foi para 2026.09.29.03.1030, também na FR-04. A tentativa de mudar o ano da solicitação foi recusada, como esperado.
3. As datas do ensaio mudaram, e as assinaturas e o resultado acompanharam. O lote passou a "Lote 4" também na FR-04.
4. A O.S. foi finalizada de novo, e o histórico registrou cada etapa.
