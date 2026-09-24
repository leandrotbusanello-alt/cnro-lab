import { useState } from 'react'
import { normalizarAmostras, rotuloCampo, valorExibicao } from '../utils'
import styles from './AmostrasView.module.css'
import ui from './ui.module.css'

/** Exibição (somente leitura) das amostras do pedido */
export default function AmostrasView({ pedido }) {
  const amostras = normalizarAmostras(pedido.dados_amostra)
  const [idx, setIdx] = useState(0)
  const atual = amostras[Math.min(idx, amostras.length - 1)] || {}
  const campos = Object.entries(atual).filter(([, v]) => v !== '' && v !== null && v !== undefined)

  return (
    <section className={ui.secao}>
      <div className={ui.secaoTitulo}>
        Amostras <span className={styles.qtd}>{amostras.length}</span>
      </div>

      {amostras.length === 0 ? (
        <p className={ui.vazio}>Nenhum dado de amostra informado.</p>
      ) : (
        <>
          {amostras.length > 1 && (
            <div className={styles.abas}>
              {amostras.map((_, i) => (
                <button
                  key={i}
                  className={`${styles.aba} ${i === idx ? styles.abaAtiva : ''}`}
                  onClick={() => setIdx(i)}
                >
                  Amostra {i + 1}
                </button>
              ))}
            </div>
          )}
          {campos.length === 0 ? (
            <p className={ui.vazio}>Amostra sem dados preenchidos.</p>
          ) : (
            <div className={ui.kv}>
              {campos.map(([k, v]) => (
                <div key={k} className={ui.kvItem}>
                  <span className={ui.kvChave}>{rotuloCampo(k)}</span>
                  <span className={ui.kvValor}>{valorExibicao(v)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
