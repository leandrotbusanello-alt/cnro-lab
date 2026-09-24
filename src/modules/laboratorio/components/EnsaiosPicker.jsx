import { useMemo, useState } from 'react'
import styles from './EnsaiosPicker.module.css'
import ui from './ui.module.css'

/**
 * Seleção de ensaios do catálogo, agrupados por categoria, com busca.
 * multiplo=true  → checkboxes (selecionados/onChange com array de ids)
 * multiplo=false → lista de botões "Adicionar" (onEscolher(ensaio)); `excluir` = ids a ocultar
 */
export default function EnsaiosPicker({ ensaios, selecionados = [], onChange, multiplo = true, onEscolher, excluir = [] }) {
  const [busca, setBusca] = useState('')

  const grupos = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const lista = ensaios
      .filter(e => e.ativo !== false || selecionados.includes(e.id))
      .filter(e => !excluir.includes(e.id))
      .filter(e => !termo || `${e.nome} ${e.norma || ''} ${e.categoria || ''}`.toLowerCase().includes(termo))
    const g = {}
    for (const e of lista) (g[e.categoria || 'Outros'] ||= []).push(e)
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
  }, [ensaios, busca, selecionados, excluir])

  function alternar(id) {
    onChange(selecionados.includes(id) ? selecionados.filter(s => s !== id) : [...selecionados, id])
  }

  return (
    <div className={styles.wrapper}>
      <input
        className={ui.input}
        placeholder="Buscar ensaio, norma ou categoria…"
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />
      {multiplo && <p className={ui.ajuda}>{selecionados.length} ensaio(s) selecionado(s)</p>}
      <div className={styles.lista}>
        {grupos.length === 0 && <p className={ui.vazio}>Nenhum ensaio encontrado.</p>}
        {grupos.map(([cat, itens]) => (
          <div key={cat} className={styles.grupo}>
            <div className={styles.categoria}>{cat}</div>
            {itens.map(e => multiplo ? (
              <label key={e.id} className={`${styles.item} ${selecionados.includes(e.id) ? styles.marcado : ''}`}>
                <input type="checkbox" checked={selecionados.includes(e.id)} onChange={() => alternar(e.id)} />
                <span className={styles.nome}>{e.nome}</span>
                {e.norma && <span className={styles.norma}>{e.norma}</span>}
              </label>
            ) : (
              <div key={e.id} className={styles.item}>
                <span className={styles.nome}>{e.nome}</span>
                {e.norma && <span className={styles.norma}>{e.norma}</span>}
                <button type="button" className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={() => onEscolher(e)}>
                  + Adicionar
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
