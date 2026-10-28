import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { modulosDoUsuario } from '../../lib/modulos'
import { useCadastros, TIPOS_CADASTRO, dataBR, TIPOS_TRACO } from '../../lib/cadastros'
import { listarEmpresas, abrirDocumento } from './cadastrosRepo'
import ModalTraco from './components/ModalTraco'
import ModalRevalidar from './components/ModalRevalidar'
import ModalHistorico from './components/ModalHistorico'
import ModalSimples from './components/ModalSimples'
import EmpresasCadastro from './components/EmpresasCadastro'
import EquipamentosCadastro from './components/EquipamentosCadastro'
import TracosCadastro, { contarAlertasTracos } from './components/TracosCadastro'
import ConcreteirasCadastro from './components/ConcreteirasCadastro'
import Toast from '../../components/ui/Toast'
import ui from '../laboratorio/components/ui.module.css'
import styles from './CadastrosPage.module.css'

const ABAS = ['empresas', 'tracos', 'concreteiras', 'jazidas', 'pedreiras', 'fornecedores', 'equipamentos']
const TITULO_ABA = { empresas: 'Empresas', equipamentos: 'Equipamentos' }

/** Cadastros de apoio (migração 17) — Laboratório e Gestor/DEV */
export function podeVerCadastros(perfil) {
  const m = modulosDoUsuario(perfil)
  return m.includes('laboratorio') || m.includes('gestor')
}

export default function CadastrosPage() {
  const { perfil } = useAuthStore()
  const cad = useCadastros()
  const [params, setParams] = useSearchParams()
  const aba = ABAS.includes(params.get('aba')) ? params.get('aba') : 'tracos'
  const tipoTraco = TIPOS_TRACO.some(t => t.id === params.get('tipo')) ? params.get('tipo') : 'cbuq'
  const [busca, setBusca] = useState('')
  const [empresas, setEmpresas] = useState([])
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => { listarEmpresas().then(setEmpresas).catch(() => {}) }, [])

  if (!podeVerCadastros(perfil)) {
    return <div className={styles.wrapper}><p className={ui.vazio}>Somente o Laboratório e o Gestor acessam os cadastros.</p></div>
  }

  const termo = busca.trim().toLowerCase()
  const alertas = contarAlertasTracos(cad.tracos)

  function trocarAba(a) {
    setParams(a === 'tracos' ? {} : { aba: a })
    setBusca('')
  }

  async function aposSalvar(msg) {
    setModal(null)
    setToast({ type: 'success', message: msg })
    await cad.recarregar()
  }

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.titulo}>📚 Cadastros</h1>
          <p className={styles.sub}>Listas usadas nos pedidos do Campo. Itens desativados somem das listas, mas os pedidos antigos continuam com o nome.</p>
        </div>
        <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={cad.recarregar} disabled={cad.loading}>↻ Atualizar</button>
      </header>

      {cad.offline && <div className={`${ui.aviso} ${ui.avisoAlerta}`}>🔴 Sem conexão — mostrando a última lista salva neste aparelho. Para alterar, conecte-se.</div>}
      {cad.erro && <div className={`${ui.aviso} ${ui.avisoErro}`}>⚠️ {cad.erro}</div>}

      <nav className={styles.abas}>
        {ABAS.map(a => (
          <button key={a} type="button" className={`${styles.aba} ${aba === a ? styles.abaAtiva : ''}`} onClick={() => trocarAba(a)}>
            {TITULO_ABA[a] || TIPOS_CADASTRO[a].titulo}
            {a === 'tracos' && alertas > 0 && <span className={styles.bolinha}>{alertas}</span>}
          </button>
        ))}
      </nav>

      {aba === 'empresas' ? (
        <EmpresasCadastro notificar={msg => setToast({ type: 'success', message: msg })} />
      ) : aba === 'equipamentos' ? (
        <>
          <div className={styles.barra}>
            <input className={ui.input} placeholder="Buscar pelo número ou observação…" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <EquipamentosCadastro equipamentos={cad.equipamentos} termo={termo} onSalvo={aposSalvar} />
        </>
      ) : aba === 'tracos' ? (
        <>
          <div className={styles.barra}>
            <input className={ui.input} placeholder="Buscar pelo nome do traço…" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <TracosCadastro
            tracos={cad.tracos}
            empresas={empresas}
            concreteiras={cad.concreteiras}
            tipo={tipoTraco}
            onTipo={t => setParams(t === 'cbuq' ? {} : { tipo: t })}
            termo={termo}
            onNovo={t => setModal({ tipo: 'traco', item: null, tipoTraco: t })}
            onEditar={t => setModal({ tipo: 'traco', item: t })}
            onRevalidar={t => setModal({ tipo: 'revalidar', item: t })}
            onHistorico={t => setModal({ tipo: 'historico', item: t })}
            onDocumento={c => abrirDocumento(c).catch(e => setToast({ type: 'error', message: e.message }))}
          />
        </>
      ) : aba === 'concreteiras' ? (
        <>
          <div className={styles.barra}>
            <input className={ui.input} placeholder="Buscar pela concreteira ou central…" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <ConcreteirasCadastro concreteiras={cad.concreteiras} empresas={empresas} termo={termo} onSalvo={aposSalvar} />
        </>
      ) : (<>
      <div className={styles.barra}>
        <input className={ui.input} placeholder="Buscar pelo nome…" value={busca} onChange={e => setBusca(e.target.value)} />
        <button className={`${ui.btn} ${ui.btnPrimario}`} onClick={() => setModal({ tipo: 'simples', item: null })}>
          + Cadastrar {TIPOS_CADASTRO[aba].singular}
        </button>
      </div>
      <ListaSimples
        tipo={aba}
        itens={(cad[aba] || []).filter(i => !termo || i.nome.toLowerCase().includes(termo))}
        onEditar={i => setModal({ tipo: 'simples', item: i })}
      />
      </>)}

      {modal?.tipo === 'traco' && (
        <ModalTraco traco={modal.item} tipoNovo={modal.tipoTraco} empresas={empresas} concreteiras={cad.concreteiras} onFechar={() => setModal(null)}
          onSalvo={t => aposSalvar(`Traço "${t.nome_traco}" salvo.`)} />
      )}
      {modal?.tipo === 'revalidar' && (
        <ModalRevalidar traco={modal.item} onFechar={() => setModal(null)}
          onSalvo={t => aposSalvar(`Traço "${t.nome_traco}" revalidado até ${dataBR(t.valido_ate)}.`)} />
      )}
      {modal?.tipo === 'historico' && (
        <ModalHistorico traco={modal.item} onFechar={() => setModal(null)}
          onDocumento={c => abrirDocumento(c).catch(e => setToast({ type: 'error', message: e.message }))} />
      )}
      {modal?.tipo === 'simples' && (
        <ModalSimples tipo={aba} item={modal.item} onFechar={() => setModal(null)}
          onSalvo={i => aposSalvar(`"${i.nome}" salvo.`)} />
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}

function ListaSimples({ tipo, itens, onEditar }) {
  if (!itens.length) return <p className={ui.vazio}>Nada cadastrado ainda.</p>
  return (
    <div className={styles.tabelaWrap}>
      <table className={styles.tabela}>
        <thead>
          <tr>
            <th>Nome</th>
            {tipo !== 'fornecedores' && <th>Município</th>}
            {tipo === 'jazidas' && <th>Coordenadas</th>}
            <th>Situação</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {itens.map(i => (
            <tr key={i.id} className={i.ativo === false ? styles.inativo : ''}>
              <td>{i.nome}</td>
              {tipo !== 'fornecedores' && <td>{i.municipio || '—'}</td>}
              {tipo === 'jazidas' && <td>{i.coordenadas || '—'}</td>}
              <td>{i.ativo === false ? 'Inativo' : 'Ativo'}</td>
              <td className={styles.colAcao}>
                <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={() => onEditar(i)}>✏️ Editar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
