import { cpsRompidos, TIPOS_RUPTURA } from '../motor/ficha.js'
import { formatar } from '../motor/formatacao.js'
import s from './PainelRupturas.module.css'

// ─────────────────────────────────────────────────────────────────────────────
// Tipo de ruptura de cada CP rompido (NBR 5739, Anexo A) — FR-IMOB-50 Rev01 (28/10/2026).
// Fica fora da ficha (a ficha e a impressão não mudam); grava em estado.rupturas
// { célula da carga: 'A'…'G' } e vai para resultado_compressao_concreto.tipo_ruptura na aprovação.
// Obrigatório para enviar à revisão (exceto lançamento histórico).
// Avaliação da moldagem (decisão do laboratório): A, B, C = Boa · D, E = Razoável · F, G = Ruim.
// Desenhos próprios, esquemáticos (não reproduzem a figura da norma).
// ─────────────────────────────────────────────────────────────────────────────

export const RUPTURAS = {
  A: { nome: 'Cônica e cônica afastada 25 mm do capeamento', avaliacao: 'Boa' },
  B: { nome: 'Cônica e bipartida / cônica com mais de uma partição', avaliacao: 'Boa' },
  C: { nome: 'Colunar com formação de cones', avaliacao: 'Boa' },
  D: { nome: 'Cônica e cisalhada', avaliacao: 'Razoável' },
  E: { nome: 'Cisalhada', avaliacao: 'Razoável' },
  F: { nome: 'Fraturas no topo e/ou na base abaixo do capeamento', avaliacao: 'Ruim' },
  G: { nome: 'Similar ao F, com fraturas próximas ao topo', avaliacao: 'Ruim' },
}
const TOM = { Boa: s.boa, 'Razoável': s.razoavel, Ruim: s.ruim }

// Linhas de fratura de cada tipo, num CP de 40 × 64 (traço tracejado)
const LINHAS = {
  A: ['M3 3 L37 61', 'M37 3 L3 61'],
  B: ['M20 3 L20 34', 'M20 34 L4 61', 'M20 34 L36 61'],
  C: ['M10 3 L10 40 L5 61', 'M10 40 L15 61', 'M20 3 L20 30 L16 61', 'M20 30 L25 61', 'M30 3 L30 40 L26 61', 'M30 40 L36 61'],
  D: ['M37 6 L20 36', 'M20 36 L4 61', 'M20 36 L36 61'],
  E: ['M36 3 L4 61'],
  F: ['M3 13 L12 3', 'M37 50 L28 61'],
  G: ['M3 9 L20 5 L37 10'],
}

export function DesenhoRuptura({ tipo, tamanho = 34 }) {
  return (
    <svg viewBox="0 0 40 64" width={tamanho * 40 / 64} height={tamanho} aria-hidden="true" className={s.desenho}>
      <rect x="1" y="1" width="38" height="62" rx="1.5" fill="#fff" stroke="currentColor" strokeWidth="1.6" />
      {(LINHAS[tipo] || []).map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#b91c1c" strokeWidth="1.6" strokeDasharray="3 2.2" strokeLinecap="round" />
      ))}
    </svg>
  )
}

/**
 *   <PainelRupturas indice motor estado onEstado editavel />
 * estado/onEstado: os da folha (cada folha tem os seus CPs).
 */
export default function PainelRupturas({ indice, motor, estado, onEstado, editavel = false, obrigatorio: exigir = true }) {
  if (!indice?.rupturas) return null
  const obrigatorio = exigir && editavel
  const cps = cpsRompidos(indice, estado)
  const rupt = estado?.rupturas || {}
  const pendentes = cps.filter(c => !TIPOS_RUPTURA.includes(rupt[c.celula])).length
  const mpa = indice.rupturas.mpa || {}

  function escolher(celula, tipo) {
    const novo = { ...rupt }
    if (novo[celula] === tipo) delete novo[celula]
    else novo[celula] = tipo
    onEstado?.({ ...estado, rupturas: novo })
  }

  return (
    <section className={s.painel} aria-label="Tipo de ruptura dos corpos de prova">
      <header className={s.topo}>
        <div>
          <h3>Tipo de ruptura dos CPs <small>(NBR 5739, Anexo A)</small></h3>
          <p>Escolha o desenho que mais se parece com a ruptura de cada CP rompido. Fica registrado no sistema e não aparece na impressão da ficha.</p>
        </div>
        {cps.length > 0 && (
          pendentes
            ? <span className={`${s.situacao} ${obrigatorio ? s.situacaoPendente : ''}`}>{pendentes} de {cps.length} sem tipo{obrigatorio ? ' · obrigatório para enviar' : ''}</span>
            : <span className={`${s.situacao} ${s.situacaoOk}`}>✔ {cps.length} CP(s) com tipo de ruptura</span>
        )}
      </header>

      <details className={s.legenda}>
        <summary>Ver os 7 tipos</summary>
        <div className={s.legendaGrade}>
          {TIPOS_RUPTURA.map(t => (
            <div key={t} className={s.legendaItem}>
              <DesenhoRuptura tipo={t} tamanho={46} />
              <div><strong>Tipo {t}</strong><span>{RUPTURAS[t].nome}</span><em className={TOM[RUPTURAS[t].avaliacao]}>Moldagem {RUPTURAS[t].avaliacao.toLowerCase()}</em></div>
            </div>
          ))}
        </div>
      </details>

      {!cps.length ? (
        <p className={s.vazio}>Nenhum CP rompido ainda. Ao digitar a carga de ruptura de um CP na ficha, ele aparece aqui.</p>
      ) : (
        <ul className={s.lista}>
          {cps.map(c => {
            const v = mpa[c.celula] ? motor?.valores?.get(mpa[c.celula]) : null
            const atual = rupt[c.celula]
            return (
              <li key={c.celula} className={`${s.cp} ${!atual && obrigatorio ? s.cpPendente : ''}`}>
                <div className={s.cpInfo}>
                  <strong>{c.codigo}</strong>
                  <span>{formatar(c.carga, '0.00')} t{typeof v === 'number' ? ` · ${formatar(v, '0.0')} MPa` : ''}</span>
                  {atual && <em className={TOM[RUPTURAS[atual].avaliacao]}>Tipo {atual} · moldagem {RUPTURAS[atual].avaliacao.toLowerCase()}</em>}
                </div>
                <div className={s.opcoes} role="radiogroup" aria-label={`Tipo de ruptura — ${c.codigo}`}>
                  {TIPOS_RUPTURA.map(t => (
                    <button key={t} type="button" role="radio" aria-checked={atual === t}
                      className={`${s.opcao} ${atual === t ? s.opcaoAtiva : ''}`}
                      disabled={!editavel} title={`Tipo ${t} — ${RUPTURAS[t].nome}`}
                      onClick={() => escolher(c.celula, t)}>
                      <DesenhoRuptura tipo={t} />
                      <span>{t}</span>
                    </button>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
