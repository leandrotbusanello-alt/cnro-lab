#!/usr/bin/env python3
"""
SQL de carga de um lote de fichas, em partes para o SQL Editor do Supabase.

  python3 tools/fichas/sql_lote.py lote8 FR-IMOB-44 FR-IMOB-45 FR-IMOB-46 FR-IMOB-47 [--saida DIR] [--limite 200]

Lê os blocos das fichas em supabase/migrations/13b_fichas_modelo_carga.sql (rode antes
python3 tools/fichas/converter.py) e grava DIR/carga_<lote>_parteN.sql com no máximo ~200 KB cada.
Ficha maior que o limite vai em várias partes (Na, Nb, Nc…): a parte "a" grava o modelo com as primeiras células
e hash 'parcial-2-…'; cada parte seguinte acrescenta o seu pedaço (células, auxiliares, outras abas) só se o modelo
estiver na etapa dela, e a última grava o hash final — rodar todas, nessa ordem (rodar de novo não duplica nada).
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


def dividir(codigo, versao, bloco, lim):
    """Bloco grande → partes a, b, c… (cada uma com até ~lim bytes). A parte "a" grava o modelo com as primeiras
    células (sem as auxiliares e sem as outras abas) e hash 'parcial-2-…'; cada parte seguinte só age se o modelo estiver
    na etapa dela ('parcial-N-…'), acrescenta o seu pedaço (células, auxiliares, outras abas) e passa para a etapa
    seguinte; a última grava o hash final. Rodar de novo não duplica nada; fora de ordem, a parte não faz nada."""
    m = re.search(r"\n       '(\{\"motor\".*?)'::jsonb,\n       '(.*?)'::jsonb, 1, '([0-9a-f]+)'", bloco, re.S)
    if not m:
        raise SystemExit(f'{codigo}: formato do bloco não reconhecido')
    modelo = json.loads(m.group(1).replace("''", "'"))
    hsh = m.group(3)
    lin = lambda k: int(re.search(r'\d+', k).group())
    # pedaços na ordem: células (pela linha), auxiliares, outras abas (inteiras)
    itens = [('cells', k, v) for k, v in sorted(modelo['cells'].items(), key=lambda kv: lin(kv[0]))]
    itens += [('aux', k, v) for k, v in modelo.get('aux', {}).items()]
    abas = modelo.get('abas')
    base = {**modelo, 'cells': {}, **({'aux': {}} if 'aux' in modelo else {})}
    if abas:
        base['abas'] = [{**ab, 'cells': {}, 'aux': {}} for ab in abas]
    folga = len(bloco.encode()) - len(m.group(1).encode()) + 2000     # SQL em volta do modelo na parte a
    pedacos, atual, tam = [], [], len(js(base).encode()) + folga
    for it in itens:
        t = len(js({it[1]: it[2]}).encode())
        if atual and tam + t > lim:
            pedacos.append(atual); atual, tam = [], 1500
        atual.append(it); tam += t
    pedacos.append(atual)
    extra_abas = bool(abas)
    n = len(pedacos) + (1 if extra_abas and len(js(abas).encode()) + 1500 > lim - tam else 0)
    etapa = lambda k: f'parcial-{k}-{hsh}'
    def junta(ped, chave):
        return {k: v for c, k, v in ped if c == chave}
    modelo_a = {**base, 'cells': junta(pedacos[0], 'cells')}
    if 'aux' in modelo:
        modelo_a['aux'] = junta(pedacos[0], 'aux')
    total = len(pedacos) + (1 if n > len(pedacos) else 0)
    final = total == 1
    blocos_out = [bloco[:m.start(1)] + js(modelo_a) + bloco[m.end(1):m.start(3)] + (hsh if final else etapa(2)) + bloco[m.end(3):]]
    for k in range(2, total + 1):
        ped = pedacos[k - 1] if k - 1 < len(pedacos) else []
        novo = 'modelo'
        cel, aux = junta(ped, 'cells'), junta(ped, 'aux')
        if cel:
            novo = f"jsonb_set({novo}, '{{cells}}', (modelo->'cells') || '" + js(cel) + "'::jsonb)"
        if aux:
            novo = f"jsonb_set({novo}, '{{aux}}', coalesce(modelo->'aux', '{{}}'::jsonb) || '" + js(aux) + "'::jsonb)"
        if abas and k == total:
            novo = f"jsonb_set({novo}, '{{abas}}', '" + js(abas) + "'::jsonb)"
        blocos_out.append("update public.fichas_modelo\n   set modelo = " + novo + ",\n"
                          f"       hash = '{hsh if k == total else etapa(k + 1)}'\n"
                          f" where codigo = '{codigo}' and versao = '{versao}' and hash = '{etapa(k)}';")
    junto = {}
    for ped in pedacos:
        junto.update(junta(ped, 'cells'))
    assert junto == modelo['cells']
    return blocos_out


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
            pedacos = dividir(c, versao, b, lim)
            for k, bl in enumerate(pedacos):
                partes.append([('abcdefghij'[k], c, versao, bl, len(pedacos))])
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
        if tipo in ('', 'a'):
            n += 1
        nome = f'carga_{a.lote}_parte{n}{tipo}.sql'
        fichas = ', '.join(f'{c} {v}' for _, c, v, _, _ in p)
        if tipo:
            todas = ', '.join(f'{n}{x}' for x in 'abcdefghij'[:p[0][4]])
            ultima = f'{n}{"abcdefghij"[p[0][4] - 1]}'
            if tipo == 'a':
                cab = (f'-- CNRO Lab — carga das fichas ({a.lote}), parte {n}a: {fichas} (1ª de {p[0][4]})\n'
                       f'-- Ficha grande: vai em {p[0][4]} partes ({todas}), nessa ordem. Até rodar a {ultima} o modelo fica marcado como parcial.\n' + CAB)
            else:
                cab = (f'-- CNRO Lab — carga das fichas ({a.lote}), parte {n}{tipo}: {fichas} ({"abcdefghij".index(tipo) + 1}ª de {p[0][4]})\n'
                       f'-- Rodar na ordem ({todas}). Só age sobre o modelo na etapa desta parte (rodar de novo ou fora de ordem não faz nada).\n')
        else:
            cab = f'-- CNRO Lab — carga das fichas ({a.lote}), parte {n}: {fichas}\n-- Extraído de supabase/migrations/13b_fichas_modelo_carga.sql.\n' + CAB
        txt = cab + '\nbegin;\n\n' + '\n\n'.join(x[3] for x in p) + '\n\ncommit;\n'
        (saida / nome).write_text(txt, encoding='utf-8')
        arquivos.append(nome)
        print(f'{nome}: {fichas} · {len(txt.encode()) // 1024} KB')
    return arquivos


if __name__ == '__main__':
    main()
