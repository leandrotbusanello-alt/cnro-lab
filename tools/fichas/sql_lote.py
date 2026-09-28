#!/usr/bin/env python3
"""
SQL de carga de um lote de fichas, em partes para o SQL Editor do Supabase.

  python3 tools/fichas/sql_lote.py lote8 FR-IMOB-44 FR-IMOB-45 FR-IMOB-46 FR-IMOB-47 [--saida DIR] [--limite 200]

Lê os blocos das fichas em supabase/migrations/13b_fichas_modelo_carga.sql (rode antes
python3 tools/fichas/converter.py) e grava DIR/carga_<lote>_parteN.sql com no máximo ~200 KB cada.
Ficha maior que o limite vai em duas partes (Na e Nb): a parte "a" grava o modelo com parte das células
e hash 'parcial-…'; a "b" completa as células e grava o hash final — rodar as duas, nessa ordem
(rodar de novo não duplica nada; a "b" só age sobre o modelo marcado como parcial).
"""
import argparse, json, re, sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SQL13B = RAIZ / 'supabase' / 'migrations' / '13b_fichas_modelo_carga.sql'
CAB = '-- Rodar no SQL Editor depois do deploy do app (quando o lote tem código). Idempotente.\n'


def blocos():
    s = SQL13B.read_text(encoding='utf-8')
    corpo = s.split('begin;', 1)[1].rsplit('commit;', 1)[0]
    out = {}
    for b in re.split(r'\n(?=-- FR-IMOB-\d+ Rev\d+ — )', corpo):
        m = re.match(r'-- (FR-IMOB-\d+) (Rev\d+) — ', b.strip())
        if m:
            out[m.group(1)] = (m.group(2), b.strip())
    return out


def js(o):
    return json.dumps(o, ensure_ascii=False, separators=(',', ':')).replace("'", "''")


def dividir(codigo, versao, bloco):
    """Bloco grande → (parte a, parte b). As células vão metade em cada parte (pela linha)."""
    m = re.search(r"\n       '(\{\"motor\".*?)'::jsonb,\n       '(.*?)'::jsonb, 1, '([0-9a-f]+)'", bloco, re.S)
    if not m:
        raise SystemExit(f'{codigo}: formato do bloco não reconhecido')
    modelo = json.loads(m.group(1).replace("''", "'"))
    hsh = m.group(3)
    cells = modelo['cells']
    linhas = sorted({int(re.search(r'\d+', k).group()) for k in cells})
    corte = linhas[len(linhas) // 2]
    a = {k: v for k, v in cells.items() if int(re.search(r'\d+', k).group()) < corte}
    b = {k: v for k, v in cells.items() if k not in a}
    modelo_a = {**modelo, 'cells': a}
    bloco_a = bloco[:m.start(1)] + js(modelo_a) + bloco[m.end(1):m.start(3)] + 'parcial-' + hsh + bloco[m.end(3):]
    bloco_b = ("update public.fichas_modelo\n   set modelo = jsonb_set(modelo, '{cells}', (modelo->'cells') || '" + js(b) + "'::jsonb),\n"
               f"       hash = '{hsh}'\n where codigo = '{codigo}' and versao = '{versao}' and hash = 'parcial-{hsh}';")
    assert {**a, **b} == cells
    return bloco_a, bloco_b, corte


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('lote')
    ap.add_argument('fichas', nargs='+')
    ap.add_argument('--saida', default='.')
    ap.add_argument('--limite', type=int, default=200, help='KB por parte')
    a = ap.parse_args()
    todos = blocos()
    faltam = [c for c in a.fichas if c not in todos]
    if faltam:
        sys.exit(f'Fichas sem bloco no 13b: {faltam} (rode o conversor sem filtro).')
    lim = a.limite * 1000
    partes, atual = [], []
    for c in a.fichas:
        versao, b = todos[c]
        if len(b.encode()) > lim:
            if atual:
                partes.append(atual); atual = []
            ba, bb, corte = dividir(c, versao, b)
            partes.append([('a', c, versao, ba, corte)]); partes.append([('b', c, versao, bb, corte)])
            continue
        if atual and sum(len(x[3].encode()) for x in atual) + len(b.encode()) > lim:
            partes.append(atual); atual = []
        atual.append(('', c, versao, b, None))
    if atual:
        partes.append(atual)
    saida = Path(a.saida); saida.mkdir(parents=True, exist_ok=True)
    n, arquivos = 0, []
    for p in partes:
        tipo = p[0][0]
        if tipo != 'b':
            n += 1
        nome = f'carga_{a.lote}_parte{n}{tipo}.sql'
        fichas = ', '.join(f'{c} {v}' for _, c, v, _, _ in p)
        if tipo == 'a':
            cab = (f'-- CNRO Lab — carga das fichas ({a.lote}), parte {n}a: {fichas} — linhas antes da {p[0][4]}\n'
                   f'-- Ficha grande: vai em duas partes ({n}a e {n}b), nessa ordem. Até rodar a {n}b o modelo fica marcado como parcial.\n' + CAB)
        elif tipo == 'b':
            cab = (f'-- CNRO Lab — carga das fichas ({a.lote}), parte {n}b: {fichas} — linhas a partir da {p[0][4]}\n'
                   f'-- Rodar logo depois da parte {n}a. Só completa o modelo que a {n}a deixou parcial (rodar de novo não faz nada).\n')
        else:
            cab = f'-- CNRO Lab — carga das fichas ({a.lote}), parte {n}: {fichas}\n-- Extraído de supabase/migrations/13b_fichas_modelo_carga.sql.\n' + CAB
        txt = cab + '\nbegin;\n\n' + '\n\n'.join(x[3] for x in p) + '\n\ncommit;\n'
        (saida / nome).write_text(txt, encoding='utf-8')
        arquivos.append(nome)
        print(f'{nome}: {fichas} · {len(txt.encode()) // 1024} KB')
    return arquivos


if __name__ == '__main__':
    main()
