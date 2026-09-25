import styles from '../gestor.module.css'

function iniciais(nome) {
  const partes = String(nome || '?').trim().split(/\s+/).filter(Boolean)
  const a = partes[0]?.[0] || '?'
  const b = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (a + b).toUpperCase()
}

export default function Avatar({ nome, url, grande = false }) {
  return (
    <span className={`${styles.avatar} ${grande ? styles.avatarGrande : ''}`} aria-hidden="true">
      {url ? <img src={url} alt="" /> : iniciais(nome)}
    </span>
  )
}
