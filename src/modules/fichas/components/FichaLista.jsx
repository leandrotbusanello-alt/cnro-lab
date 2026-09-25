import { useMemo } from 'react'
import { gruposDaLista } from '../motor/ficha.js'
import CampoCelula from './CampoCelula'
import s from './Ficha.module.css'

/**
 * Visão em lista (celular): os mesmos campos e cálculos da ficha, agrupados
 * (p.ex. por CP), com campos grandes para digitar no campo/bancada.
 */
export default function FichaLista({
  indice, estado, modo = 'preencher', bloqueado = false, idBase = 'lista',
  assinaturas = {}, podeAssinar = {}, onEntrada, onEscolha, onVerificacao, onCliqueAssinatura,
}) {
  const grupos = useMemo(() => gruposDaLista(indice, { incluirRevisao: modo === 'revisao' }), [indice, modo])
  const ordem = useMemo(() => grupos.flatMap(g => g.itens.filter(i => i.endereco).map(i => i.endereco)), [grupos])
  const podeEntrada = !bloqueado && (modo === 'preencher' || modo === 'revisao')
  const podeRevisao = !bloqueado && modo === 'revisao'

  function navegar(a, passo) {
    const prox = ordem[ordem.indexOf(a) + passo]
    if (prox) document.getElementById(`${idBase}-${prox}`)?.focus()
    else document.activeElement?.blur?.()
  }

  const nomeAssinatura = { executor: 'Responsável executor', calculista: 'Responsável calculista' }

  return (
    <div className={s.lista}>
      {grupos.map((g, gi) => (
        <section key={gi} className={s.grupo}>
          <h3 className={s.grupoTitulo}>{g.titulo}</h3>
          <div className={s.grupoItens}>
            {g.itens.map(item => {
              if (item.tipo === 'escolha') {
                const atual = estado?.escolhas?.[item.grupo] || null
                return (
                  <div key={item.grupo} className={`${s.item} ${s.itemLargo}`}>
                    <span className={s.itemRotulo}>{item.rotulo}</span>
                    <div className={s.opcoes} role="group" aria-label={item.rotulo}>
                      {item.opcoes.map(o => (
                        <button
                          key={o.opcao}
                          type="button"
                          className={`${s.opcao} ${atual === o.opcao ? s.opcaoAtiva : ''}`}
                          disabled={!podeEntrada}
                          aria-pressed={atual === o.opcao}
                          onClick={() => onEscolha?.(item.grupo, atual === o.opcao ? null : o.opcao)}
                        >
                          {o.opcao}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              }
              if (item.tipo === 'verificacao') {
                const marcado = !!estado?.verificacoes?.[item.endereco]
                return (
                  <label key={item.endereco} className={`${s.item} ${s.itemLargo} ${s.itemVerificacao}`}>
                    <input
                      type="checkbox"
                      checked={marcado}
                      disabled={!podeEntrada}
                      onChange={() => onVerificacao?.(item.endereco, !marcado)}
                    />
                    <span>{item.rotulo}</span>
                  </label>
                )
              }
              const d = (indice.cells || indice.modelo.cells)[item.endereco]
              const editavel = item.tipo === 'revisao' ? podeRevisao : podeEntrada
              return (
                <label key={item.endereco} className={`${s.item} ${item.multilinha ? s.itemLargo : ''}`}>
                  <span className={s.itemRotulo}>{item.rotulo}</span>
                  <CampoCelula
                    id={`${idBase}-${item.endereco}`}
                    className={item.multilinha ? s.itemArea : s.itemCampo}
                    valor={estado?.entradas?.[item.endereco]}
                    dado={item.dado}
                    nf={d?.nf}
                    multilinha={item.multilinha}
                    editavel={editavel}
                    rotulo={item.rotulo}
                    onConfirmar={v => onEntrada?.(item.endereco, v)}
                    onNavegar={p => navegar(item.endereco, p)}
                  />
                </label>
              )
            })}
          </div>
        </section>
      ))}

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
                disabled={!podeAssinar[quem] && !a}
                onClick={e => onCliqueAssinatura?.(quem, e.currentTarget)}
              >
                {a?.url ? <img src={a.url} alt="" /> : a ? <span className={s.assinaturaNome}>{a.nome}</span> : <span>Toque para assinar</span>}
                <small>{nomeAssinatura[quem] || quem}</small>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
