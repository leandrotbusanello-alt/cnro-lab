import styles from './EnsaiosSelector.module.css'
import { ESPECIFICACAO, GRUPOS_ENSAIOS, resolverEnsaios } from '../ensaiosFRIMOB04'

// Lista da FR-IMOB-04.
// modo='especificacao' → seção Especificação (selecionados = colunas espec_*)
// modo='detalhar'      → Detalhar Ensaios: todos os ensaios, em três grupos
//                        (selecionados = ids do catálogo `ensaios`)
export default function EnsaiosSelector({ selecionados, onChange, modo, catalogo = [] }) {
  function toggle(id) {
    onChange(selecionados.includes(id) ? selecionados.filter(s => s !== id) : [...selecionados, id])
  }

  function toggleGroup(lista) {
    const ids = lista.filter(e => !e.indisponivel).map(e => e.id)
    const todosSel = ids.every(id => selecionados.includes(id))
    onChange(todosSel ? selecionados.filter(id => !ids.includes(id)) : [...new Set([...selecionados, ...ids])])
  }

  const contador = selecionados.length > 0 && (
    <div className={styles.countBadge}>
      {selecionados.length} {modo === 'especificacao' ? 'item' : 'ensaio'}{selecionados.length !== 1 ? 's' : ''} selecionado{selecionados.length !== 1 ? 's' : ''}
    </div>
  )

  if (modo === 'especificacao') {
    return (
      <div className={styles.container}>
        {contador}
        <Grupo titulo="Especificação" itens={ESPECIFICACAO} selecionados={selecionados} onToggle={toggle} onToggleGrupo={toggleGroup} />
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {contador}
      {GRUPOS_ENSAIOS.map(g => (
        <Grupo key={g.titulo} titulo={g.titulo} itens={resolverEnsaios(g.itens, catalogo)}
          selecionados={selecionados} onToggle={toggle} onToggleGrupo={toggleGroup} />
      ))}
    </div>
  )
}

function Grupo({ titulo, itens, selecionados, onToggle, onToggleGrupo }) {
  const disponiveis = itens.filter(e => !e.indisponivel)
  return (
    <div className={styles.grupo}>
      <div className={styles.grupoHeader}>
        <span className={styles.grupoTitulo}>{titulo}</span>
        <button type="button" className={styles.btnToggleGrupo} onClick={() => onToggleGrupo(itens)}>
          {disponiveis.length && disponiveis.every(e => selecionados.includes(e.id)) ? 'Desmarcar todos' : 'Marcar todos'}
        </button>
      </div>
      <div className={styles.lista}>
        {itens.map(e => <CheckItem key={e.id} ensaio={e} sel={selecionados.includes(e.id)} onToggle={onToggle} />)}
      </div>
    </div>
  )
}

function CheckItem({ ensaio, sel, onToggle }) {
  return (
    <label
      className={`${styles.checkItem} ${sel ? styles.checkAtivo : ''}`}
      style={ensaio.indisponivel ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
      title={ensaio.indisponivel ? 'Ensaio ainda não ligado ao catálogo — avise o DEV' : undefined}
    >
      <input type="checkbox" checked={sel} disabled={ensaio.indisponivel} onChange={() => onToggle(ensaio.id)} />
      <span>{ensaio.nome}</span>
    </label>
  )
}
