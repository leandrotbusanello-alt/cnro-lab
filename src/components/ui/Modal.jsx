import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import styles from './Modal.module.css'

/**
 * Modal genérico.
 * <Modal aberto titulo="..." onFechar={fn} rodape={<>botões</>} largura="md|lg">conteúdo</Modal>
 */
export default function Modal({ aberto = true, titulo, subtitulo, onFechar, rodape, largura = 'md', children }) {
  useEffect(() => {
    if (!aberto) return
    const onKey = e => { if (e.key === 'Escape') onFechar?.() }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [aberto, onFechar])

  if (!aberto) return null

  return createPortal(
    <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onFechar?.() }}>
      <div className={`${styles.modal} ${styles[largura] || ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <header className={styles.header}>
          <div className={styles.titulos}>
            <h3 className={styles.titulo}>{titulo}</h3>
            {subtitulo && <p className={styles.subtitulo}>{subtitulo}</p>}
          </div>
          {onFechar && (
            <button type="button" className={styles.fechar} onClick={onFechar} aria-label="Fechar">×</button>
          )}
        </header>
        <div className={styles.corpo}>{children}</div>
        {rodape && <footer className={styles.rodape}>{rodape}</footer>}
      </div>
    </div>,
    document.body,
  )
}
