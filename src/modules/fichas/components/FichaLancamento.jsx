import { useMemo } from 'react'
import { entradaAtiva, celulaOculta, linhasOcultas, valorOpcao } from '../motor/ficha.js'
import { formatar } from '../motor/formatacao.js'
import CampoCelula from './CampoCelula'
import Grafico from './Grafico'
import s from './Ficha.module.css'

// ─────────────────────────────────────────────────────────────────────────────
// Aba "Lançamento" (FR-IMOB-55 Rev00.1 — pedido do laboratorista, 15/10/2026):
// formulário compacto, na ordem da aba de digitação da planilha. Os campos são as próprias
// células da ficha (o que se digita aqui aparece na ficha e vice-versa); os valores calculados
// aparecem em cinza ao lado, para conferência. Definido em modelo.lancamento (spec "lancamento"):
//   { secoes: [{ titulo, nota?, quando?: {celula, igual|diferente},
//                campos?: [{ celula, rotulo, largo?, quando? }],
//                tabelas?: [{ titulo?, colunas: ['1','2'…], linhas: [{ rotulo, celulas: [...] }] }],
//                resultados?: [{ celula, rotulo }], graficos?: [índice do gráfico] }] }
// Uma seção some quando todas as suas células estão em linhas ocultas (p.ex. "Simples").
// ─────────────────────────────────────────────────────────────────────────────

const NOME_ASSINATURA = { executor: 'Responsável executor', calculista: 'Responsável calculista' }

function vale(indice, estado, q) {
  if (!q) return true
  const v = valorOpcao(indice, estado, q.celula)
  if ('igual' in q) return v === q.igual
  if ('diferente' in q) return v !== q.diferente
  return true
}

function textoCalculado(v, nf) {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'object' && 'err' in v) return v.err
  if (v === true) return 'VERDADEIRO'
  if (v === false) return 'FALSO'
  return formatar(v, nf)
}

export default function FichaLancamento({
  indice, motor, estado, modo = 'preencher', bloqueado = false, idBase = 'lanc',
  assinaturas = {}, podeAssinar = {}, onEntrada, onCliqueAssinatura,
}) {
  const lanc = indice.lancamento
  const podeEntrada = !bloqueado && (modo === 'preencher' || modo === 'revisao')
  const ocultas = useMemo(() => linhasOcultas(indice, estado), [indice, estado])

  // seções visíveis (com a opção escolhida) e a ordem de digitação (linha a linha, como na planilha)
  const secoes = useMemo(() => (lanc?.secoes || []).filter(sec => {
    if (!vale(indice, estado, sec.quando)) return false
    const todas = [
      ...(sec.campos || []).map(c => c.celula),
      ...(sec.tabelas || []).flatMap(t => t.linhas.flatMap(l => l.celulas)),
    ]
    return !todas.length || todas.some(a => !celulaOculta(indice, estado, a))
  }), [lanc, indice, estado])

  const editavel = a => podeEntrada && indice.cells[a]?.role?.tipo === 'entrada' && entradaAtiva(indice, estado, a, ocultas)
  const ordem = useMemo(() => secoes.flatMap(sec => [
    ...(sec.campos || []).filter(c => vale(indice, estado, c.quando)).map(c => c.celula),
    ...(sec.tabelas || []).flatMap(t => t.linhas.flatMap(l => l.celulas)),
  ]).filter(editavel), [secoes, indice, estado, podeEntrada]) // eslint-disable-line react-hooks/exhaustive-deps

  function navegar(a, passo) {
    const prox = ordem[ordem.indexOf(a) + passo]
    if (prox) document.getElementById(`${idBase}-${prox}`)?.focus()
    else document.activeElement?.blur?.()
  }

  function valor(a) {
    const d = indice.cells[a]
    const v = motor?.valores?.get(a)
    return textoCalculado(v === undefined ? null : v, d?.nf)
  }

  /** Campo digitável ou valor calculado (cinza) de uma célula da ficha */
  function celula(a, { rotulo, classe } = {}) {
    const d = indice.cells[a]
    const role = d?.role
    if (role?.tipo === 'entrada' && entradaAtiva(indice, estado, a, ocultas)) {
      return (
        <CampoCelula
          id={`${idBase}-${a}`}
          className={classe || s.lancCampo}
          valor={estado?.entradas?.[a]}
          dado={role.dado}
          nf={d.nf}
          opcoes={role.opcoes}
          padrao={role.padrao}
          editavel={editavel(a)}
          rotulo={rotulo || role.rot || role.rl || a}
          onConfirmar={v => onEntrada?.(a, v)}
          onNavegar={p => navegar(a, p)}
        />
      )
    }
    const txt = valor(a)
    return <output className={s.lancCalc} aria-label={rotulo || a} title="Calculado">{txt || ' '}</output>
  }

  if (!lanc) return null

  return (
    <div className={s.lanc}>
      {secoes.map((sec, si) => {
        const campos = (sec.campos || []).filter(c => vale(indice, estado, c.quando) && !celulaOculta(indice, estado, c.celula))
        const resultados = (sec.resultados || []).filter(r => !celulaOculta(indice, estado, r.celula))
        return (
          <section key={si} className={s.grupo}>
            <h3 className={s.grupoTitulo}>{sec.titulo}</h3>
            {sec.nota && <p className={s.lancNota}>{sec.nota}</p>}

            {campos.length > 0 && (
              <div className={s.lancCampos}>
                {campos.map(c => (
                  <label key={c.celula} className={`${s.item} ${c.largo ? s.itemLargo : ''}`}>
                    <span className={s.itemRotulo}>{c.rotulo}</span>
                    {celula(c.celula, { rotulo: c.rotulo, classe: s.itemCampo })}
                  </label>
                ))}
              </div>
            )}

            {(sec.tabelas || []).map((t, ti) => (
              <div key={ti} className={s.lancTabelaCaixa}>
                <table className={s.lancTabela}>
                  <thead>
                    <tr>
                      <th scope="col" className={s.lancCanto}>{t.titulo || ''}</th>
                      {t.colunas.map(c => <th key={c} scope="col">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {t.linhas.map(l => {
                      const calculada = l.celulas.every(a => !editavel(a))
                      return (
                        <tr key={l.rotulo} className={calculada ? s.lancLinhaCalc : undefined}>
                          <th scope="row">{l.rotulo}</th>
                          {l.celulas.map((a, i) => (
                            <td key={a}>{celula(a, { rotulo: `${l.rotulo} — ${t.colunas[i]}` })}</td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}

            {resultados.length > 0 && (
              <dl className={s.lancResultados}>
                {resultados.map(r => (
                  <div key={r.celula} className={s.lancResultado}>
                    <dt>{r.rotulo}</dt>
                    <dd>{valor(r.celula) || '—'}</dd>
                  </div>
                ))}
              </dl>
            )}

            {motor && (sec.graficos || []).map(gi => {
              const g = indice.modelo.graficos?.[gi]
              return g ? (
                <div key={gi} className={s.graficoLista}>
                  <Grafico g={g} motor={motor} prefixo="" cells={indice.cells} responsivo />
                </div>
              ) : null
            })}
          </section>
        )
      })}

      {Object.keys(indice.papeis.assinatura).length > 0 && (
        <section className={s.grupo}>
          <h3 className={s.grupoTitulo}>Assinaturas</h3>
          <div className={s.assinaturasLista}>
            {Object.keys(indice.papeis.assinatura).map(quem => {
              const a = assinaturas[quem]
              return (
                <button
                  key={quem}
                  type="button"
                  className={`${s.assinaturaBotao} ${a ? s.assinaturaFeita : ''}`}
                  disabled={modo === 'leitura' || (!podeAssinar[quem] && !a)}
                  onClick={e => onCliqueAssinatura?.(quem, e.currentTarget)}
                >
                  {a?.url ? <img src={a.url} alt="" /> : a ? <span className={s.assinaturaNome}>{a.nome}</span> : <span>Toque para assinar</span>}
                  <small>{NOME_ASSINATURA[quem] || quem}</small>
                </button>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
