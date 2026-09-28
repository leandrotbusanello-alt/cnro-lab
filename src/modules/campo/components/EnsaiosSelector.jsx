import styles from './EnsaiosSelector.module.css'
import { ESPECIFICACAO, ENSAIOS_POR_TIPO, resolverEnsaios } from '../ensaiosFRIMOB04'

// EnsaiosSelector usa a lista da FR-IMOB-04.
// modo='especificacao' → só a seção Especificação (selecionados = colunas espec_*)
// modo='detalhar'      → só a seção Detalhar Ensaios (selecionados = ids do catálogo `ensaios`)
export default function EnsaiosSelector({ tipoAmostra, selecionados, onChange, modo, catalogo = [] }) {
  const ensaiosTipo = resolverEnsaios(ENSAIOS_POR_TIPO[tipoAmostra] || [], catalogo)

  function toggle(id) {
    onChange(
      selecionados.includes(id)
        ? selecionados.filter(s => s !== id)
        : [...selecionados, id]
    )
  }

  function toggleGroup(lista) {
    const ids = lista.filter(e => !e.indisponivel).map(e => e.id)
    const todosSel = ids.every(id => selecionados.includes(id))
    if (todosSel) {
      onChange(selecionados.filter(id => !ids.includes(id)))
    } else {
      const novos = [...new Set([...selecionados, ...ids])]
      onChange(novos)
    }
  }

  function CheckItem({ ensaio }) {
    const sel = selecionados.includes(ensaio.id)
    return (
      <label
        className={`${styles.checkItem} ${sel ? styles.checkAtivo : ''}`}
        style={ensaio.indisponivel ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
        title={ensaio.indisponivel ? 'Ensaio ainda não ligado ao catálogo — avise o DEV' : undefined}
      >
        <input type="checkbox" checked={sel} disabled={ensaio.indisponivel} onChange={() => toggle(ensaio.id)} />
        <span>{ensaio.nome}</span>
      </label>
    )
  }

  const totalSel = selecionados.length

  // ── Modo: só Especificação ────────────────────────────────────────────────
  if (modo === 'especificacao') {
    return (
      <div className={styles.container}>
        {totalSel > 0 && (
          <div className={styles.countBadge}>
            {totalSel} {modo === 'especificacao' ? 'item' : 'ensaio'}{totalSel !== 1 ? 's' : ''} selecionado{totalSel !== 1 ? 's' : ''}
          </div>
        )}
        <div className={styles.grupo}>
          <div className={styles.grupoHeader}>
            <span className={styles.grupoTitulo}>Especificação</span>
            <button type="button" className={styles.btnToggleGrupo} onClick={() => toggleGroup(ESPECIFICACAO)}>
              {ESPECIFICACAO.every(e => selecionados.includes(e.id)) ? 'Desmarcar todos' : 'Marcar todos'}
            </button>
          </div>
          <div className={styles.lista}>
            {ESPECIFICACAO.map(e => <CheckItem key={e.id} ensaio={e} />)}
          </div>
        </div>
      </div>
    )
  }

  // ── Modo: só Detalhar Ensaios ─────────────────────────────────────────────
  if (modo === 'detalhar') {
    if (!tipoAmostra) {
      return (
        <p className={styles.empty}>
          Selecione o tipo de amostra (seção 3) para ver os ensaios disponíveis.
        </p>
      )
    }
    if (ensaiosTipo.length === 0) return null
    return (
      <div className={styles.container}>
        <div className={styles.grupo}>
          <div className={styles.grupoHeader}>
            <span className={styles.grupoTitulo}>Detalhar Ensaios</span>
            <button type="button" className={styles.btnToggleGrupo} onClick={() => toggleGroup(ensaiosTipo)}>
              {ensaiosTipo.filter(e => !e.indisponivel).every(e => selecionados.includes(e.id)) ? 'Desmarcar todos' : 'Marcar todos'}
            </button>
          </div>
          <div className={styles.lista}>
            {ensaiosTipo.map(e => <CheckItem key={e.id} ensaio={e} />)}
          </div>
        </div>
      </div>
    )
  }

  // ── Fallback: exibe tudo ──────────────────────────────────────────────────
  return (
    <div className={styles.container}>
      {totalSel > 0 && (
        <div className={styles.countBadge}>
          {totalSel} {modo === 'especificacao' ? 'item' : 'ensaio'}{totalSel !== 1 ? 's' : ''} selecionado{totalSel !== 1 ? 's' : ''}
        </div>
      )}
      <div className={styles.grupo}>
        <div className={styles.grupoHeader}>
          <span className={styles.grupoTitulo}>Especificação</span>
          <button type="button" className={styles.btnToggleGrupo} onClick={() => toggleGroup(ESPECIFICACAO)}>
            {ESPECIFICACAO.every(e => selecionados.includes(e.id)) ? 'Desmarcar todos' : 'Marcar todos'}
          </button>
        </div>
        <div className={styles.lista}>
          {ESPECIFICACAO.map(e => <CheckItem key={e.id} ensaio={e} />)}
        </div>
      </div>
      {ensaiosTipo.length > 0 && (
        <div className={styles.grupo}>
          <div className={styles.grupoHeader}>
            <span className={styles.grupoTitulo}>Detalhar Ensaios</span>
            <button type="button" className={styles.btnToggleGrupo} onClick={() => toggleGroup(ensaiosTipo)}>
              {ensaiosTipo.filter(e => !e.indisponivel).every(e => selecionados.includes(e.id)) ? 'Desmarcar todos' : 'Marcar todos'}
            </button>
          </div>
          <div className={styles.lista}>
            {ensaiosTipo.map(e => <CheckItem key={e.id} ensaio={e} />)}
          </div>
        </div>
      )}
    </div>
  )
}
