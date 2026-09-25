import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import NovaSenhaForm from './NovaSenhaForm'
import styles from './LoginPage.module.css'

/**
 * Troca de senha obrigatória: primeiro acesso ou senha resetada pelo Gestor
 * (usuarios.trocar_senha = true). Também serve para o usuário trocar a senha quando quiser.
 */
export default function TrocarSenhaPage() {
  const { perfil, carregando, trocarSenha, logout } = useAuthStore()
  const nav = useNavigate()

  if (carregando) return null
  if (!perfil) return <Navigate to="/login" replace />

  const obrigatoria = !!perfil.trocar_senha

  async function salvar(nova) {
    await trocarSenha(nova)
    nav('/', { replace: true })
  }

  async function sair() {
    await logout()
    nav('/login', { replace: true })
  }

  return (
    <div className={styles.bg}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoBox}>CNRO</div>
          <div className={styles.logoSub}>Lab Control</div>
        </div>

        <div className={styles.form}>
          <h1 className={styles.titulo}>{obrigatoria ? 'Crie a sua senha' : 'Trocar minha senha'}</h1>
          <p className={styles.texto}>
            {obrigatoria
              ? <>Olá, <strong>{perfil.nome}</strong>. Você está usando a senha provisória. Para continuar, defina uma senha pessoal.</>
              : 'Defina a sua nova senha.'}
          </p>
        </div>

        <div style={{ marginTop: 16 }}>
          <NovaSenhaForm onSalvar={salvar} textoBotao={obrigatoria ? 'Salvar e continuar' : 'Salvar nova senha'} />
        </div>

        <div className={styles.form} style={{ marginTop: 12 }}>
          {obrigatoria ? (
            <button type="button" className={styles.link} onClick={sair}>Sair</button>
          ) : (
            <button type="button" className={styles.link} onClick={() => nav(-1)}>← Voltar</button>
          )}
        </div>

        <p className={styles.footer}>Concessionária Nova Rota do Oeste</p>
      </div>
    </div>
  )
}
