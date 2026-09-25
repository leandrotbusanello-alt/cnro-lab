import { Link } from 'react-router-dom'
import styles from './StatTile.module.css'

/**
 * Um número do painel. Clicável quando `href` é informado (abre a lista já
 * filtrada); só informativo quando não há lista correspondente (ex.: os
 * contadores de ensaios do bloco "Geral do laboratório").
 */
export default function StatTile({ valor, rotulo, tom = 'neutro', href, destaque }) {
  const conteudo = (
    <>
      <span className={styles.valor}>{valor}</span>
      <span className={styles.rotulo}>{rotulo}</span>
    </>
  )
  const classe = `${styles.tile} ${styles[tom] || ''} ${destaque ? styles.destaque : ''} ${href ? styles.clicavel : ''}`

  if (href) return <Link to={href} className={classe}>{conteudo}</Link>
  return <div className={classe}>{conteudo}</div>
}
