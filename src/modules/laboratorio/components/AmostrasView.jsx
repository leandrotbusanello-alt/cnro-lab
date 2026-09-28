import { useState } from 'react'
import { normalizarAmostras, rotuloCampo, valorExibicao } from '../utils'
import { urlArquivo } from '../labRepo'
import styles from './AmostrasView.module.css'
import ui from './ui.module.css'

/** Exibição (somente leitura) das amostras do pedido */
export default function AmostrasView({ pedido }) {
  const amostras = normalizarAmostras(pedido.dados_amostra)
  const [idx, setIdx] = useState(0)
  const atual = amostras[Math.min(idx, amostras.length - 1)] || {}
  // info_geral = cópia usada só pelo formulário do Campo (os campos já estão na amostra)
  const campos = Object.entries(atual)
    .filter(([k, v]) => k !== 'info_geral' && v !== '' && v !== null && v !== undefined)

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
                  <span className={ui.kvValor}>
                    {k === 'certificado' && typeof v === 'string'
                      ? <AbrirArquivo caminho={v} />
                      : valorExibicao(v)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Certificado anexado pelo Campo (bucket privado): abre com link temporário */
function AbrirArquivo({ caminho }) {
  const [abrindo, setAbrindo] = useState(false)
  async function abrir() {
    setAbrindo(true)
    const url = await urlArquivo(caminho).catch(() => null)
    setAbrindo(false)
    if (url) window.open(url, '_blank', 'noopener')
    else window.alert('Não foi possível abrir o certificado (verifique a conexão).')
  }
  return (
    <button type="button" className={ui.btnLink} onClick={abrir} disabled={abrindo}>
      {abrindo ? 'Abrindo…' : '📎 Abrir certificado'}
    </button>
  )
}
