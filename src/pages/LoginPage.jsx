import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import styles from './LoginPage.module.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const nav = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setErro(''); setLoading(true)
    try {
      await login(email, senha)
      nav('/')
    } catch (err) {
      setErro(err.message || 'Credenciais inválidas.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.bg}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoBox}>CNRO</div>
          <div className={styles.logoSub}>Lab Control</div>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            E-mail
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              className={styles.input} placeholder="seu@email.com" required autoFocus
            />
          </label>
          <label className={styles.label}>
            Senha
            <input
              type="password" value={senha} onChange={e => setSenha(e.target.value)}
              className={styles.input} placeholder="••••••••" required
            />
          </label>

          {erro && <div className={styles.erro}>{erro}</div>}

          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className={styles.footer}>Concessionária Nova Rota do Oeste</p>
      </div>
    </div>
  )
}
