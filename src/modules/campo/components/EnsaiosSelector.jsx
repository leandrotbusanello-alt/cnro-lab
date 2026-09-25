import styles from './EnsaiosSelector.module.css'

export default function EnsaiosSelector({ ensaios, tipoAmostra, selecionados, onChange }) {
  const filtrados = ensaios.filter(e =>
    !tipoAmostra || !e.tipo_amostra || e.tipo_amostra === tipoAmostra || e.tipo_amostra === 'todos'
  )

  function toggle(id) {
    onChange(selecionados.includes(id)
      ? selecionados.filter(s => s !== id)
      : [...selecionados, id]
    )
  }

  function toggleAll() {
    if (selecionados.length === filtrados.length) onChange([])
    else onChange(filtrados.map(e => e.id))
  }

  if (filtrados.length === 0) return <p className={styles.empty}>Nenhum ensaio disponível para este tipo de amostra.</p>

  return (
    <div className={styles.container}>
      <label className={styles.toggleAll}>
        <input type="checkbox" checked={selecionados.length === filtrados.length} onChange={toggleAll} />
        <span>Selecionar todos ({filtrados.length})</span>
      </label>

      <div className={styles.grid}>
        {filtrados.map(e => (
          <label key={e.id} className={`${styles.item} ${selecionados.includes(e.id) ? styles.checked : ''}`}>
            <input type="checkbox" checked={selecionados.includes(e.id)} onChange={() => toggle(e.id)} />
            <div className={styles.info}>
              <span className={styles.nome}>{e.nome}</span>
              {e.codigo && <span className={styles.codigo}>{e.codigo}</span>}
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}
