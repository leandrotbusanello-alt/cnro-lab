import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import CampoSenha from '../components/ui/CampoSenha'
import styles from './LoginPage.module.css'

export default function LoginPage() {
  const [modo, setModo] = useState('entrar') // 'entrar' | 'esqueci'
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, recuperarSenha, avisoLogin, limparAviso } = useAuthStore()
  const nav = useNavigate()

  function trocarModo(m) {
    setModo(m); setErro(''); setOk(''); limparAviso()
  }

  async function entrar(e) {
    e.preventDefault()
    setErro(''); setLoading(true)
    try {
      const perfil = await login(email, senha)
      nav(perfil?.trocar_senha ? '/trocar-senha' : '/')
    } catch (err) {
      setErro(err.message || 'Credenciais inválidas.')
    } finally {
      setLoading(false)
    }
  }

  async function enviarRecuperacao(e) {
    e.preventDefault()
    setErro(''); setOk(''); setLoading(true)
    try {
      await recuperarSenha(email)
      setOk('Se este e-mail estiver cadastrado, você receberá um link para definir a senha. Confira também a caixa de spam.')
    } catch (err) {
      setErro(err.message)
    } finally {
      setLoading(false)
    }
  }

  const aviso = erro || avisoLogin

  return (
    <div className={styles.bg}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoBox}>CNRO</div>
          <div className={styles.logoSub}>Lab Control</div>
        </div>

        {modo === 'entrar' ? (
          <form onSubmit={entrar} className={styles.form}>
            <label className={styles.label}>
              E-mail
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className={styles.input} placeholder="seu@email.com" required autoFocus
                autoComplete="username"
              />
            </label>
            <label className={styles.label}>
              Senha
              <CampoSenha
                value={senha} onChange={e => setSenha(e.target.value)}
                className={styles.input} placeholder="••••••••" required
                autoComplete="current-password"
              />
            </label>

            {aviso && <div className={styles.erro}>{aviso}</div>}

            <button type="submit" className={styles.btn} disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>

            <button type="button" className={styles.link} onClick={() => trocarModo('esqueci')}>
              Esqueci minha senha
            </button>
          </form>
        ) : (
          <form onSubmit={enviarRecuperacao} className={styles.form}>
            <p className={styles.texto}>
              Informe o seu e-mail. Enviaremos um link para você definir a senha
              (pode ser a mesma de antes, se preferir).
            </p>
            <label className={styles.label}>
              E-mail
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className={styles.input} placeholder="seu@email.com" required autoFocus
                autoComplete="username"
              />
            </label>

            {erro && <div className={styles.erro}>{erro}</div>}
            {ok && <div className={styles.ok}>{ok}</div>}

            <button type="submit" className={styles.btn} disabled={loading || !!ok}>
              {loading ? 'Enviando...' : 'Enviar link'}
            </button>

            <button type="button" className={styles.link} onClick={() => trocarModo('entrar')}>
              ← Voltar para o login
            </button>
          </form>
        )}

        <p className={styles.footer}>Concessionária Nova Rota do Oeste</p>
      </div>
    </div>
  )
}
