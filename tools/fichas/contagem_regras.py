#!/usr/bin/env python3
"""
Regras da contagem de ensaios por atividade (decisões de 20/10/2026 —
doc do projeto `CNRO_Lab_Contagem_por_Atividade.md`).

Lê os modelos gerados (saida/*.modelo.json), monta as "unidades" de cada ficha
(CP, determinação, ponto, furo, cilindro…) e grava o SQL da carga da tabela
public.contagem_regras. Uma unidade conta quando QUALQUER célula dela tem valor
em dados_resultado.entradas.

Só entram como célula-chave as entradas numéricas de medição: ficam de fora
textos, datas, "nº" (CP nº, cápsula nº, cilindro nº), "constante" e "km" —
são dados que podem vir preenchidos do pedido sem o ensaio ter sido feito.

  python3 contagem_regras.py            → imprime o resumo
  python3 contagem_regras.py --sql ARQ  → grava o bloco de carga (insert) em ARQ
"""
import glob, json, re, sys
from pathlib import Path

SAIDA = Path(__file__).parent / 'saida'
EXCL = re.compile(r'(n[º°]\s*$|constante|\bkm\b|cp n[º°])', re.I)
FORA = re.compile(r'^(Identifica|Equipamentos|Pontos de verifica|Observa|Dados d|Tens|Modelo|'
                  r'Temperaturas|Resultados|Umidade|Toler|Faixa e|Graduações|Variação)', re.I)


def modelo(cod):
    fs = sorted(SAIDA.glob(cod + '_Rev*.modelo.json'))
    if not fs:
        raise SystemExit(f'modelo não encontrado: {cod}')
    return json.loads(fs[-1].read_text())['modelo']


def _split(a):
    m = re.match(r'^(?:(\w+)!)?([A-Z]+)(\d+)$', a)
    return m.group(1), m.group(2), int(m.group(3))


def _faixa(lst):
    if isinstance(lst, (str, int)):
        lst = [lst]
    out = set()
    for x in lst:
        s = str(x)
        if '-' in s:
            a, b = map(int, s.split('-'))
            out |= set(range(a, b + 1))
        else:
            out.add(int(s))
    return out


def grupos(m):
    """[(titulo, [células de entrada])] — grupos com {n} viram um grupo por coluna."""
    cells = dict(m['cells'])
    for ab in m.get('abas') or []:
        for a, v in ab['cells'].items():
            cells[ab['id'] + '!' + a] = v
    ent = {a: v for a, v in cells.items() if v.get('role', {}).get('tipo') == 'entrada'}
    res = []
    listas = [(None, m.get('lista'))] + [(ab['id'], ab.get('lista')) for ab in (m.get('abas') or [])]
    for aba, lista in listas:
        if not lista:
            continue
        pre = (aba + '!') if aba else ''
        for g in lista['grupos']:
            if 'celulas' in g:
                cs = [c if '!' in c else pre + c for c in g['celulas']]
                res.append((g['titulo'], [c for c in cs if c in ent]))
            elif 'colunas' in g:
                rows = _faixa(g['linhas']) if 'linhas' in g else None
                for i, col in enumerate(g['colunas']):
                    cs = [a for a in ent if _split(a)[0] == aba and _split(a)[1] == col
                          and (rows is None or _split(a)[2] in rows)]
                    res.append((g['titulo'].replace('{n}', str(i + 1)), sorted(cs, key=lambda a: _split(a)[2])))
            elif 'linhas' in g:
                rows = _faixa(g['linhas'])
                cs = [a for a in ent if _split(a)[0] == aba and _split(a)[2] in rows]
                res.append((g['titulo'], cs))
    return res, ent


def chave(ent, a):
    r = ent[a]['role']
    return r.get('dado') == 'numero' and not EXCL.search(r.get('rot') or r.get('rl') or '')


def unidades(cod, titulo=None, rotulo=None):
    """Uma unidade por grupo da lista (fora identificação etc.), só células-chave.
    titulo: regex do título do grupo · rotulo: regex do rótulo da célula."""
    gs, ent = grupos(modelo(cod))
    out = []
    for t, cs in gs:
        if FORA.match(t) or (titulo and not re.search(titulo, t, re.I)):
            continue
        k = [a for a in cs if chave(ent, a)
             and (not rotulo or re.search(rotulo, ent[a]['role'].get('rot') or ent[a]['role'].get('rl') or '', re.I))]
        if k:
            out.append(k)
    return out


def por_ensaio(cod, ensaios):
    """Uma unidade por tipo de ensaio: {nome: regex do rótulo}. Junta antes/após o envelhecimento."""
    _, ent = grupos(modelo(cod))
    out = []
    for nome, rx in ensaios.items():
        cs = sorted(a for a in ent if ent[a]['role'].get('dado') == 'numero'
                    and re.search(rx, (ent[a]['role'].get('rot') or '') + ' | ' + (ent[a]['role'].get('rl') or ''), re.I))
        if not cs:
            raise SystemExit(f'{cod}: ensaio sem células — {nome}')
        out.append(cs)
    return out


# Caracterização de ligante (decisão de 20/10/2026): cada tipo de ensaio executado conta 1
LIGANTE_MODIFICADO = {
    'Penetração': r'Penetração \(100g',
    'Ponto de amolecimento': r'\| Ponto de amolecimento',
    'Recuperação elástica': r'\| Comprimento (inicial|final)',
    'RTFOT': r'^Recipiente \d',
    'Viscosidade Brookfield': r'^Viscosidade a',
    'Separação de fase': r'^Separação de fase',
}
LIGANTE_30_45 = {
    'Penetração': r'^Penetração —',
    'Ponto de amolecimento': r'^PA —',
    'RTFOT': r'^Recipiente \d',
    'Viscosidade': r'^Viscosidade a',
    'Ponto de fulgor': r'^Ponto de fulgor',
}


def por_celula(lista_unidades):
    """Cada célula é uma unidade (ex.: carga de cada CP)."""
    return [[a] for u in lista_unidades for a in u]


def colunas(cod, cols, linhas):
    """Uma unidade por coluna, nas linhas dadas (ex.: 1º e 2º ensaio da extração)."""
    _, ent = grupos(modelo(cod))
    rows = _faixa(linhas)
    return [[a for a in ent if _split(a)[1] == c and _split(a)[2] in rows and chave(ent, a)] for c in cols]


# medições do CP (as linhas de teor de CAP, filer, Gmm etc. se repetem em todos os CPs)
MEDIDA_CP = r'^(Espessura|Diametro|Massa)'


# ── Regras ───────────────────────────────────────────────────────────────────
# (ficha, atividade, modo, unidades) — modo 'unidades' = nº de unidades preenchidas;
# 'uma' = 1 se a ficha tiver qualquer unidade preenchida (sem unidades: 1 se tiver qualquer entrada).
def regras():
    R = []
    add = lambda f, at, modo, u: R.append((f, at, modo, u))

    for f in ('FR-IMOB-06', 'FR-IMOB-07', 'FR-LAB-01', 'FR-LAB-02'):
        add(f, 'Massa específica de agregados', 'unidades', unidades(f))
    add('FR-IMOB-08', 'Equivalente de areia', 'unidades', unidades('FR-IMOB-08'))
    add('FR-IMOB-10', 'Rice test', 'unidades', unidades('FR-IMOB-10', rotulo=r'^\((A|C)\)'))
    for f in ('FR-IMOB-11', 'FR-IMOB-12', 'FR-IMOB-21', 'FR-IMOB-44', 'FR-IMOB-45',
              'FR-IMOB-47', 'FR-IMOB-53', 'FR-IMOB-54'):
        add(f, 'Granulometria', 'unidades', unidades(f))
    for f in ('FR-IMOB-13', 'FR-IMOB-16'):
        add(f, 'Marshall', 'unidades', unidades(f, titulo=r'^CP ', rotulo=MEDIDA_CP))
    for f in ('FR-IMOB-14', 'FR-IMOB-15'):
        add(f, 'Caracterização de ligante', 'unidades', por_ensaio(f, LIGANTE_MODIFICADO))
    add('FR-IMOB-18', 'Caracterização de ligante', 'unidades', por_ensaio('FR-IMOB-18', LIGANTE_30_45))
    add('FR-IMOB-17', 'DUI', 'uma', unidades('FR-IMOB-17', titulo=r'^CP ', rotulo=MEDIDA_CP))
    for f in ('FR-IMOB-19', 'FR-IMOB-25'):
        add(f, 'Estudo de composição granulométrica', 'unidades', unidades(f, titulo=r'^Material'))
    add('FR-IMOB-20', 'Estudo de dosagem', 'uma', unidades('FR-IMOB-20'))
    add('FR-IMOB-22', 'Extração de teor', 'unidades',
        colunas('FR-IMOB-22', ['F', 'G'], '16-18') + colunas('FR-IMOB-22', ['F', 'G'], '24-25'))
    add('FR-IMOB-23', 'Densidade real', 'unidades', unidades('FR-IMOB-23'))
    add('FR-IMOB-24', 'Densidade relativa (produtos betuminosos)', 'unidades', unidades('FR-IMOB-24'))
    add('FR-IMOB-27', 'Adesividade', 'uma', [])
    add('FR-IMOB-28', 'Curva viscosidade × temperatura', 'uma', unidades('FR-IMOB-28'))
    add('FR-IMOB-29', 'Viga Benkelman', 'unidades', unidades('FR-IMOB-29', titulo=r'^Estação'))
    add('FR-IMOB-30', 'Macrotextura', 'unidades', unidades('FR-IMOB-30', titulo=r'^Ponto'))
    add('FR-IMOB-31', 'Índice de forma', 'unidades', unidades('FR-IMOB-31', titulo=r'^Faixa [CD]'))
    add('FR-IMOB-32', 'Densidade máxima e umidade ótima', 'unidades', unidades('FR-IMOB-32', titulo=r'^Ponto', rotulo=r'peso bruto'))
    add('FR-IMOB-33', 'Compressão axial e diametral', 'unidades', unidades('FR-IMOB-33', titulo=r'^CP '))
    add('FR-IMOB-34', 'Granulometria', 'uma', unidades('FR-IMOB-34'))
    add('FR-IMOB-35', 'Grau de compactação (frasco de areia)', 'unidades', unidades('FR-IMOB-35', titulo=r'^Furo', rotulo=r'Profundidade|solo úmido'))
    add('FR-IMOB-36', 'Comparativo SDG × frasco de areia', 'unidades', unidades('FR-IMOB-36', titulo=r'^Ponto', rotulo=r'^(SDG|Frasco)'))
    add('FR-IMOB-37', 'Índice de forma', 'uma', unidades('FR-IMOB-37', titulo=r'^Grãos'))
    add('FR-IMOB-38', 'Controle de espessuras', 'unidades', por_celula(unidades('FR-IMOB-38', titulo=r'^Pontos')))
    add('FR-IMOB-46', 'Densidade aparente e grau de compactação', 'unidades', unidades('FR-IMOB-46', titulo=r'^CP ', rotulo=r'^(Espessura|Massa)'))
    add('FR-IMOB-48', 'Resíduo seco', 'unidades', unidades('FR-IMOB-48'))
    add('FR-IMOB-49', 'Resistência à derrapagem', 'unidades', unidades('FR-IMOB-49', titulo=r'^Ponto', rotulo=r'^Leitura'))
    # FR-IMOB-50: cada carga = 1 CP. As regras valem por código (não por revisão): soma as células
    # de carga da Rev01 (X/Y/Z, linhas 20–45) com as da Rev00 (W/X, linhas 20–51), sem repetir.
    cargas50 = por_celula(unidades('FR-IMOB-50', titulo=r'^Moldagem', rotulo=r'^Carga'))
    rev00 = [[f'{c}{r}'] for r in range(20, 52, 2) for c in ('W', 'X') for r in (r, r + 1)]
    vistos = {u[0] for u in cargas50}
    add('FR-IMOB-50', 'Compressão axial e diametral', 'unidades', cargas50 + [u for u in rev00 if u[0] not in vistos])
    for f in ('FR-IMOB-51', 'FR-IMOB-52', 'FR-LAB-51'):
        add(f, 'Módulo de resiliência', 'unidades', unidades(f, titulo=r'^Amostra'))
    add('FR-IMOB-55', 'Densidade máxima e umidade ótima', 'unidades', unidades('FR-IMOB-55', titulo=r'^Ponto', rotulo=r'peso bruto'))
    add('FR-IMOB-55', 'Índice de suporte Califórnia', 'unidades',
        unidades('FR-IMOB-55', titulo=r'^ISC — cilindro', rotulo=r'penetra'))
    add('FR-IMOB-55', 'Expansão de solos', 'unidades',
        unidades('FR-IMOB-55', titulo=r'^ISC — cilindro', rotulo=r'expans'))
    add('FR-IMOB-55', 'Granulometria', 'uma', unidades('FR-IMOB-55', titulo=r'^Granulometria$'))
    add('FR-IMOB-55', 'Índices físicos – LL e LP', 'uma', unidades('FR-IMOB-55', titulo=r'^Limite'))
    add('FR-IMOB-55', 'Equivalente de areia', 'uma', unidades('FR-IMOB-55', titulo=r'^Equivalente'))
    add('FR-IMOB-56', 'Calibração da areia (massa específica aparente)', 'unidades', unidades('FR-IMOB-56'))
    add('FR-IMOB-57', 'Densidade in situ (densímetro não nuclear)', 'unidades', unidades('FR-IMOB-57', titulo=r'^Ponto', rotulo=r'Gmb'))

    for f, at, modo, u in R:
        if modo == 'unidades' and not u:
            raise SystemExit(f'{f} · {at}: nenhuma unidade encontrada')
    return R


def sql_carga(R):
    def q(s):
        return "'" + s.replace("'", "''") + "'"
    linhas = []
    for i, (f, at, modo, u) in enumerate(R, 1):
        js = '[' + ',\n     '.join(json.dumps(x) for x in u) + ']'   # uma unidade por linha (linhas curtas no SQL Editor)
        linhas.append(f"  ({q(f)}, {q(at)}, {q(modo)}, {q(js)}::jsonb, {i})")
    return ('insert into public.contagem_regras (ficha_codigo, atividade, modo, unidades, ordem) values\n'
            + ',\n'.join(linhas) + '\n'
            'on conflict (ficha_codigo, atividade) do update\n'
            '  set modo = excluded.modo, unidades = excluded.unidades, ordem = excluded.ordem;\n')


if __name__ == '__main__':
    R = regras()
    if '--sql' in sys.argv:
        Path(sys.argv[sys.argv.index('--sql') + 1]).write_text(sql_carga(R))
    else:
        for f, at, modo, u in R:
            print(f'{f:11} {at[:45]:45} {modo:8} {len(u):3} unid · ex.: {u[0][:4] if u else "-"}')
