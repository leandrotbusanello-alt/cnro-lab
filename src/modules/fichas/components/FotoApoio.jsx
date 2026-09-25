import { useEffect, useRef, useState } from 'react'
import { arquivoSalvar, arquivoObter, arquivosListar, arquivoRemover } from '../../../lib/offlineDB'
import s from './Ficha.module.css'

/**
 * Foto/PDF da ficha em papel, exibido ao lado da ficha online para ajudar na digitação.
 * Fica SÓ neste aparelho (não vai para o servidor) e é apagado quando o ensaio é enviado.
 */
export default function FotoApoio({ ensaioOsId, onFechar }) {
  const [arquivos, setArquivos] = useState([])   // [{ chave, url, tipo, nome }]
  const [atual, setAtual] = useState(0)
  const [zoom, setZoom] = useState(1)
  const input = useRef(null)
  const prefixo = `apoio:${ensaioOsId}:`

  useEffect(() => {
    let ativo = true
    const urls = []
    ;(async () => {
      const chaves = await arquivosListar(prefixo)
      const lista = []
      for (const chave of chaves) {
        const blob = await arquivoObter(chave)
        if (!blob) continue
        const url = URL.createObjectURL(blob)
        urls.push(url)
        lista.push({ chave, url, tipo: blob.type, nome: blob.name || 'arquivo' })
      }
      if (ativo) setArquivos(lista)
    })().catch(() => {})
    return () => { ativo = false; urls.forEach(u => URL.revokeObjectURL(u)) }
  }, [prefixo])

  async function adicionar(e) {
    const novos = []
    for (const f of e.target.files || []) {
      const chave = `${prefixo}${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      await arquivoSalvar(chave, f)
      novos.push({ chave, url: URL.createObjectURL(f), tipo: f.type, nome: f.name })
    }
    e.target.value = ''
    setAtual(arquivos.length)
    setArquivos(l => [...l, ...novos])
  }

  async function remover(i) {
    const a = arquivos[i]
    await arquivoRemover(a.chave)
    URL.revokeObjectURL(a.url)
    setArquivos(l => l.filter((_, j) => j !== i))
    setAtual(0)
  }

  const a = arquivos[Math.min(atual, arquivos.length - 1)]

  return (
    <aside className={s.apoio}>
      <div className={s.apoioBarra}>
        <strong>Foto de apoio</strong>
        <div className={s.apoioAcoes}>
          <button type="button" className={s.popBtn} onClick={() => input.current?.click()}>+ Foto / PDF</button>
          {onFechar && <button type="button" className={s.popBtn} onClick={onFechar} aria-label="Fechar foto de apoio">✕</button>}
        </div>
        <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={adicionar} />
      </div>
      <p className={s.apoioAjuda}>Fica só neste aparelho e é apagada ao enviar a ficha.</p>

      {arquivos.length > 1 && (
        <div className={s.apoioAbas}>
          {arquivos.map((x, i) => (
            <button key={x.chave} type="button" className={i === atual ? s.vistaAtiva : ''} onClick={() => { setAtual(i); setZoom(1) }}>
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {!a ? (
        <button type="button" className={s.apoioVazio} onClick={() => input.current?.click()}>
          Toque para fotografar ou escolher a ficha em papel
        </button>
      ) : (
        <>
          <div className={s.apoioVisor}>
            {a.tipo === 'application/pdf'
              ? <iframe title="Ficha em PDF" src={a.url} />
              : <img src={a.url} alt="Ficha em papel" style={{ width: `${zoom * 100}%` }} />}
          </div>
          <div className={s.apoioRodape}>
            {a.tipo !== 'application/pdf' && (
              <>
                <button type="button" className={s.popBtn} onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>−</button>
                <span>{Math.round(zoom * 100)}%</span>
                <button type="button" className={s.popBtn} onClick={() => setZoom(z => Math.min(4, z + 0.25))}>+</button>
              </>
            )}
            <span className={s.espaco} />
            <button type="button" className={s.popBtn} onClick={() => remover(Math.min(atual, arquivos.length - 1))}>Remover</button>
          </div>
        </>
      )}
    </aside>
  )
}

/** Apaga as fotos de apoio de um ensaio (chamado ao enviar para revisão). */
export async function apagarFotosApoio(ensaioOsId) {
  const chaves = await arquivosListar(`apoio:${ensaioOsId}:`)
  for (const c of chaves) await arquivoRemover(c)
}
