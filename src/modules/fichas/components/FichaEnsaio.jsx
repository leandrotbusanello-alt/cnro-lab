import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { LARGURA_VISAO_LISTA } from '../constants'
import FichaGrade from './FichaGrade'
import FichaLista from './FichaLista'
import s from './Ficha.module.css'

const NOME = { executor: 'Responsável executor', calculista: 'Responsável calculista' }

/**
 * Ficha de ensaio online — componente compartilhado entre o Assistente e o Laboratório.
 *
 *   <FichaEnsaio indice motor estado onEstado modo="preencher|revisao|leitura"
 *                assinaturas={{executor, calculista}} podeAssinar={{executor:true}}
 *                motivoSemAssinatura="…" usuarioNome="…"
 *                onAssinar={quem => …} onRemoverAssinatura={quem => …} />
 *
 * Assinar: o usuário clica no campo da assinatura, confirma, e a assinatura aparece
 * na ficha (e na impressão). Com a ficha assinada pelo responsável da etapa, os
 * campos ficam travados até a assinatura ser removida.
 */
export default function FichaEnsaio({
  indice, motor, estado, onEstado, modo = 'leitura',
  assinaturas = {}, podeAssinar = {}, motivoSemAssinatura, usuarioNome,
  onAssinar, onRemoverAssinatura, idBase = 'ficha',
}) {
  const [vista, setVista] = useState(() => (window.innerWidth < LARGURA_VISAO_LISTA ? 'lista' : 'grade'))
  const [confirmacao, setConfirmacao] = useState(null)   // { quem, rect }
  const [abaAtiva, setAbaAtiva] = useState(0)             // frente e verso: qual folha aparece na grade
  const folhas = indice.folhas || [indice]
  const folha = folhas[Math.min(abaAtiva, folhas.length - 1)]

  const etapa = modo === 'revisao' ? 'calculista' : modo === 'preencher' ? 'executor' : null
  const bloqueado = !!(etapa && assinaturas[etapa])

  useEffect(() => {
    if (!confirmacao) return undefined
    const fechar = e => { if (e.key === 'Escape') setConfirmacao(null) }
    document.addEventListener('keydown', fechar)
    return () => document.removeEventListener('keydown', fechar)
  }, [confirmacao])

  function mudarEntrada(a, v) {
    const entradas = { ...(estado?.entradas || {}) }
    if (v === null || v === undefined || v === '') delete entradas[a]
    else entradas[a] = v
    onEstado?.({ ...estado, entradas })
  }

  function mudarEscolha(grupo, opcao) {
    const escolhas = { ...(estado?.escolhas || {}) }
    if (opcao) escolhas[grupo] = opcao
    else delete escolhas[grupo]
    onEstado?.({ ...estado, escolhas })
  }

  function mudarVerificacao(a, marcado) {
    const verificacoes = { ...(estado?.verificacoes || {}) }
    if (marcado) verificacoes[a] = true
    else delete verificacoes[a]
    onEstado?.({ ...estado, verificacoes })
  }

  function cliqueAssinatura(quem, el) {
    if (modo === 'leitura') return
    const rect = el.getBoundingClientRect()
    setConfirmacao({ quem, rect })
  }

  const props = {
    indice, estado, modo, bloqueado, assinaturas,
    onEntrada: mudarEntrada, onEscolha: mudarEscolha, onVerificacao: mudarVerificacao, onCliqueAssinatura: cliqueAssinatura,
  }

  return (
    <div className={s.ficha}>
      <div className={s.barraVista} role="group" aria-label="Forma de exibição">
        <button type="button" aria-pressed={vista === 'grade'} className={vista === 'grade' ? s.vistaAtiva : ''} onClick={() => setVista('grade')}>
          Ficha
        </button>
        <button type="button" aria-pressed={vista === 'lista'} className={vista === 'lista' ? s.vistaAtiva : ''} onClick={() => setVista('lista')}>
          Lista
        </button>
        {bloqueado && <span className={s.travada}>🔒 Assinada — remova a assinatura para editar</span>}
      </div>

      {vista === 'grade' ? (
        <>
          {folhas.length > 1 && (
            <div className={s.abasFolha} role="tablist" aria-label="Páginas da ficha">
              {folhas.map((f, i) => (
                <button
                  key={f.id || 'principal'}
                  type="button"
                  role="tab"
                  aria-selected={f === folha}
                  className={f === folha ? s.abaAtiva : ''}
                  onClick={() => setAbaAtiva(i)}
                >
                  {f.titulo}
                </button>
              ))}
            </div>
          )}
          <div className={s.papel}>
            <FichaGrade {...props} folha={folha} motor={motor} destacar={modo !== 'leitura'} idBase={`${idBase}-g`} />
          </div>
        </>
      ) : (
        <FichaLista {...props} podeAssinar={podeAssinar} idBase={`${idBase}-l`} />
      )}

      {confirmacao && createPortal(
        <ConfirmacaoAssinatura
          {...confirmacao}
          assinada={!!assinaturas[confirmacao.quem]}
          pode={!!podeAssinar[confirmacao.quem]}
          motivo={motivoSemAssinatura}
          usuarioNome={usuarioNome}
          onFechar={() => setConfirmacao(null)}
          onAssinar={() => { setConfirmacao(null); onAssinar?.(confirmacao.quem) }}
          onRemover={() => { setConfirmacao(null); onRemoverAssinatura?.(confirmacao.quem) }}
        />,
        document.body,
      )}
    </div>
  )
}

function ConfirmacaoAssinatura({ quem, rect, assinada, pode, motivo, usuarioNome, onFechar, onAssinar, onRemover }) {
  const largura = 300
  const esquerda = Math.min(window.innerWidth - largura - 12, Math.max(12, rect.left + rect.width / 2 - largura / 2))
  const acima = rect.top > 220
  const estilo = { left: esquerda, width: largura, ...(acima ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }) }

  let corpo
  if (assinada && pode) {
    corpo = (
      <>
        <p>Remover sua assinatura de <b>{NOME[quem] || quem}</b>? A ficha volta a ficar editável.</p>
        <div className={s.popAcoes}>
          <button type="button" className={s.popBtn} onClick={onFechar}>Manter</button>
          <button type="button" className={`${s.popBtn} ${s.popPrimario}`} onClick={onRemover} autoFocus>Remover</button>
        </div>
      </>
    )
  } else if (assinada) {
    corpo = (
      <>
        <p><b>{NOME[quem] || quem}</b> já assinado.</p>
        <div className={s.popAcoes}><button type="button" className={s.popBtn} onClick={onFechar} autoFocus>Fechar</button></div>
      </>
    )
  } else if (!pode) {
    corpo = (
      <>
        <p>{motivo || (quem === 'calculista'
          ? 'Este campo é assinado pelo laboratorista, ao aprovar a ficha.'
          : 'Este campo é assinado pelo executor do ensaio.')}</p>
        <div className={s.popAcoes}><button type="button" className={s.popBtn} onClick={onFechar} autoFocus>Entendi</button></div>
      </>
    )
  } else {
    corpo = (
      <>
        <p>Assinar como <b>{usuarioNome}</b> ({NOME[quem] || quem})?</p>
        <p className={s.popAjuda}>Confira os dados antes. Depois de assinada, a ficha fica travada até você remover a assinatura.</p>
        <div className={s.popAcoes}>
          <button type="button" className={s.popBtn} onClick={onFechar}>Cancelar</button>
          <button type="button" className={`${s.popBtn} ${s.popPrimario}`} onClick={onAssinar} autoFocus>Assinar</button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className={s.popFundo} onClick={onFechar} />
      <div className={s.pop} style={estilo} role="dialog" aria-label="Assinatura">{corpo}</div>
    </>
  )
}
