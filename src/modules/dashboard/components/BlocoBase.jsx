import styles from './BlocoBase.module.css'

export default function BlocoBase({ icone, titulo, subtitulo, children, secundario }) {
  return (
    <section className={`${styles.bloco} ${secundario ? styles.secundario : ''}`}>
      <header className={styles.cabecalho}>
        <h2 className={styles.titulo}>{icone} {titulo}</h2>
        {subtitulo && <span className={styles.subtitulo}>{subtitulo}</span>}
      </header>
      {children}
    </section>
  )
}

export function Grade({ children }) {
  return <div className={styles.grade}>{children}</div>
}

export function SubTitulo({ children }) {
  return <h3 className={styles.subGrupo}>{children}</h3>
}
