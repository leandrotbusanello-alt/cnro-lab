import { useEffect, useRef, useState } from 'react'
import { LIMITE_ASSINATURA_MB, LIMITE_FOTO_MB } from '../constants'
import { enviarArquivoUsuario, removerArquivoUsuario, urlArquivo } from '../gestorRepo'
import styles from '../gestor.module.css'

const CONFIG = {
  assinatura: {
    titulo: 'Assinatura',
    aceita: 'image/png',
    tipos: ['image/png'],
    limiteMb: LIMITE_ASSINATURA_MB,
    ajuda: `PNG com fundo transparente, até ${LIMITE_ASSINATURA_MB} MB. Usada nas O.S. e revisões.`,
    erroTipo: 'A assinatura deve ser um arquivo PNG (de preferência com fundo transparente).',
  },
  foto: {
    titulo: 'Foto',
    aceita: 'image/png,image/jpeg,image/webp',
    tipos: ['image/png', 'image/jpeg', 'image/webp'],
    limiteMb: LIMITE_FOTO_MB,
    ajuda: `JPG, PNG ou WEBP, até ${LIMITE_FOTO_MB} MB.`,
    erroTipo: 'A foto deve ser JPG, PNG ou WEBP.',
  },
}

/** Envio / troca / remoção da assinatura ou da foto de um usuário */
export default function ArquivoUsuario({ usuario, tipo, podeEditar, onAtualizado, notificar }) {
  const cfg = CONFIG[tipo]
  const coluna = tipo === 'assinatura' ? 'assinatura_url' : 'foto_url'
  const caminho = usuario[coluna]
  const [url, setUrl] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [confirmaRemover, setConfirmaRemover] = useState(false)
  const input = useRef(null)

  useEffect(() => {
    let ativo = true
    setUrl(null)
    if (!caminho) return
    setCarregando(true)
    urlArquivo(usuario, tipo)
      .then(u => { if (ativo) setUrl(u) })
      .finally(() => { if (ativo) setCarregando(false) })
    return () => { ativo = false }
  }, [caminho]) // eslint-disable-line react-hooks/exhaustive-deps

  async function escolher(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErro('')
    if (!cfg.tipos.includes(file.type)) { setErro(cfg.erroTipo); return }
    if (file.size > cfg.limiteMb * 1024 * 1024) { setErro(`Arquivo maior que ${cfg.limiteMb} MB.`); return }
    setOcupado(true)
    try {
      const atualizado = await enviarArquivoUsuario(usuario, tipo, file)
      onAtualizado(atualizado)
      notificar(`${cfg.titulo} salva.`)
    } catch (err) {
      setErro(err.message || 'Não foi possível enviar.')
    } finally {
      setOcupado(false)
    }
  }

  async function remover() {
    setOcupado(true); setErro('')
    try {
      const atualizado = await removerArquivoUsuario(usuario, tipo)
      onAtualizado(atualizado)
      notificar(`${cfg.titulo} removida.`)
      setConfirmaRemover(false)
    } catch (err) {
      setErro(err.message || 'Não foi possível remover.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className={styles.arquivo}>
      <span className={styles.rotulo}>{cfg.titulo}</span>
      <div className={styles.previa}>
        {ocupado ? 'Enviando...'
          : carregando ? 'Carregando...'
          : url ? <img src={url} alt={`${cfg.titulo} de ${usuario.nome}`} />
          : caminho ? 'Não foi possível exibir'
          : 'Nenhuma cadastrada'}
      </div>
      <span className={styles.ajuda}>{cfg.ajuda}</span>

      {erro && <div className={`${styles.aviso} ${styles.avisoErro}`}>{erro}</div>}

      {podeEditar && (
        confirmaRemover ? (
          <div className={styles.acoes}>
            <button type="button" className={`${styles.btn} ${styles.btnSecundario} ${styles.btnPequeno}`}
              onClick={() => setConfirmaRemover(false)} disabled={ocupado}>Cancelar</button>
            <button type="button" className={`${styles.btn} ${styles.btnPerigo} ${styles.btnPequeno}`}
              onClick={remover} disabled={ocupado}>Remover</button>
          </div>
        ) : (
          <div className={styles.acoes}>
            <input ref={input} type="file" accept={cfg.aceita} className={styles.arquivoInput} onChange={escolher} />
            <button type="button" className={`${styles.btn} ${styles.btnSecundario} ${styles.btnPequeno}`}
              onClick={() => input.current?.click()} disabled={ocupado}>
              {caminho ? 'Trocar' : 'Enviar'}
            </button>
            {caminho && (
              <button type="button" className={`${styles.btn} ${styles.btnPerigo} ${styles.btnPequeno}`}
                onClick={() => setConfirmaRemover(true)} disabled={ocupado}>Remover</button>
            )}
          </div>
        )
      )}
    </div>
  )
}
