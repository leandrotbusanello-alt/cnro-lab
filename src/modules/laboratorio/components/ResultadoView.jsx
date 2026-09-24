import { rotuloCampo, valorExibicao } from '../utils'
import styles from './ResultadoView.module.css'
import ui from './ui.module.css'

const OCULTOS = ['id', 'resultado_id', 'created_at', 'updated_at']

/**
 * Exibição genérica de resultados (JSON de dados_resultado ou linhas de resultado_*).
 * Primitivos → chave/valor · listas de objetos → tabela · objetos → subseção.
 */
export default function ResultadoView({ dados, titulo }) {
  if (dados === null || dados === undefined) return null
  if (Array.isArray(dados)) return <Tabela linhas={dados} titulo={titulo} />
  if (typeof dados !== 'object') return <p>{valorExibicao(dados)}</p>

  const entradas = Object.entries(dados).filter(([k]) => !OCULTOS.includes(k))
  const simples = entradas.filter(([, v]) => v === null || typeof v !== 'object')
  const compostos = entradas.filter(([, v]) => v !== null && typeof v === 'object')

  if (entradas.length === 0) return <p className={ui.vazio}>Sem dados.</p>

  return (
    <div className={styles.bloco}>
      {titulo && <div className={styles.titulo}>{titulo}</div>}
      {simples.length > 0 && (
        <div className={ui.kv}>
          {simples.map(([k, v]) => (
            <div key={k} className={ui.kvItem}>
              <span className={ui.kvChave}>{rotuloCampo(k)}</span>
              <span className={`${ui.kvValor} ${conformidadeClasse(k, v)}`}>{valorExibicao(v)}</span>
            </div>
          ))}
        </div>
      )}
      {compostos.map(([k, v]) => <ResultadoView key={k} dados={v} titulo={rotuloCampo(k)} />)}
    </div>
  )
}

function Tabela({ linhas, titulo }) {
  if (linhas.length === 0) return null
  if (linhas.some(l => l === null || typeof l !== 'object')) {
    return (
      <div className={styles.bloco}>
        {titulo && <div className={styles.titulo}>{titulo}</div>}
        <p>{linhas.map(valorExibicao).join(' · ')}</p>
      </div>
    )
  }
  const colunas = [...new Set(linhas.flatMap(l => Object.keys(l)))].filter(c => !OCULTOS.includes(c))
  return (
    <div className={styles.bloco}>
      {titulo && <div className={styles.titulo}>{titulo}</div>}
      <div className={styles.tabelaWrap}>
        <table className={styles.tabela}>
          <thead><tr>{colunas.map(c => <th key={c}>{rotuloCampo(c)}</th>)}</tr></thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                {colunas.map(c => <td key={c} className={conformidadeClasse(c, l[c])}>{valorExibicao(l[c])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function conformidadeClasse(chave, valor) {
  if (!String(chave).startsWith('conformidade') || typeof valor !== 'string') return ''
  const v = valor.toLowerCase()
  if (v.startsWith('não') || v.startsWith('nao')) return styles.naoConforme
  if (v.startsWith('parcial')) return styles.parcial
  if (v.startsWith('conforme')) return styles.conforme
  return ''
}
