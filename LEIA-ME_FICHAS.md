# Fichas FR-IMOB-04 e FR-IMOB-05 — atualização

## Instalação
1. **Banco:** no SQL Editor do Supabase, rode `supabase/migrations/11_fichas_os_solicitacao.sql`
   (a migração 10 precisa já ter sido rodada). Pode rodar mais de uma vez.
2. **Código:** extraia o zip na raiz do projeto, substituindo os arquivos, e **apague a pasta**
   `src/modules/laboratorio/components/impressao/` (substituída por `components/fichas/`).
3. `npm run dev` para testar → commit → push.

## O que mudou
- As fichas reproduzem o layout das planilhas Rev00 (cabeçalho com logo Nova Rota, barras azul-marinho,
  Tahoma, valores em azul, solicitante/contato em vermelho, Elaborado/Revisado/Aprovado).
- **Editáveis na tela**, como no sistema antigo, pelo laboratorista responsável:
  - FR-IMOB-04: datas (início, fim, análise, previsão, entrega, repactuação + motivo), obra, lote,
    solicitante, contato, Especificação (11 itens), Detalhar ensaios (Asfalto / Solos e Agregados / Concreto)
    e observação. O **Indicador** é calculado como na planilha (entrega ≤ previsão ou repactuação).
  - FR-IMOB-05: obra, lote, solicitante, contato, tipo de solicitação (4 opções), localizações
    (3 blocos × 15 linhas: Km | Pista N/S | Trilho de roda) e observação.
- Enquanto a ficha não foi salva, os ensaios do pedido já vêm **marcados automaticamente** em "Detalhar ensaios"
  (ensaio sem correspondência marca "Outros"), e as localizações vêm das amostras.
- Botões **Salvar ficha**, **Imprimir / PDF** (uma página A4) e **Fechar** (avisa se houver alteração não salva).
- FR-IMOB-05 pode ser editada antes da O.S. (quem salva vira o responsável pelo pedido).
  FR-IMOB-04 só depois de gerar a O.S. O.S. finalizada: somente leitura.
- Funciona offline (entra na fila de sincronização).
- Migração 11: funções `salvar_ficha_solicitacao` e `salvar_ficha_os` (com as mesmas regras de permissão),
  "Obra" passa a vir do nome do consórcio e a observação da FR-IMOB-05 usa o texto padrão da O.S.
