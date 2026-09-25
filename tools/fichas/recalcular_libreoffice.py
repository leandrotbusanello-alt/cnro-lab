#!/usr/bin/env python3
"""
Conferência independente do motor: grava valores de teste na planilha original,
recalcula no LibreOffice (headless) e devolve o valor de cada fórmula.

Uso (chamado por testar_motor.mjs --libreoffice):
    python3 recalcular_libreoffice.py <planilha.xlsx> <aba|""> <entradas.json> <saida.json>
entradas.json = { "D18": 65.13, "O7": 46094, "F10": null, ... }
    (datas como número serial do Excel; null apaga a célula)
"""
import json, shutil, subprocess, sys, tempfile
from pathlib import Path
import openpyxl


def main():
    xlsx, aba, arq_in, arq_out = sys.argv[1:5]
    entradas = json.loads(Path(arq_in).read_text(encoding='utf-8'))
    with tempfile.TemporaryDirectory() as tmp:
        origem = Path(tmp) / 'entrada.xlsx'
        wb = openpyxl.load_workbook(xlsx)
        ws = wb[aba] if aba else wb.worksheets[0]
        for a, v in entradas.items():
            ws[a].value = v
        wb.save(origem)
        saida_dir = Path(tmp) / 'out'
        saida_dir.mkdir()
        subprocess.run(['soffice', '--headless', '--calc', '--convert-to', 'xlsx', '--outdir', str(saida_dir), str(origem)],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180)
        wbv = openpyxl.load_workbook(saida_dir / 'entrada.xlsx', data_only=True)
        wsf = openpyxl.load_workbook(origem).worksheets[wb.worksheets.index(ws)]
        wsv = wbv.worksheets[wb.worksheets.index(ws)]
        out = {}
        for row in wsf.iter_rows():
            for c in row:
                if isinstance(c.value, str) and c.value.startswith('='):
                    v = wsv[c.coordinate].value
                    if hasattr(v, 'year'):
                        import datetime
                        base = datetime.datetime(1899, 12, 30)
                        dt = v if isinstance(v, datetime.datetime) else datetime.datetime(v.year, v.month, v.day)
                        v = (dt - base).days + (dt - base).seconds / 86400
                        if v < 61:          # Excel conta 29/02/1900 (dia inexistente): seriais < 61 ficam 1 a menos
                            v -= 1
                    out[c.coordinate] = v
        Path(arq_out).write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')


if __name__ == '__main__':
    main()
