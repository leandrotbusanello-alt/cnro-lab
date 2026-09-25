# Módulo Assistente + fichas online — instalação

> CNRO Lab Control · pacote de 2026-09-24

## 1. O que vem no pacote

| Arquivo | O que é |
|---|---|
| `supabase/migrations/13_modulo_assistente.sql` | Migração do banco (**rodar depois da 12 do Módulo Gestor**) |
| `supabase/migrations/13b_fichas_modelo_carga.sql` | Carga das fichas online FR-IMOB-13, 22, 33 e 50 (gerada pelo conversor) |
| `src/modules/assistente/**` | **Novo.** Fila do assistente e execução do ensaio na ficha online |
| `src/modules/fichas/**` | **Novo.** Motor de fichas (fórmulas do Excel, formatação), ficha na grade, visão em lista, assinatura, impressão A4 e foto de apoio. É usado pelo Assistente e pelo Laboratório |
| `src/modules/laboratorio/components/RevisaoFicha.jsx` + `.module.css` | **Novo.** Revisão da ficha online pelo laboratorista (corrige, assina como calculista e aprova) |
| `src/modules/laboratorio/*` (outros) | A revisão abre a ficha online; o executor vem dos módulos do usuário; a lista de fichas marca quais já estão online |
| `src/modules/campo/*` | Correções da seção 14, itens 1, 2, 3 e 6 |
| `src/lib/offlineDB.js` | v3: stores novos das fichas e do assistente |
| `src/lib/syncQueue.js` | `enfileirarUnico()`: guarda offline só o último rascunho de cada ficha |
| `src/lib/modulos.js` | **Novo.** `modulosDoUsuario()`, com a mesma regra do banco |
| `src/App.jsx` | **Não vem no zip** (o pacote do Gestor também altera): 2 linhas para editar à mão, ver o passo 4 |
| `src/pages/AssistentePage.jsx` | **Apagar** (placeholder substituído) |
| `tools/fichas/**` | Conversor Excel → ficha online, planilhas originais, specs e testes ([guia](tools/fichas/LEIA-ME.md)) |

## 2. Instalação (nesta ordem)

1. **Migração 12 (Módulo Gestor)** precisa estar aplicada.
   A 13 **não** substitui o `tg_usuario_guard` da 12: ela usa um trigger próprio (`a31_usuario_modulos_guard`).
2. **Banco:** no SQL Editor do Supabase, rode `13_modulo_assistente.sql` e depois `13b_fichas_modelo_carga.sql`.
   As duas podem ser rodadas mais de uma vez.
3. **Código:** extraia o zip na raiz do repositório (pode ser antes ou depois do zip do Gestor: nenhum arquivo em comum).
4. **`src/App.jsx`**, 2 edições à mão:
   ```jsx
   // troque a importação do placeholder:
   import AssistentePage from './pages/AssistentePage'
   // por:
   import AssistentePage from './modules/assistente/AssistentePage'

   // e a rota:
   <Route path="assistente" element={<AssistentePage />} />
   // por:
   <Route path="assistente/*" element={<AssistentePage />} />
   ```
   Depois apague `src/pages/AssistentePage.jsx`.

   *Opcional (recomendado): bloquear pela URL os módulos que o usuário não tem.*
   Acrescente o componente abaixo e envolva as rotas, por exemplo
   `<Route path="assistente/*" element={<RequireModulo modulo="assistente"><AssistentePage /></RequireModulo>} />`
   (o mesmo para `campo/*`, `laboratorio/*` e `gestor`):
   ```jsx
   function RequireModulo({ modulo, children }) {
     const { perfil } = useAuthStore()
     if (!(perfil?.modulos_acesso || []).includes(modulo)) return <NotFoundPage />
     return children
   }
   ```
5. `npm run build`, commit e push. A Vercel publica sozinha.

> ⚠️ Rode o SQL **antes** de publicar o código. O Laboratório passa a ler `usuarios.modulos_acesso`,
> e sem a migração a lista de usuários não carrega.

### Depois de instalar
- **Assinaturas:** todos precisam ter `usuarios.assinatura_url` (cadastro pelo Gestor). Sem ela, o assistente não envia e o laboratorista não aprova.
- **Módulos por usuário:** vazio = padrão do perfil. Para liberar os 3 módulos a alguém do campo, por exemplo:
  ```sql
  update usuarios set modulos_acesso = '{campo,laboratorio,assistente}' where email = 'fulano@...';
  ```
  DEV e GESTOR sempre têm todos. Quem tem o módulo **Laboratório** conta como laboratorista nas regras do banco,
  e quem tem o módulo **Assistente** aparece como executor.
- **Ficha × ensaio:** no Laboratório, ao atribuir o ensaio, escolha a ficha marcada **· online**.
  Fichas **· sem ficha online** ainda não podem ser executadas pelo assistente.

## 3. Fluxo

**Assistente (`/assistente`)**
1. **Fila:** mostra os ensaios atribuídos a ele. Os devolvidos vêm primeiro, com o motivo; depois, os atribuídos há mais tempo. A fila se atualiza em tempo real.
2. **Iniciar:** o status vai para `em_andamento`, e a revisão da ficha fica **congelada** no ensaio (uma Rev01 futura não altera ensaios já iniciados).
3. **Preencher** a ficha idêntica ao Excel, na grade ou na visão em lista (celular):
   - as fórmulas calculam enquanto ele digita;
   - o cabeçalho vem do pedido;
   - a **foto de apoio** fica ao lado, só no aparelho, e é apagada ao enviar.
4. **Salvamento automático:** no aparelho a cada alteração e no servidor a cada 20 s.
   Ele pode continuar em outro aparelho. Offline, só o último rascunho vai para a fila.
5. **Assinar:** ele clica em "Responsável executor" e confirma. A ficha **trava** até a assinatura ser removida.
6. **Enviar para revisão:** o ensaio sai da fila e só volta se o laboratorista devolver.
   Na devolução, as assinaturas são apagadas.

**Laboratorista (revisão)**
- Abre a ficha em tela cheia e pode:
  - corrigir qualquer campo e preencher os **Parâmetros**;
  - escolher a **conformidade** e escrever observações;
  - assinar como **Responsável calculista** e **Aprovar**;
  - salvar correções sem aprovar;
  - devolver ao assistente;
  - imprimir ou gerar o PDF em A4.
- Aprovar grava `resultados` + `resultado_*`, uma linha por CP: é o que alimenta o **Painel**.
  Se o ensaio for devolvido depois de aprovado, o resultado sai do Painel.
- Só o módulo Laboratório imprime. Para liberar o assistente no futuro, basta editar `MODULOS_QUE_IMPRIMEM` em `src/modules/fichas/constants.js`.

## 4. O que a migração 13 faz
- `usuarios.modulos_acesso` + funções `modulos_do_usuario()` e `tem_modulo()`. O `authStore` atual já lê
  `modulos_acesso` para montar o menu; com a coluna criada, o que o Gestor marcar passa a valer.
  `eh_lab()` e `eh_equipe_lab()` passam a considerar os módulos.
- Tabela `fichas_modelo`: modelo de cada ficha, **por revisão**, com o mapa para `resultado_*`.
  Mesmas regras da migração 12: leitura só para usuário ativo; escrita só **DEV** (catálogo).
- `ensaios_os`: `ficha_modelo_id`, `iniciado_em`, `rascunho_em`, `enviado_em`, `assinatura_executor` e `assinatura_calculista`.
- **Guarda:** o assistente só altera o próprio ensaio, e somente pelas RPCs. Depois de enviar, fica bloqueado até a devolução.
- **RPCs:**
  - assistente: `iniciar_ensaio`, `salvar_rascunho_ensaio` e `enviar_para_revisao` (exige assinatura cadastrada e ficha assinada);
  - laboratorista: `salvar_revisao_ensaio` e `aprovar_ensaio` (grava os resultados normalizados; só aceita tabelas `resultado_*` existentes).

Testado num Postgres local com todas as migrações e o fluxo completo:
campo → lab → assistente → bloqueios → devolução → correção → aprovação com `resultado_marshall`.

## 5. Fichas online nesta entrega
| Ficha | Fórmulas | Campos | Resultado no Painel |
|---|---|---|---|
| FR-IMOB-13 Marshall | 116 | 109 | `resultado_marshall` (1 linha por CP) |
| FR-IMOB-22 Teor de betume | 6 | 11 | `resultado_teor_betume` |
| FR-IMOB-33 Compressão solo-cimento | 28 | 38 | `resultado_rtcd` (CPs de compressão diametral) |
| FR-IMOB-50 Concreto — compressão | 96\* | 228 | `resultado_compressao_concreto` (1 linha por CP) |

Todas as fórmulas conferem com o Excel e com 3 recálculos independentes no LibreOffice, com valores aleatórios
(`node tools/fichas/testar_motor.mjs --libreoffice`).

\* A FR-IMOB-50 Rev00 não tem fórmulas. As fórmulas vêm da versão anterior (FR-LAB-49):
`MPa = carga (t) ÷ 0,07854 × 0,09807`, válida para CP de 100 mm. A carga em toneladas fica nas colunas W e X,
fora da área de impressão: aparecem **só na tela**.

## 6. Pendências conhecidas
- **Compressão axial do solo-cimento (FR-IMOB-33):** não há tabela `resultado_*` própria. Por enquanto, fica só na ficha (`dados_resultado`).
- **Calibração da prensa** (FR-IMOB-13, `0,9905x + 4,7547`) e **área do CP** (FR-IMOB-50, `0,07854`) estão fixas nas fórmulas.
  Elas vão para o futuro módulo de equipamentos.
- **Repositório:** `node_modules/` continua versionado (seção 14, item 9). Para remover: `git rm -r --cached node_modules`.
