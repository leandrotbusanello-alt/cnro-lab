import { useRef } from 'react'
import { useUrlFoto } from '../fotosFicha'
import s from './Ficha.module.css'

/**
 * Quadro de foto da ficha (papel "foto").
 *   foto       estado.fotos[célula] ({ local, caminho }) ou nada
 *   texto      texto do quadro vazio ("Inserir Foto 01")
 *   editavel   mostra os botões Tirar/escolher · Trocar · Remover
 *   lista      versão da visão em lista (celular)
 */
export default function FotoCelula({ foto, texto, rotulo, editavel, altura, lista = false, onEscolher, onRemover }) {
  const input = useRef(null)
  const { url, carregando, indisponivel } = useUrlFoto(foto)
  const pendente = !!(foto?.local && !foto.caminho)

  function escolher(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) onEscolher?.(f)
  }

  return (
    <div className={lista ? s.fotoLista : s.fotoCelula} style={altura ? { height: altura } : undefined}>
      {url && <img src={url} alt={rotulo || texto || 'Foto'} className={s.fotoImagem} />}
      {!foto && <span className={s.fotoTexto}>{texto}</span>}
      {foto && carregando && <span className={s.fotoTexto}>Carregando foto…</span>}
      {foto && indisponivel && (
        <span className={s.fotoTexto}>{pendente ? 'Foto ainda no aparelho de quem tirou (não enviada).' : 'Foto indisponível sem internet.'}</span>
      )}
      {editavel && (
        <div className={s.fotoAcoes}>
          {pendente && <span className={s.fotoPendente} title="A foto será enviada ao servidor quando houver internet">⏳ não enviada</span>}
          <button type="button" className={s.fotoBotao} onClick={() => input.current?.click()}>
            📷 {foto ? 'Trocar' : 'Tirar / escolher foto'}
          </button>
          {foto && <button type="button" className={s.fotoBotao} onClick={() => onRemover?.()}>Remover</button>}
          <input ref={input} type="file" accept="image/*" hidden onChange={escolher} />
        </div>
      )}
    </div>
  )
}
