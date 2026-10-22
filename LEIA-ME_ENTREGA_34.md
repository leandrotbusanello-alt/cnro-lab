# Entrega 34: FR-IMOB-46 com 3 casas em todas as linhas + assinaturas maiores (21/10/2026)

O pacote é **cumulativo**: Entregas 18–23 e 25 a 34.

## Como aplicar (nesta ordem)
1. **App:** extraia o zip na pasta do projeto, substitua os arquivos e rode `git add -A` → `git commit -m "fix: FR-46 3 casas + assinaturas (entrega 34)"` → `git push`.
2. **Depois do deploy**, no SQL Editor, rode **um por vez**, cada um numa aba nova, nesta ordem:
   - `supabase/migrations/33a_FR-IMOB-46_formatos_parte1.sql`
   - `supabase/migrations/33b_FR-IMOB-46_formatos_parte2.sql`
3. Recarregue a página (F5).

A ficha é atualizada no lugar (mesma Rev01). As FR-46 já lançadas passam a mostrar 3 casas sem precisar refazer nada. Conferência (opcional):
```sql
select m.versao, m.hash from fichas_modelo m join fichas_ensaio f on f.id = m.ficha_ensaio_id
where f.codigo = 'FR-IMOB-46';   -- Rev01 · 635b236122ce63dd
```

## O que muda
1. **FR-IMOB-46, colunas Gmbl (densidade relativa aparente de projeto) e Gmm (densidade relativa máxima medida):**
   - mostram **3 casas decimais em todas as 21 linhas**;
   - na planilha-mestre, as linhas 26 a 39 estavam formatadas com 2 casas. Era só a exibição: os cálculos sempre usaram o valor inteiro.
2. **Assinaturas na ficha (todas as fichas):**
   - a assinatura passa a ocupar também o espaço vazio logo acima do campo "Responsável…", sem cobrir texto nem campos;
   - a altura fica entre 36 e 80 px (antes, 36 a 60 px, limitada pela altura do próprio campo);
   - na FR-IMOB-46, ela fica cerca de duas vezes maior;
   - nas fichas em que não há espaço vazio acima, continua como estava.
