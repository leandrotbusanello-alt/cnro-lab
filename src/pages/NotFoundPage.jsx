import { useNavigate } from 'react-router-dom'
import styles from './PlaceholderPage.module.css'

export default function NotFoundPage() {
  const nav = useNavigate()
  return (
    <div className={styles.container}>
      <div className={styles.icon}>🔍</div>
      <h2>Página não encontrada</h2>
      <p>O endereço acessado não existe.</p>
      <button className={styles.btn} onClick={() => nav('/')}>Voltar ao início</button>
    </div>
  )
}
