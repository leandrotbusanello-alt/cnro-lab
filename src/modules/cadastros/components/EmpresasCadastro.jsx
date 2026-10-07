import { useCallback, useEffect, useState } from 'react'
import { listarEmpresas, listarUsuarios } from '../../gestor/gestorRepo'
import EmpresasView from '../../gestor/components/EmpresasView'
import ui from '../../laboratorio/components/ui.module.css'

/** Empresas (antes no Gestor): Laboratório e Gestor/DEV cadastram, alteram e excluem — migração 18 */
export default function EmpresasCadastro({ notificar }) {
  const [empresas, setEmpresas] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const online = navigator.onLine

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [e, u] = await Promise.all([listarEmpresas(), listarUsuarios().catch(() => [])])
      setEmpresas(e); setUsuarios(u); setErro(null)
    } catch (e) {
      setErro(e.message || 'Não foi possível carregar as empresas.')
    } finally {
      setCarregando(false)
    }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  if (carregando) return <div className="spinner" />
  return (
    <>
      {!online && <div className={`${ui.aviso} ${ui.avisoAlerta}`}>Sem conexão: as empresas só podem ser alteradas com internet.</div>}
      {erro && <div className={`${ui.aviso} ${ui.avisoErro}`}>{erro}</div>}
      <EmpresasView
        empresas={empresas}
        usuarios={usuarios}
        online={online}
        onSalvo={() => carregar()}
        onExcluido={() => carregar()}
        notificar={msg => notificar(msg)}
      />
    </>
  )
}
