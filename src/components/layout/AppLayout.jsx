import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useOnlineSync } from '../../hooks/useOnlineSync'
import styles from './AppLayout.module.css'

const NAV_ITEMS = [
  { id: 'dashboard',   path: '/dashboard',   label: 'Dashboard', icon: '📊' },
  { id: 'campo',       path: '/campo',        label: 'Campo',     icon: '📱' },
  { id: 'laboratorio', path: '/laboratorio',  label: 'Lab',       icon: '🔬' },
  { id: 'assistente',  path: '/assistente',   label: 'Assistente',icon: '🧪' },
  { id: 'gestor',      path: '/gestor',       label: 'Gestor',    icon: '⚙️' },
]

export default function AppLayout() {
  const { perfil, logout } = useAuthStore()
  const { online, pendingCount } = useOnlineSync()
  const nav = useNavigate()

  const modulos = perfil?.modulos_acesso || []
  const navItems = NAV_ITEMS.filter(item => modulos.includes(item.id))

  async function handleLogout() {
    await logout()
    nav('/login')
  }

  return (
    <div className={styles.shell}>
      {/* Desktop top bar */}
      <header className={styles.topbar}>
        <span className={styles.brand}>CNRO Lab</span>

        <nav className={styles.desktopNav}>
          {navItems.map(item => (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
            >
              {item.icon} {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.topRight}>
          <span className={`${styles.onlineTag} ${online ? styles.onlineOn : styles.onlineOff}`}>
            {online ? '🟢 Online' : '🔴 Offline'}
            {pendingCount > 0 && <span className={styles.pendingBadge}>{pendingCount}</span>}
          </span>
          <button
            type="button" className={styles.userName} onClick={() => nav('/trocar-senha')}
            title="Trocar minha senha"
          >
            {perfil?.nome || perfil?.email}
          </button>
          <button className={styles.btnLogout} onClick={handleLogout}>Sair</button>
        </div>
      </header>

      {/* Content */}
      <main className={styles.content}>
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className={styles.mobileNav}>
        {navItems.map(item => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) => `${styles.mobileItem} ${isActive ? styles.mobileActive : ''}`}
          >
            <span className={styles.mobileIcon}>{item.icon}</span>
            <span className={styles.mobileLabel}>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
