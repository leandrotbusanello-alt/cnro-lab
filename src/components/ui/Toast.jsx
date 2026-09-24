import { useEffect, useState } from 'react'
import styles from './Toast.module.css'

export default function Toast({ message, type = 'info', duration = 3500, onClose }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onClose?.(), 300)
    }, duration)
    return () => clearTimeout(t)
  }, [duration, onClose])

  return (
    <div className={`${styles.toast} ${styles[type]} ${visible ? styles.show : styles.hide}`}>
      <span className={styles.icon}>
        {type === 'success' && '✓'}
        {type === 'error' && '✕'}
        {type === 'warning' && '⚠'}
        {type === 'info' && 'ℹ'}
      </span>
      <span>{message}</span>
      <button className={styles.close} onClick={() => { setVisible(false); setTimeout(() => onClose?.(), 300) }}>×</button>
    </div>
  )
}
