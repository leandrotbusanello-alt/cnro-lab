import { useState } from 'react'
import CampoSenha from '../components/ui/CampoSenha'
import styles from './LoginPage.module.css'

const SENHA_PADRAO = '123456'

/** Formulário "nova senha + confirmar", usado na troca obrigatória e na recuperação. */
export default function NovaSenhaForm({ textoBotao = 'Salvar nova senha', onSalvar }) {
  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  const regras = [
    { ok: nova.length >= 6, texto: 'Pelo menos 6 caracteres' },
    { ok: nova !== '' && nova !== SENHA_PADRAO, texto: 'Diferente da senha padrão (123456)' },
    { ok: confirma !== '' && nova === confirma, texto: 'As duas senhas são iguais' },
  ]
  const valida = regras.every(r => r.ok)

  async function enviar(e) {
    e.preventDefault()
    if (!valida) { setErro('Confira as regras da senha.'); return }
    setErro(''); setLoading(true)
    try {
      await onSalvar(nova)
    } catch (err) {
      setErro(err.message || 'Não foi possível salvar a senha.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={enviar} className={styles.form}>
      <label className={styles.label}>
        Nova senha
        <CampoSenha
          value={nova} onChange={e => setNova(e.target.value)}
          className={styles.input} required autoFocus autoComplete="new-password"
        />
      </label>
      <label className={styles.label}>
        Confirme a nova senha
        <CampoSenha
          value={confirma} onChange={e => setConfirma(e.target.value)}
          className={styles.input} required autoComplete="new-password"
        />
      </label>

      <ul className={styles.regras}>
        {regras.map(r => (
          <li key={r.texto} className={r.ok ? styles.regraOk : ''}>{r.ok ? '✓ ' : ''}{r.texto}</li>
        ))}
      </ul>

      {erro && <div className={styles.erro}>{erro}</div>}

      <button type="submit" className={styles.btn} disabled={loading || !valida}>
        {loading ? 'Salvando...' : textoBotao}
      </button>
    </form>
  )
}
