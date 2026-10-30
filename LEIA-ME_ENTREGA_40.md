# Entrega 40: arquivos da O.S., resumo para o Campo, ficha padrão e textos resumidos (29/10/2026)

Feita sobre o `694416f` (Entrega 39). **Rodar a migração 38** no SQL Editor.

## 1. 🗂 Gerar arquivos da O.S.
- Botão em **Documentos** do pedido, só com a **O.S. finalizada**, para o **laboratorista responsável e o Gestor**.
- Abre **uma única tela de impressão** com, nesta ordem:
  1. FR-IMOB-05;
  2. FR-IMOB-04;
  3. as fichas dos ensaios **aprovados**, com as folhas adicionais e as assinaturas;
  4. o resumo para o Campo, com a opção "Incluir o resumo".
- Cada documento sai na sua orientação (retrato ou paisagem).
- Imprimir ou **Salvar como PDF** gera um arquivo só.

## 2. 📊 Resumo para o Campo
- **Um arquivo por O.S.**: imagem (PNG/JPG) ou PDF, até 5 MB. Imagens grandes são reduzidas automaticamente.
- **Quem anexa, troca e exclui:** o laboratorista responsável e o Gestor (no histórico: quem tem a permissão).
- **Onde fica:** na seção "Resumo para o Campo" do pedido, a partir da O.S. gerada.
- **O Campo vê:** só o solicitante, em "Meus pedidos", **junto com os resultados**, depois que algum ensaio da O.S. foi liberado.
- Entra no "Gerar arquivos da O.S.". Se for PDF, aparece um aviso para baixar e imprimir junto.

## 3. Ficha padrão de cada ensaio
- A O.S. já nasce com a ficha de cada ensaio, e o "+ Adicionar ensaio" também. O laboratorista só escolhe o executor e ainda pode trocar a ficha.
- Vale para as **O.S. novas**. As já geradas não mudam.
- Ficha por ensaio:

| Ensaio | Ficha |
|---|---|
| Rice | FR-IMOB-10 |
| Equivalente de areia | FR-IMOB-08 |
| Viscosidade | FR-IMOB-28 |
| Penetração, ponto de fulgor, ponto de amolecimento, recuperação elástica, ductilidade | FR-IMOB-14 (polímero); FR-IMOB-15 se o ligante for borracha; FR-IMOB-18 se for 30/45 ou TLA |
| Conferência de espessuras (asfalto e solo) | FR-IMOB-38 |
| Extração de betume (Rotarex/Soxhlet) | FR-IMOB-22 |
| Marshall | FR-IMOB-13 |
| Dano por umidade | FR-IMOB-17 |
| Granulometria | FR-IMOB-34 (solos); FR-IMOB-53 (agregados); FR-IMOB-54 (massa asfáltica) |
| Compactação de amostras não trabalhadas | FR-IMOB-55 |
| Compactação de amostras trabalhadas | FR-IMOB-32 |
| Massa específica in situ | FR-IMOB-35 |
| Resistência à tração | FR-IMOB-33 |
| Viga Benkelman | FR-IMOB-29 |
| Massa específica de agregado graúdo / miúdo | FR-IMOB-06 / FR-IMOB-07 |
| Compressão axial | FR-IMOB-50 (concreto); FR-IMOB-33 (CPs de solo-cimento) |
| Módulo de resiliência | FR-IMOB-51 (solo-cimento); FR-IMOB-52 (solos) |
| Mancha de areia / pêndulo britânico / densímetro | FR-IMOB-30 / FR-IMOB-49 / FR-IMOB-57 |

- Sem ficha padrão (o laboratorista escolhe): Caracterização de material asfáltico, Teor de umidade, Fadiga, Deformação permanente e Módulo de resiliência de asfalto.
- Para mudar uma ficha padrão: `update ensaios set ficha_padrao_id = (select id from fichas_ensaio where codigo='FR-IMOB-xx') where codigo_frimob04 = 'ens_...';`

## 4. Observação da FR-IMOB-04 e da FR-IMOB-05
- **FR-IMOB-05 sem observação: corrigido.** Quando a FR-05 era salva antes de gerar a O.S., ela nascia sem o texto, e o Gerar O.S. não preenchia depois. Agora as duas fichas recebem o texto padrão sempre que a observação estiver vazia.
- **Texto resumido**, para qualquer tipo de pedido:
  - 3 ou mais pontos: "DO KM 120,000 AO KM 135,500", em vez de listar todos;
  - CPs: "05 CORPOS DE PROVA…". Se a numeração for sequencial, sai "CPs 101 A 106". Se não for, os CPs não são listados (eles já estão no Detalhar demanda);
  - datas: "NO DIA x", "NOS DIAS x E y" ou "ENTRE OS DIAS x E y".
- **Fichas antigas:** a migração atualiza a observação da FR-04 e da FR-05 **que ninguém editou à mão** (iguais ao texto que o sistema gerou, ou vazias). As editadas à mão ficam como estão.

## 5. Cabeçalho das fichas de ensaio
- **Procedência do material:**
  - jazida, caixa de empréstimo e segmento: nome da **jazida**;
  - agregados: nome da **pedreira**;
  - concreto: **concreteira/central**;
  - demais: a **empresa**.
- **Informações complementares:**
  - só a data e o trecho, por exemplo "DATA DA COLETA: 10/02/2026 · KM 120,000 AO KM 135,500";
  - no concreto, continua "CPs 101 A 106 | VIGA…";
  - a observação do pedido não entra mais aqui. Ela continua no pedido e na FR-04/05.
- O texto é montado na hora, então vale para todas as fichas quando forem abertas ou reimpressas. O que o assistente digitou à mão nessas células continua valendo.

## Banco: `38_os_arquivos_ficha_padrao_obs.sql`
- **Ficha padrão:**
  - coluna `ensaios.ficha_padrao_id`;
  - funções `_ficha_codigo` e `_ficha_padrao(pedido, ensaio)`, que tratam as regras por material e por tipo de ligante;
  - gatilho `a05_ensaio_os_ficha_padrao`, antes de incluir o ensaio na O.S.
- **Observação:**
  - `_obs_kms` e `_obs_cps` resumidos, mais a nova `_obs_quando`;
  - `gerar_observacao_os` com a quantidade de CPs do concreto e as datas resumidas;
  - gatilhos `a20_fichas_os_observacao` e `a20_fichas_sol_observacao` para observação vazia;
  - atualização das fichas não editadas.
- **Resumo:**
  - tabela `os_resumos`, com RLS (`_pode_gerir_resumo`, `_resumo_visivel`);
  - bucket privado `resumos` (`<pedido_id>/<arquivo>`), com as políticas de leitura, envio e exclusão.

## Testes
- **Banco:** `supabase/testes/B0_testes_m38.sql`, 17 verificações, todas ok. Também conferido num banco com O.S. antigas:
  - a FR-05 vazia passou a ter a observação;
  - "KM 120,000; KM 135,500; KM 128,000…" virou "DO KM 120,000 AO KM 135,500".
- **Navegador (PostgREST local):**
  - O.S. finalizada → botão "Gerar arquivos da O.S." → PDF de 7 páginas: FR-05, FR-04, ficha em retrato (2 páginas), ficha em paisagem (2 páginas) e o resumo;
  - anexar, trocar e excluir o resumo;
  - o solicitante vê "📊 Resumo dos resultados da O.S." em Meus pedidos.

## Como aplicar
1. Rodar `supabase/migrations/38_os_arquivos_ficha_padrao_obs.sql` no SQL Editor. Pode rodar mais de uma vez.
2. Publicar o app (commit e push → Vercel).

## Arquivos
- **Novos:**
  - `supabase/migrations/38_os_arquivos_ficha_padrao_obs.sql`, `supabase/testes/B0_testes_m38.sql`
  - `src/lib/resumoOS.js`
  - `src/modules/laboratorio/components/ArquivosOS.jsx` e `.module.css`
  - `src/modules/laboratorio/components/ResumoOS.jsx` e `.module.css`
- **Alterados:**
  - `src/modules/laboratorio/components/PedidoDetalhe.jsx`, `EnsaiosOS.jsx`, `fichas/FichaDocumento.jsx`
  - `src/modules/laboratorio/useLaboratorio.js`
  - `src/modules/fichas/camposPedido.js`, `src/modules/fichas/components/ImpressaoFicha.jsx`
  - `src/modules/campo/components/EnsaiosDoPedido.jsx`, `MeusPedidos.module.css`
