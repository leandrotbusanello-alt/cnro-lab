# Entrega 25: cadastro de equipamentos (taras) + FR-IMOB-55 e FR-IMOB-34 usando o cadastro (15/10/2026)

O pacote é **cumulativo**: traz as Entregas 18 a 23 e a 25, sobre o `99e5481`.
A Entrega 24 (lançamento histórico no Campo) **foi descartada** a pedido e não está aqui.

## Como aplicar (nesta ordem)
1. **SQL, antes do app:** rode no SQL Editor `supabase/migrations/24_equipamentos_taras.sql`. Ele cria o cadastro e já carrega as cápsulas 1–77 e os cilindros 1–26.
2. **App:** extraia o zip na pasta do projeto, substitua os arquivos e rode `git add -A` → `git commit -m "feat: cadastro de equipamentos (taras) + FR-55/FR-34 (entrega 25)"` → `git push`.
3. **Depois do deploy**, rode os SQL das fichas, um por vez, cada um numa aba nova, nesta ordem:
   - `25a_FR-IMOB-55_parte1.sql`, `25b_FR-IMOB-55_parte2.sql`, `25c_FR-IMOB-55_parte3.sql`, `25d_FR-IMOB-55_parte4.sql`
   - `25e_FR-IMOB-34.sql`

   **Os 25a–25d substituem os 23a–23d.** Se você ainda não rodou os 23, pule-os. Se já rodou, rode os 25 assim mesmo: a ficha é atualizada no lugar.
4. Recarregue a página (F5).

Todos os SQL podem ser rodados de novo sem problema. Conferência (opcional):
```sql
select f.codigo, m.versao, m.hash from fichas_modelo m join fichas_ensaio f on f.id = m.ficha_ensaio_id
where f.codigo in ('FR-IMOB-55','FR-IMOB-34') order by f.codigo, m.publicado_em desc;
-- FR-IMOB-34 Rev00.1 d6837bdd36029f59 · FR-IMOB-55 Rev00.1 92b4cfeb5c9782c6
select tipo, count(*) from equipamentos_tara group by tipo;   -- capsula 77 · cilindro 26
```

## O que muda
### Cadastros → Equipamentos
- **Cápsulas:** nº e peso (g). **Cilindros:** nº, peso (g), volume (cm³) e altura (mm).
- A identificação é **só pelo número**.
- **Laboratorista e Gestor** cadastram e alteram. Não há exclusão: desative o equipamento, e as fichas deixam de encontrar aquele número.
- **Histórico:** cada cadastro ou alteração fica registrado, com quem fez, quando, o valor antigo e o novo (botão 🕘 Histórico).
- **Carga inicial:** a tabela de taras da FR-IMOB-55, só os equipamentos que existem (cápsulas 1–77 e cilindros 1–26).
- **Cápsula 77:** a planilha tinha dois pesos, 33,49 g e 6,96 g. Ela entrou com **33,49 g** e a observação "Conferir peso". Depois de pesar, corrija o peso e apague a observação.
- O número não muda. Para trocar o número, desative o equipamento e cadastre outro.

### Fichas
- **FR-IMOB-55:** a cápsula e o cilindro digitados pelo número buscam peso, volume e altura no cadastro.
- **FR-IMOB-34:** o **peso da cápsula** (umidade) deixa de ser digitado e vem pelo nº da cápsula. A ficha passa a ser a Rev00.1 no sistema.
- **Valor congelado:** quando o assistente preenche, a ficha guarda uma **cópia do cadastro**. Se a cápsula for recalibrada depois, o ensaio já feito não muda.
- Na barra da ficha aparece "⚖️ Taras do cadastro de equipamentos (cópia de dd/mm hh:mm)".
- **Ensaios antigos** (sem cópia) continuam com a tabela que já estava na ficha.
- Número que não está no cadastro aparece como **#N/D**, como na planilha.
- Ensaios FR-34 já iniciados continuam na Rev00, com o peso digitado.

## Testes feitos
- **Banco:** a migração 24 rodou duas vezes em duas bases, carregou 77 cápsulas e 26 cilindros, criou o histórico e registra cada alteração.
- **Motor:**
  - os resultados da FR-55 com a cópia do cadastro são iguais aos sem cópia, nos exemplos reais (Rev00 e planilha antiga);
  - recalibrar a cápsula 6 muda só a cópia nova;
  - a cápsula 150, que não existe, dá #N/D;
  - a cópia vai para `dados_resultado`;
  - FR-34: as cápsulas 7 e 12 trazem 34,90 g e 32,30 g;
  - LibreOffice: FR-34 31/31 e FR-55 1571/1571 fórmulas iguais nas rodadas.
- **SQL das fichas:** rodou duas vezes em duas bases, o modelo gravado é igual ao gerado e a Rev00.1 fica vigente.
- **Navegador:**
  - Laura vê a aba Equipamentos com 77 cápsulas (a 77 com o aviso) e 26 cilindros;
  - altera a cápsula 7 de 34,90 para 35,10 e o histórico mostra a troca;
  - um número repetido é recusado;
  - Ana inicia a FR-55 e vê o aviso da cópia; a cápsula 7 traz 35,10 g, e a cópia fica gravada no ensaio.
- Build ok. O lint não mostra erros.

## Próximos passos (para aprovar)
- **Pré-preenchimento das fichas pelo pedido:** o mapeamento ficha a ficha está no documento do projeto `CNRO_Lab_Preenchimento_Fichas_pelo_Pedido.md`, com 6 perguntas.
- **Outras fichas com cápsula ou cilindro digitados** que podem usar o cadastro: FR-IMOB-32 e FR-IMOB-35.
