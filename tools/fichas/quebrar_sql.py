"""Quebra literais SQL longos em pedaços concatenados ('...' || '...'), cada um numa linha curta.
O SQL Editor do Supabase corta linhas muito longas (erro "unterminated quoted string")."""
import sys, re
TAM = 2000
def literais(linha):
    # devolve lista de (inicio, fim) dos literais '...' (com '' escapado)
    out, i, n = [], 0, len(linha)
    while i < n:
        if linha[i] == "'":
            j = i + 1
            while j < n:
                if linha[j] == "'":
                    if j + 1 < n and linha[j + 1] == "'": j += 2; continue
                    break
                j += 1
            out.append((i, j)); i = j + 1
        else:
            i += 1
    return out
def quebrar(lit):            # lit inclui as aspas
    corpo = lit[1:-1]; partes = []; k = 0
    while k < len(corpo):
        f = min(len(corpo), k + TAM)
        # não cortar no meio de um '' (aspas escapadas): conta aspas seguidas antes do corte
        while f < len(corpo) and corpo[f - 1] == "'" and (len(corpo[k:f]) - len(corpo[k:f].rstrip("'"))) % 2 == 1:
            f += 1
        partes.append("'" + corpo[k:f] + "'"); k = f
    return '(' + '\n  || '.join(partes) + ')'
for arq in sys.argv[1:]:
    novas = []
    for linha in open(arq, encoding='utf-8').read().split('\n'):
        if len(linha) <= 4000: novas.append(linha); continue
        res, ult = [], 0
        for a, b in literais(linha):
            if b - a + 1 > 4000:
                res.append(linha[ult:a]); res.append(quebrar(linha[a:b + 1])); ult = b + 1
        res.append(linha[ult:]); novas.append(''.join(res))
    txt = '\n'.join(novas)
    open(arq, 'w', encoding='utf-8').write(txt)
    print(arq, 'maior linha:', max(len(l) for l in txt.split('\n')))
