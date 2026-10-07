import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { modulosDoUsuario } from '../../lib/modulos'
import { useCadastros, statusTraco, TIPOS_CADASTRO, dataBR } from '../../lib/cadastros'
import { listarEmpresas, abrirDocumento } from './cadastrosRepo'
import ModalTraco from './components/ModalTraco'
import ModalRevalidar from './components/ModalRevalidar'
import ModalHistorico from './components/ModalHistorico'
import ModalSimples from './components/ModalSimples'
import Toast from '../../components/ui/Toast'
import ui from '../laboratorio/components/ui.module.css'
import styles from './CadastrosPage.module.css'

const ABAS = ['tracos', 'jazidas', 'pedreiras', 'fornecedores']

const FILTROS_TRACO = [
  { id: 'ativos', rotulo: 'Ativos' },
  { id: 'vence', rotulo: 'Vencem em 30 dias' },
  { id: 'vencido', rotulo: 'Vencidos' },
  { id: 'sem_validade', rotulo: 'Sem validade' },
  { id: 'inativos', rotulo: 'Inativos' },
]

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
  const [filtro, setFiltro] = useState(params.get('filtro') || 'ativos')
  const [busca, setBusca] = useState('')
  const [empresas, setEmpresas] = useState([])
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => { listarEmpresas().then(setEmpresas).catch(() => {}) }, [])
  const empresasPorId = useMemo(() => Object.fromEntries(empresas.map(e => [e.id, e])), [empresas])

  if (!podeVerCadastros(perfil)) {
    return <div className={styles.wrapper}><p className={ui.vazio}>Somente o Laboratório e o Gestor acessam os cadastros.</p></div>
  }

  const termo = busca.trim().toLowerCase()
  const contagem = contarTracos(cad.tracos)

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
            {TIPOS_CADASTRO[a].titulo}
            {a === 'tracos' && contagem.alerta > 0 && <span className={styles.bolinha}>{contagem.alerta}</span>}
          </button>
        ))}
      </nav>

      <div className={styles.barra}>
        <input className={ui.input} placeholder="Buscar pelo nome…" value={busca} onChange={e => setBusca(e.target.value)} />
        <button className={`${ui.btn} ${ui.btnPrimario}`} onClick={() => setModal({ tipo: aba === 'tracos' ? 'traco' : 'simples', item: null })}>
          + Cadastrar {TIPOS_CADASTRO[aba].singular}
        </button>
      </div>

      {aba === 'tracos' ? (
        <>
          <div className={styles.filtros}>
            {FILTROS_TRACO.map(f => (
              <button key={f.id} type="button" className={`${styles.filtro} ${filtro === f.id ? styles.filtroAtivo : ''}`} onClick={() => setFiltro(f.id)}>
                {f.rotulo} <span>{contagem[f.id]}</span>
              </button>
            ))}
          </div>
          <ListaTracos
            tracos={filtrarTracos(cad.tracos, filtro, termo)}
            empresasPorId={empresasPorId}
            onEditar={t => setModal({ tipo: 'traco', item: t })}
            onRevalidar={t => setModal({ tipo: 'revalidar', item: t })}
            onHistorico={t => setModal({ tipo: 'historico', item: t })}
            onDocumento={c => abrirDocumento(c).catch(e => setToast({ type: 'error', message: e.message }))}
          />
        </>
      ) : (
        <ListaSimples
          tipo={aba}
          itens={(cad[aba] || []).filter(i => !termo || i.nome.toLowerCase().includes(termo))}
          onEditar={i => setModal({ tipo: 'simples', item: i })}
        />
      )}

      {modal?.tipo === 'traco' && (
        <ModalTraco traco={modal.item} empresas={empresas} onFechar={() => setModal(null)}
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

function contarTracos(tracos) {
  const c = { ativos: 0, vence: 0, vencido: 0, sem_validade: 0, inativos: 0, alerta: 0 }
  for (const t of tracos || []) {
    if (t.ativo === false) { c.inativos++; continue }
    c.ativos++
    const s = statusTraco(t).codigo
    if (s in c) c[s]++
  }
  c.alerta = c.vence + c.vencido
  return c
}

function filtrarTracos(tracos, filtro, termo) {
  return (tracos || [])
    .filter(t => (filtro === 'inativos' ? t.ativo === false : t.ativo !== false))
    .filter(t => ['ativos', 'inativos'].includes(filtro) || statusTraco(t).codigo === filtro)
    .filter(t => !termo || t.nome_traco.toLowerCase().includes(termo))
}

const TOM = { vigente: 'ok', vence: 'pendente', vencido: 'erro', sem_validade: 'neutro' }

function ListaTracos({ tracos, empresasPorId, onEditar, onRevalidar, onHistorico, onDocumento }) {
  if (!tracos.length) return <p className={ui.vazio}>Nenhum traço neste filtro.</p>
  return (
    <div className={styles.lista}>
      {tracos.map(t => {
        const st = statusTraco(t)
        return (
          <article key={t.id} className={`${styles.cartao} ${styles['borda_' + st.codigo] || ''}`}>
            <div className={styles.cartaoTopo}>
              <strong className={styles.nome}>{t.nome_traco}</strong>
              <span className={`${ui.badge} ${ui[TOM[st.codigo]]}`}>{t.ativo === false ? 'Inativo' : st.rotulo}</span>
            </div>
            <div className={styles.detalhes}>
              <span>🏢 {empresasPorId[t.empresa_id]?.nome || 'Sem empresa definida'}</span>
              {(t.tipo_mistura || t.faixa_granulometrica) && <span>🧪 {[t.tipo_mistura, t.faixa_granulometrica].filter(Boolean).join(' · ')}</span>}
              {t.teor_betume_pct != null && <span>Teor de ligante: {String(t.teor_betume_pct).replace('.', ',')}%</span>}
              <span>✔ Aprovado em {dataBR(t.aprovado_em)}{t.aprovado_por ? ` por ${t.aprovado_por}` : ''}</span>
              <span>📅 Válido até {dataBR(t.valido_ate)}</span>
            </div>
            <div className={styles.acoes}>
              <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={() => onEditar(t)}>✏️ Editar</button>
              <button className={`${ui.btn} ${ui.btnAcao} ${ui.btnPequeno}`} onClick={() => onRevalidar(t)}>↻ Revalidar</button>
              <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={() => onHistorico(t)}>🕘 Histórico</button>
              {t.documento && (
                <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={() => onDocumento(t.documento)}>📎 Documento</button>
              )}
            </div>
          </article>
        )
      })}
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
