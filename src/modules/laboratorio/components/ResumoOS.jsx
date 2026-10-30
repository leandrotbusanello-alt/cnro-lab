import { useEffect, useRef, useState } from 'react'
import { obterResumo, anexarResumo, removerResumo, ehImagem, TIPOS_ACEITOS } from '../../../lib/resumoOS'
import { dataHora } from '../utils'
import ui from './ui.module.css'
import styles from './ResumoOS.module.css'

/**
 * Resumo da O.S. para o Campo (migração 38): imagem ou PDF com o resumo dos resultados de
 * todos os ensaios, para o inspetor de campo. Um arquivo por O.S.
 * Anexa/troca/exclui: laboratorista responsável e Gestor (podeGerir).
 * O Campo vê junto com os resultados, depois que algum ensaio é liberado.
 */
export default function ResumoOS({ pedido, podeGerir, usuarioId, usuariosPorId, onResumo, notificar }) {
  const [resumo, setResumo] = useState(undefined)   // undefined = carregando
  const [ocupado, setOcupado] = useState(false)
  const input = useRef(null)

  useEffect(() => {
    let ativo = true
    obterResumo(pedido.id).then(r => { if (ativo) { setResumo(r); onResumo?.(r) } }).catch(() => ativo && setResumo(null))
    return () => { ativo = false }
  }, [pedido.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!pedido.numero_os) return null
  if (!podeGerir && !resumo) return null

  async function escolher(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setOcupado(true)
    try {
      const r = await anexarResumo(pedido, file, usuarioId)
      setResumo(r); onResumo?.(r)
      notificar?.({ type: 'success', message: 'Resumo anexado. O Campo vê junto com os resultados liberados.' })
    } catch (err) {
      notificar?.({ type: 'error', message: err.message || 'Não foi possível anexar o resumo.' })
    } finally {
      setOcupado(false)
    }
  }

  async function excluir() {
    if (!window.confirm('Excluir o resumo desta O.S.? O Campo deixa de ver o arquivo.')) return
    setOcupado(true)
    try {
      await removerResumo(pedido.id)
      setResumo(null); onResumo?.(null)
      notificar?.({ type: 'success', message: 'Resumo excluído.' })
    } catch (err) {
      notificar?.({ type: 'error', message: err.message || 'Não foi possível excluir o resumo.' })
    } finally {
      setOcupado(false)
    }
  }

  const quem = resumo?.enviado_por ? usuariosPorId?.[resumo.enviado_por]?.nome : null

  return (
    <section className={ui.secao}>
      <div className={ui.secaoTitulo}>📊 Resumo para o Campo</div>
      {resumo === undefined && <div className={styles.carregando}>Carregando…</div>}
      {resumo === null && (
        <p className={styles.ajuda}>
          Imagem ou PDF com o resumo dos resultados da O.S., para o inspetor de campo ver junto com os resultados.
        </p>
      )}
      {resumo && (
        <div className={styles.arquivo}>
          {ehImagem(resumo) && resumo.url
            ? <a href={resumo.url} target="_blank" rel="noreferrer"><img src={resumo.url} alt="Resumo da O.S." className={styles.miniatura} /></a>
            : <a href={resumo.url || '#'} target="_blank" rel="noreferrer" className={styles.pdf}>📄 {resumo.nome || 'Resumo (PDF)'}</a>}
          <span className={styles.ajuda}>
            {resumo.nome}{quem ? ` · ${quem}` : ''} · {dataHora(resumo.enviado_em)}
          </span>
        </div>
      )}
      {podeGerir && (
        <div className={styles.acoes}>
          <input ref={input} type="file" accept={TIPOS_ACEITOS} hidden onChange={escolher} />
          <button type="button" className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`}
            onClick={() => input.current?.click()} disabled={ocupado || !navigator.onLine}>
            {ocupado ? 'Enviando…' : resumo ? '↻ Trocar arquivo' : '📎 Anexar resumo'}
          </button>
          {resumo && (
            <button type="button" className={`${ui.btn} ${ui.btnPerigo} ${ui.btnPequeno}`} onClick={excluir} disabled={ocupado}>
              🗑 Excluir
            </button>
          )}
        </div>
      )}
    </section>
  )
}
