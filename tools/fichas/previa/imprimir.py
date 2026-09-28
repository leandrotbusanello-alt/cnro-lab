#!/usr/bin/env python3
"""
Impressão das fichas como o sistema imprime (PDF A4 + PNG por página), para conferência visual.

  python3 tools/fichas/previa/imprimir.py FR-IMOB-37_Rev00 [outras…] [--estado aleatorio|vazio|<arquivo de estados/>]
                                          [--todas] [--saida DIR] [--assinar] [--dpi 70]

Sobe a prévia Vite (vite.config.mjs) numa porta local, abre cada ficha no Chromium do Playwright e
grava DIR/<ficha>__<estado>.pdf e DIR/<ficha>__<estado>-<página>.png. Mostra o nº de páginas.
Padrão: DIR = tools/fichas/previa/saida (ignorada pelo git), estado = o arquivo estados/<ficha>.json se
existir, senão 'aleatorio'.
"""
import argparse, glob, json, os, subprocess, sys, time, urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[2]
PORTA = 5199


def servidor():
    try:
        urllib.request.urlopen(f'http://localhost:{PORTA}/', timeout=1)
        return None                       # já está rodando
    except Exception:
        pass
    p = subprocess.Popen(['npx', 'vite', '--config', str(AQUI / 'vite.config.mjs')], cwd=RAIZ,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(120):
        try:
            urllib.request.urlopen(f'http://localhost:{PORTA}/', timeout=1)
            return p
        except Exception:
            time.sleep(0.5)
    p.kill()
    sys.exit('A prévia Vite não subiu.')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('fichas', nargs='*')
    ap.add_argument('--todas', action='store_true')
    ap.add_argument('--estado')
    ap.add_argument('--saida', default=str(AQUI / 'saida'))
    ap.add_argument('--assinar', action='store_true')
    ap.add_argument('--dpi', type=int, default=70)
    a = ap.parse_args()
    fichas = a.fichas
    if a.todas:
        fichas = sorted(Path(f).name.replace('.modelo.json', '') for f in glob.glob(str(RAIZ / 'tools/fichas/saida/*.modelo.json')))
    if not fichas:
        ap.error('informe as fichas ou --todas')
    out = Path(a.saida); out.mkdir(parents=True, exist_ok=True)
    from playwright.sync_api import sync_playwright
    srv = servidor()
    try:
        with sync_playwright() as pw:
            nav = pw.chromium.launch()
            pag = nav.new_page(viewport={'width': 1200, 'height': 900})
            erros = []
            pag.on('pageerror', lambda e: erros.append(str(e)))
            for f in fichas:
                est = a.estado or (f if (AQUI / 'estados' / f'{f}.json').exists() else 'aleatorio')
                url = f'http://localhost:{PORTA}/?ficha={f}&estado={est}&modo=impressao' + ('&assinar=1' if a.assinar else '')
                erros.clear()
                pag.goto(url)
                pag.wait_for_function('window.__pronto === true', timeout=60000)
                pag.wait_for_timeout(300)
                if erros:
                    print(f'✗ {f}: erro na página: {erros[0]}'); continue
                n = pag.eval_on_selector_all('[class*="folhaA4"]', 'els => els.length')
                rot = 'dados' if est == f else Path(est).name
                base = out / f'{f}__{rot}'
                pag.emulate_media(media='print')
                pag.pdf(path=f'{base}.pdf', prefer_css_page_size=True, print_background=True)
                pag.emulate_media(media='screen')
                for old in glob.glob(f'{base}-*.png'):
                    os.remove(old)
                subprocess.run(['pdftoppm', '-r', str(a.dpi), '-png', f'{base}.pdf', str(base)], check=True)
                res = pag.evaluate('window.__resultados')
                Path(f'{base}.resultados.json').write_text(json.dumps(res, ensure_ascii=False, indent=1))
                print(f'✓ {f} ({est}): {n} página(s) → {base}.pdf')
            nav.close()
    finally:
        if srv:
            srv.kill()


if __name__ == '__main__':
    main()
