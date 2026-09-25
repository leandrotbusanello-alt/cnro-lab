import { useEffect, useMemo, useState } from 'react'
import { PERFIS, rotuloPerfil, perfisGerenciaveis } from '../constants'
import { urlsFotos } from '../gestorRepo'
import ModalUsuario from './ModalUsuario'
import Avatar from './Avatar'
import styles from '../gestor.module.css'

const FILTROS_STATUS = [
  { id: 'Ativo', rotulo: 'Ativos' },
  { id: 'Inativo', rotulo: 'Inativos' },
  { id: 'provisoria', rotulo: 'Senha provisória' },
  { id: '', rotulo: 'Todos' },
]

function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export default function UsuariosView({ usuarios, empresas, eu, online, onSalvo, notificar }) {
  const [busca, setBusca] = useState('')
  const [perfil, setPerfil] = useState('')
  const [status, setStatus] = useState('Ativo')
  const [modal, setModal] = useState(null) // { usuario } | { novo: true }
  const [fotos, setFotos] = useState({})

  const podeCriar = perfisGerenciaveis(eu?.perfil).length > 0

  // Fotos (URLs temporárias do Storage privado)
  const chaveFotos = usuarios.map(u => `${u.id}:${u.foto_url || ''}`).join('|')
  useEffect(() => {
    let ativo = true
    if (online) urlsFotos(usuarios).then(m => { if (ativo) setFotos(m) }).catch(() => {})
    return () => { ativo = false }
  }, [chaveFotos, online]) // eslint-disable-line react-hooks/exhaustive-deps

  const empresasPorId = useMemo(() => Object.fromEntries(empresas.map(e => [e.id, e])), [empresas])

  const contagem = useMemo(() => ({
    Ativo: usuarios.filter(u => (u.status || 'Ativo') === 'Ativo').length,
    Inativo: usuarios.filter(u => u.status === 'Inativo').length,
    provisoria: usuarios.filter(u => u.trocar_senha && (u.status || 'Ativo') === 'Ativo').length,
    '': usuarios.length,
  }), [usuarios])

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim())
    return usuarios.filter(u => {
      const st = u.status || 'Ativo'
      if (status === 'provisoria' ? !(u.trocar_senha && st === 'Ativo') : status && st !== status) return false
      if (perfil && String(u.perfil).toUpperCase() !== perfil) return false
      if (termo) {
        const emp = empresasPorId[u.empresa_id]?.nome || u.empresa
        const alvo = normalizar([u.nome, u.email, u.cargo, emp, u.lote, rotuloPerfil(u.perfil)].join(' '))
        if (!alvo.includes(termo)) return false
      }
      return true
    })
  }, [usuarios, busca, perfil, status, empresasPorId])

  // Mantém o modal sincronizado com a versão mais recente do usuário
  const usuarioDoModal = modal?.usuario ? (usuarios.find(u => u.id === modal.usuario.id) || modal.usuario) : null

  return (
    <>
      <div className={styles.barra}>
        <input
          className={`${styles.input} ${styles.busca}`} type="search" value={busca}
          onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail, cargo ou empresa"
        />
        <select className={`${styles.input} ${styles.filtro}`} value={perfil} onChange={e => setPerfil(e.target.value)}>
          <option value="">Todos os perfis</option>
          {PERFIS.map(p => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
        </select>
        {podeCriar && (
          <button type="button" className={`${styles.btn} ${styles.btnPrimario}`}
            onClick={() => setModal({ novo: true })} disabled={!online}>
            + Novo usuário
          </button>
        )}
      </div>

      <div className={styles.chips}>
        {FILTROS_STATUS.map(f => (
          <button key={f.id || 'todos'} type="button"
            className={`${styles.chip} ${status === f.id ? styles.chipAtivo : ''}`}
            onClick={() => setStatus(f.id)}>
            {f.rotulo} ({contagem[f.id]})
          </button>
        ))}
      </div>

      <div className={styles.lista}>
        <div className={`${styles.cabecalhoLista} ${styles.linhaUsuario}`}>
          <span />
          <span>Nome / e-mail</span>
          <span className={styles.colPerfil}>Perfil</span>
          <span className={styles.colEmpresa}>Empresa / cargo</span>
          <span style={{ textAlign: 'right' }}>Situação</span>
        </div>

        {visiveis.length === 0 && (
          <div className={styles.vazio}>
            {usuarios.length === 0 ? 'Nenhum usuário cadastrado.' : 'Nenhum usuário encontrado com esses filtros.'}
          </div>
        )}

        {visiveis.map(u => {
          const st = u.status || 'Ativo'
          const emp = empresasPorId[u.empresa_id]
          const sigla = String(u.perfil || '').toUpperCase()
          return (
            <button
              key={u.id} type="button"
              className={`${styles.linha} ${styles.linhaUsuario} ${st !== 'Ativo' ? styles.linhaInativa : ''}`}
              onClick={() => setModal({ usuario: u })}
            >
              <Avatar nome={u.nome} url={fotos[u.id]} />
              <span className={styles.celula}>
                <div className={styles.nome}>{u.nome}{u.id === eu?.id && ' (você)'}</div>
                <div className={styles.sub}>{u.email}</div>
                <div className={`${styles.sub} ${styles.soMobile}`}>
                  {rotuloPerfil(sigla)}{(emp?.nome || u.empresa) ? ` · ${emp?.nome || u.empresa}` : ''}
                </div>
              </span>
              <span className={styles.colPerfil}>
                <span className={`${styles.badge} ${styles['perfil' + sigla] || styles.neutro}`}>{rotuloPerfil(sigla)}</span>
              </span>
              <span className={`${styles.celula} ${styles.colEmpresa}`}>
                <div className={styles.sub} style={{ color: 'var(--text)' }}>
                  {emp?.nome || u.empresa || '—'}{(emp?.lote || u.lote) ? ` · Lote ${emp?.lote || u.lote}` : ''}
                </div>
                <div className={styles.sub}>{u.cargo || ''}</div>
              </span>
              <span className={styles.selos}>
                {st === 'Ativo'
                  ? <span className={`${styles.badge} ${styles.ok}`}>Ativo</span>
                  : <span className={`${styles.badge} ${styles.erro}`}>Inativo</span>}
                {!u.auth_id && <span className={`${styles.badge} ${styles.alerta}`}>Sem login</span>}
                {u.auth_id && u.trocar_senha && st === 'Ativo' && (
                  <span className={`${styles.badge} ${styles.info}`}>Senha provisória</span>
                )}
                {['LAB', 'ASSIST', 'GESTOR', 'DEV'].includes(sigla) && !u.assinatura_url && st === 'Ativo' && (
                  <span className={`${styles.badge} ${styles.neutro} ${styles.soDesktop}`}>Sem assinatura</span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {modal && (
        <ModalUsuario
          key={modal.novo ? 'novo' : modal.usuario.id}
          usuario={modal.novo ? null : usuarioDoModal}
          empresas={empresas} eu={eu} online={online}
          fotoUrl={usuarioDoModal ? fotos[usuarioDoModal.id] : null}
          onSalvo={onSalvo}
          onAbrir={u => setModal({ usuario: u })}
          notificar={notificar}
          onFechar={() => setModal(null)}
        />
      )}
    </>
  )
}
