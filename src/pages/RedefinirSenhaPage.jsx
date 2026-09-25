import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import NovaSenhaForm from './NovaSenhaForm'
import styles from './LoginPage.module.css'

// O link do e-mail chega com #access_token=... ou #error=...; guardado antes de o
// Supabase processar e limpar o endereço.
const ENDERECO_INICIAL = window.location.hash + '&' + window.location.search.replace(/^\?/, '')

function erroDoLink() {
  const p = new URLSearchParams(ENDERECO_INICIAL.replace(/^#/, ''))
  const codigo = p.get('error_code') || p.get('error')
  if (!codigo) return null
  if (/expired/i.test(codigo)) return 'Este link expirou. Peça um novo na tela de login ("Esqueci minha senha").'
  return 'Link inválido ou já utilizado. Peça um novo na tela de login ("Esqueci minha senha").'
}

/** Destino do link de recuperação de senha enviado por e-mail. */
export default function RedefinirSenhaPage() {
  const [estado, setEstado] = useState(() => (erroDoLink() ? 'invalido' : 'aguardando'))
  const [mensagem] = useState(erroDoLink)
  const { trocarSenha, recarregarPerfil } = useAuthStore()
  const nav = useNavigate()

  useEffect(() => {
    if (estado !== 'aguardando') return
    let ativo = true
    supabase.auth.getSession().then(({ data }) => {
      if (ativo && data.session) setEstado('pronto')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((evento, session) => {
      if (ativo && session && (evento === 'PASSWORD_RECOVERY' || evento === 'SIGNED_IN')) setEstado('pronto')
    })
    const t = setTimeout(() => {
      if (ativo) setEstado(e => (e === 'aguardando' ? 'invalido' : e))
    }, 6000)
    return () => { ativo = false; clearTimeout(t); sub.subscription.unsubscribe() }
  }, [estado])

  async function salvar(nova) {
    await trocarSenha(nova)
    await recarregarPerfil()
    nav('/', { replace: true })
  }

  return (
    <div className={styles.bg}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoBox}>CNRO</div>
          <div className={styles.logoSub}>Lab Control</div>
        </div>

        <div className={styles.form}>
          <h1 className={styles.titulo}>Definir nova senha</h1>

          {estado === 'aguardando' && <p className={styles.texto}>Validando o link...</p>}

          {estado === 'invalido' && (
            <>
              <div className={styles.erro}>
                {mensagem || 'Link inválido ou expirado. Peça um novo na tela de login ("Esqueci minha senha").'}
              </div>
              <button type="button" className={styles.btn} onClick={() => nav('/login', { replace: true })}>
                Ir para o login
              </button>
            </>
          )}

          {estado === 'pronto' && (
            <p className={styles.texto}>
              Digite a nova senha. Se quiser, pode repetir a senha que você já usava
              (só não pode ser a senha padrão 123456).
            </p>
          )}
        </div>

        {estado === 'pronto' && (
          <div style={{ marginTop: 16 }}>
            <NovaSenhaForm onSalvar={salvar} textoBotao="Salvar e entrar" />
          </div>
        )}

        <p className={styles.footer}>Concessionária Nova Rota do Oeste</p>
      </div>
    </div>
  )
}
