import { PENEIRAS, SERIES_PENEIRAS, nomePeneira } from '../../../lib/cadastros'
import ui from '../../laboratorio/components/ui.module.css'
import styles from '../CadastrosPage.module.css'

const num = v => (v === '' || v === null || v === undefined ? '' : typeof v === 'string' ? v : String(v).replace('.', ','))
/** texto digitado → número (vírgula ou ponto); vazio/inválido → null */
export const ler = v => {
  const t = String(v ?? '').trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Granulometria do traço (faixa de trabalho): % passante mínima e máxima por peneira.
 * linhas = [{ peneira_mm, peneira, min, max }] — tudo editável; a peneira aparece em mm e em
 * polegadas/número ("nº 200 · 0,075 mm").
 */
export default function TabelaPeneiras({ linhas, onChange }) {
  const set = (i, patch) => onChange(linhas.map((l, k) => (k === i ? { ...l, ...patch } : l)))

  function trocarPeneira(i, valor) {
    if (valor === 'outra') { set(i, { peneira_mm: '', peneira: '' }); return }
    const mm = Number(valor)
    set(i, { peneira_mm: mm, peneira: nomePeneira(mm) })
  }

  function carregarSerie(nome) {
    if (!nome) return
    if (linhas.length && !window.confirm('Substituir a tabela atual pela série escolhida? Os valores digitados serão apagados.')) return
    onChange(SERIES_PENEIRAS[nome].map(mm => ({ peneira_mm: mm, peneira: nomePeneira(mm), min: null, max: null })))
  }

  return (
    <div className={styles.peneiras}>
      <div className={styles.peneirasBarra}>
        <span className={ui.rotulo}>Granulometria — faixa de trabalho (% passante)</span>
        <select className={ui.input} value="" onChange={e => carregarSerie(e.target.value)} style={{ maxWidth: 300 }}>
          <option value="">Começar com uma série de peneiras…</option>
          {Object.keys(SERIES_PENEIRAS).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      {linhas.length === 0 ? (
        <p className={ui.ajuda}>Nenhuma peneira. Escolha uma série acima ou adicione uma a uma.</p>
      ) : (
        <table className={styles.faixa}>
          <thead>
            <tr><th>Peneira</th><th>Abertura (mm)</th><th>Mín. (%)</th><th>Máx. (%)</th><th /></tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const padrao = typeof l.peneira_mm === 'number' && PENEIRAS.some(p => Math.abs(p.mm - l.peneira_mm) < 1e-6)
              return (
                <tr key={i}>
                  <td>
                    <select className={ui.input} value={padrao ? String(l.peneira_mm) : 'outra'} onChange={e => trocarPeneira(i, e.target.value)}>
                      {PENEIRAS.map(p => <option key={p.mm} value={String(p.mm)}>{p.nome} — {num(p.mm)} mm</option>)}
                      <option value="outra">Outra…</option>
                    </select>
                    {!padrao && (
                      <input className={ui.input} placeholder="Nome (ex.: nº 6)" value={l.peneira || ''}
                        onChange={e => set(i, { peneira: e.target.value })} />
                    )}
                  </td>
                  <td>
                    <input className={ui.input} inputMode="decimal" value={num(l.peneira_mm)} readOnly={padrao}
                      onChange={e => set(i, { peneira_mm: e.target.value })} />
                  </td>
                  <td><input className={ui.input} inputMode="decimal" value={num(l.min)} onChange={e => set(i, { min: e.target.value })} /></td>
                  <td><input className={ui.input} inputMode="decimal" value={num(l.max)} onChange={e => set(i, { max: e.target.value })} /></td>
                  <td>
                    <button type="button" className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} title="Remover peneira"
                      onClick={() => onChange(linhas.filter((_, k) => k !== i))}>×</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <button type="button" className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`}
        onClick={() => onChange([...linhas, { peneira_mm: 0.075, peneira: 'nº 200', min: null, max: null }])}>
        + Peneira
      </button>
    </div>
  )
}
