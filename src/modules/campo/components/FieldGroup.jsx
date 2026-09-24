import styles from './FieldGroup.module.css'

export default function FieldGroup({ children, grid = 2 }) {
  return (
    <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${grid}, 1fr)` }}>
      {children}
    </div>
  )
}
