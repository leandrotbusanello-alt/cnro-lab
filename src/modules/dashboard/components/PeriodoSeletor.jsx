import { TIPOS_PERIODO, rotuloPeriodo } from '../periodo'
import styles from './PeriodoSeletor.module.css'

export default function PeriodoSeletor({ tipo, referencia, podeAvancar, onMudarTipo, onNavegar, onIrParaAtual }) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.tipos} role="tablist">
        {Object.entries(TIPOS_PERIODO).map(([id, t]) => (
          <button
            key={id} role="tab" aria-selected={tipo === id}
            className={`${styles.tipo} ${tipo === id ? styles.tipoAtivo : ''}`}
            onClick={() => onMudarTipo(id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={styles.navegacao}>
        <button type="button" className={styles.seta} onClick={() => onNavegar(-1)} aria-label="Período anterior">‹</button>
        <span className={styles.rotulo}>{rotuloPeriodo(tipo, referencia)}</span>
        <button type="button" className={styles.seta} onClick={() => onNavegar(1)} disabled={!podeAvancar} aria-label="Próximo período">›</button>
        {podeAvancar && (
          <button type="button" className={styles.btnAtual} onClick={onIrParaAtual}>Atual</button>
        )}
      </div>
    </div>
  )
}
