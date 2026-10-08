import { useMemo } from 'react'
import { gruposDaLista, CAMPOS_PEDIDO_EDITAVEIS } from '../motor/ficha.js'
import CampoCelula from './CampoCelula'
import Grafico from './Grafico'
import FotoCelula from './FotoCelula'
import s from './Ficha.module.css'

/**
 * Visão em lista (celular): os mesmos campos e cálculos da ficha, agrupados
 * (p.ex. por CP), com campos grandes para digitar no campo/bancada.
 */
export default function FichaLista({
  indice, motor, estado, modo = 'preencher', bloqueado = false, idBase = 'lista',
  assinaturas = {}, podeAssinar = {}, onEntrada, onEscolha, onVerificacao, onCliqueAssinatura, fotos,
  onTraco, onMarcar, tracoOpcoes,
}) {
  const grupos = useMemo(() => gruposDaLista(indice, { incluirRevisao: modo === 'revisao' }), [indice, modo])
  const ordem = useMemo(() => grupos.flatMap(g => g.itens.filter(i => i.endereco).map(i => i.endereco)), [grupos])
  const graficos = useMemo(
    () => (indice.folhas || [indice]).flatMap(folha => (folha.modelo.graficos || []).map(g => ({ g, folha }))),
    [indice],
  )
  const podeEntrada = !bloqueado && (modo === 'preencher' || modo === 'revisao')
  const podeRevisao = !bloqueado && modo === 'revisao'

  function navegar(a, passo) {
    const prox = ordem[ordem.indexOf(a) + passo]
    if (prox) document.getElementById(`${idBase}-${prox}`)?.focus()
    else document.activeElement?.blur?.()
  }

  const nomeAssinatura = { executor: 'Responsável executor', calculista: 'Responsável calculista' }
  const cabecalho = podeEntrada
    ? indice.papeis.pedido.filter(a => CAMPOS_PEDIDO_EDITAVEIS.includes(indice.cells[a].role.campo))
    : []
  const ROTULO_PEDIDO = { material: 'Material', procedencia: 'Procedência do material', complemento: 'Informações complementares' }

  return (
    <div className={s.lista}>
      {cabecalho.length > 0 && (
        <section className={s.grupo}>
          <h3 className={s.grupoTitulo}>Cabeçalho (vem do pedido — pode ajustar)</h3>
          <div className={s.grupoItens}>
            {cabecalho.map(a => {
              const v = motor.valores.get(a)
              const rot = ROTULO_PEDIDO[indice.cells[a].role.campo] || a
              return (
                <label key={a} className={`${s.item} ${s.itemLargo}`}>
                  <span className={s.itemRotulo}>{rot}</span>
                  <CampoCelula id={`${idBase}-${a}`} className={s.itemArea} valor={v == null ? '' : String(v)} dado="texto"
                    multilinha editavel rotulo={rot} onConfirmar={novo => onEntrada?.(a, novo === null ? '' : novo)} />
                </label>
              )
            })}
          </div>
        </section>
      )}
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
              if (item.tipo === 'foto') {
                return (
                  <div key={item.endereco} className={`${s.item} ${s.itemLargo}`}>
                    <span className={s.itemRotulo}>{item.rotulo}</span>
                    <FotoCelula
                      lista
                      foto={estado?.fotos?.[item.endereco]}
                      texto="Sem foto"
                      rotulo={item.rotulo}
                      editavel={podeEntrada && !!fotos}
                      onEscolher={f => fotos?.adicionar(item.endereco, f)}
                      onRemover={() => fotos?.remover(item.endereco)}
                    />
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
              if (d?.role?.marca) {
                const valor = estado?.entradas?.[item.endereco] || ''
                return (
                  <div key={item.endereco} className={s.item}>
                    <span className={s.itemRotulo}>{item.rotulo}</span>
                    <button type="button" id={`${idBase}-${item.endereco}`} className={`${s.itemCampo} ${s.marcaLista}`}
                      disabled={!editavel} aria-pressed={!!valor} aria-label={item.rotulo}
                      onClick={() => onMarcar?.(item.endereco)}>
                      {valor || '—'}
                    </button>
                  </div>
                )
              }
              const ehTraco = indice.traco?.celula === item.endereco
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
                    opcoes={ehTraco ? tracoOpcoes : d?.role?.opcoes}
                    editavel={editavel}
                    rotulo={item.rotulo}
                    onConfirmar={v => (ehTraco ? onTraco?.(v) : onEntrada?.(item.endereco, v))}
                    onNavegar={p => navegar(item.endereco, p)}
                  />
                </label>
              )
            })}
          </div>
        </section>
      ))}

      {motor && graficos.length > 0 && (
        <section className={s.grupo}>
          <h3 className={s.grupoTitulo}>Gráficos</h3>
          {graficos.map(({ g, folha }, i) => (
            <div key={i} className={s.graficoLista}>
              <Grafico g={g} motor={motor} prefixo={folha.prefixo || ''} cells={indice.cells} responsivo />
            </div>
          ))}
        </section>
      )}

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
