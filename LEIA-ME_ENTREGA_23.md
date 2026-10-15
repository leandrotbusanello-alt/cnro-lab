# Entrega 23: camada "Base Reciclada" (15/10/2026)

O pacote é **cumulativo** (Entregas 18 a 23, sobre o `99e5481`). **Não tem SQL.**

## Como aplicar
Extraia o zip na pasta do projeto, substituindo os arquivos, e rode `git add -A` → `git commit -m "feat: camada Base Reciclada (entrega 23)"` → `git push`.
Se a Entrega 22 ainda não subiu, siga também o `LEIA-ME_ENTREGA_22.md` (os SQL 23a–23d da FR-IMOB-55 rodam depois do deploy).

## O que muda
A opção **Base Reciclada** entra nas listas de camada dos **ensaios de solo** do Campo (não entra nos Ensaios especiais in loco):
- **Solos e granulares:**
  - Jazida ("Camada de aplicação");
  - Caixa de empréstimo;
  - Segmento;
  - CPs de solo-cimento (moldagem).

  Nesses formulários ela entra logo depois de "Base Melhorada".
Os pedidos já lançados não mudam.

## Testes
- Build e lint ok.
- No navegador, a lista de camada de CPs de solo-cimento, Segmento e Jazida termina em "… Base | Base Melhorada | Base Reciclada".
