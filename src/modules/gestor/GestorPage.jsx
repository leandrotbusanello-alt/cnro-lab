import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import Toast from '../../components/ui/Toast'
import { listarEmpresas, listarUsuarios } from './gestorRepo'
import UsuariosView from './components/UsuariosView'
import EmpresasView from './components/EmpresasView'
import styles from './gestor.module.css'

const ABAS = [
  { id: 'usuarios', rotulo: 'Usuários' },
  { id: 'empresas', rotulo: 'Empresas' },
]

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

/**
 * Módulo Gestor (somente online).
 *   /gestor?aba=usuarios  → cadastro de usuários
 *   /gestor?aba=empresas  → cadastro de empresas
 */
export default function GestorPage() {
  const { perfil } = useAuthStore()
  const online = useOnline()
  const [params, setParams] = useSearchParams()
  const aba = ABAS.some(a => a.id === params.get('aba')) ? params.get('aba') : 'usuarios'

  const [usuarios, setUsuarios] = useState([])
  const [empresas, setEmpresas] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [toast, setToast] = useState(null)
  const fecharToast = useCallback(() => setToast(null), [])
  const notificar = useCallback((message, type = 'success') => setToast({ message, type }), [])

  const autorizado = ['DEV', 'GESTOR'].includes(perfil?.perfil)

  const carregar = useCallback(async () => {
    if (!navigator.onLine) { setLoading(false); return }
    setErro('')
    try {
      const [u, e] = await Promise.all([listarUsuarios(), listarEmpresas()])
      setUsuarios(u); setEmpresas(e)
    } catch (e) {
      setErro(e.message || 'Não foi possível carregar os dados.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Carrega ao abrir e de novo quando a conexão volta
  useEffect(() => { if (autorizado && online) carregar() }, [autorizado, online, carregar])
  useEffect(() => { if (!online) setLoading(false) }, [online])

  /** Substitui/insere um usuário na lista local após salvar */
  const aplicarUsuario = useCallback(u => {
    if (!u) return
    setUsuarios(l => {
      const i = l.findIndex(x => x.id === u.id)
      const nova = i >= 0 ? l.map(x => (x.id === u.id ? u : x)) : [...l, u]
      return nova.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
    })
  }, [])

  const aplicarEmpresa = useCallback(emp => {
    if (!emp) return
    setEmpresas(l => {
      const i = l.findIndex(x => x.id === emp.id)
      const nova = i >= 0 ? l.map(x => (x.id === emp.id ? emp : x)) : [...l, emp]
      return nova.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR') || String(a.lote || '').localeCompare(String(b.lote || ''), 'pt-BR', { numeric: true }))
    })
    // nome/lote da empresa é copiado para os usuários vinculados (trigger no banco)
    setUsuarios(l => l.map(u => (u.empresa_id === emp.id ? { ...u, empresa: emp.nome, lote: emp.lote } : u)))
  }, [])

  const contagem = useMemo(() => ({
    usuarios: usuarios.filter(u => (u.status || 'Ativo') === 'Ativo').length,
    empresas: empresas.filter(e => e.ativo !== false).length,
  }), [usuarios, empresas])

  if (!autorizado) {
    return (
      <div className={styles.container}>
        <div className={`${styles.aviso} ${styles.avisoErro}`}>Acesso restrito ao Gestor.</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Gestor</h1>
          <p className={styles.subtitulo}>Cadastro de usuários e empresas</p>
        </div>
        <button type="button" className={`${styles.btn} ${styles.btnSecundario} ${styles.btnPequeno}`}
          onClick={() => { setLoading(true); carregar() }} disabled={!online || loading}>
          ↻ Atualizar
        </button>
      </div>

      {!online && (
        <div className={`${styles.aviso} ${styles.avisoAlerta}`}>
          Sem conexão. O Módulo Gestor funciona somente online — reconecte para ver e alterar os cadastros.
        </div>
      )}
      {erro && <div className={`${styles.aviso} ${styles.avisoErro}`}>{erro}</div>}

      <nav className={styles.abas}>
        {ABAS.map(a => (
          <button
            key={a.id} type="button"
            className={`${styles.aba} ${aba === a.id ? styles.abaAtiva : ''}`}
            onClick={() => setParams({ aba: a.id }, { replace: true })}
          >
            {a.rotulo} <span className={styles.contador}>{contagem[a.id]}</span>
          </button>
        ))}
      </nav>

      {loading ? (
        <div className={styles.carregando}>Carregando...</div>
      ) : aba === 'usuarios' ? (
        <UsuariosView
          usuarios={usuarios} empresas={empresas} eu={perfil} online={online}
          onSalvo={aplicarUsuario} notificar={notificar}
        />
      ) : (
        <EmpresasView
          empresas={empresas} usuarios={usuarios} online={online}
          onSalvo={aplicarEmpresa} notificar={notificar}
        />
      )}

      {toast && <Toast key={toast.message + toast.type} {...toast} onClose={fecharToast} />}
    </div>
  )
}
