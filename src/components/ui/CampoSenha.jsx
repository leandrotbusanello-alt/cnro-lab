import { useState } from 'react'
import styles from './CampoSenha.module.css'

/**
 * Campo de senha com botão "olhinho" para mostrar/ocultar o que foi digitado.
 * Aceita as mesmas props de um <input> (value, onChange, placeholder, autoComplete...).
 * `className` é aplicada ao <input> (para herdar o estilo da tela).
 */
export default function CampoSenha({ className = '', ...props }) {
  const [visivel, setVisivel] = useState(false)

  return (
    <div className={styles.wrap}>
      <input
        {...props}
        type={visivel ? 'text' : 'password'}
        className={`${className} ${styles.input}`}
      />
      <button
        type="button"
        className={styles.olho}
        onClick={() => setVisivel(v => !v)}
        aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        title={visivel ? 'Ocultar senha' : 'Mostrar senha'}
      >
        {visivel ? (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 9 4.5 10 7a13 13 0 01-3.2 4.2M6.2 6.2A13.4 13.4 0 002 12c1 2.5 5 7 10 7a9.7 9.7 0 004.1-.9" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" />
            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        )}
      </button>
    </div>
  )
}
