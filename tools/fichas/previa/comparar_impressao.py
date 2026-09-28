#!/usr/bin/env python3
"""Compara duas pastas de PNGs geradas por imprimir.py (antes × depois), pixel a pixel.
   python3 tools/fichas/previa/comparar_impressao.py pasta_antes pasta_depois"""
import glob, os, sys
from PIL import Image, ImageChops
a, b = sys.argv[1], sys.argv[2]
na = {os.path.basename(p) for p in glob.glob(f'{a}/*.png')}
nb = {os.path.basename(p) for p in glob.glob(f'{b}/*.png')}
dif = [f for f in sorted(na & nb) if ImageChops.difference(Image.open(f'{a}/{f}').convert('RGB'), Image.open(f'{b}/{f}').convert('RGB')).getbbox()]
for f in sorted(na - nb): print('só antes:', f)
for f in sorted(nb - na): print('só depois:', f)
for f in dif: print('diferente:', f)
print('Impressão igual.' if not dif and na == nb else f'{len(dif)} página(s) diferente(s).')
sys.exit(1 if dif or na != nb else 0)
