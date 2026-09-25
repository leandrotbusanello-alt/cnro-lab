import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAssist } from '../useAssistente'
import { STATUS_ASSISTENTE } from '../constants'
import { numeroOS, numeroPE, nomeEmpresa, rotuloMaterial, rotuloSubtipo, idade, dataHora, normalizarAmostras } from '../../laboratorio/utils'
import { Selo } from '../../laboratorio/components/StatusBadge'
import ui from '../../laboratorio/components/ui.module.css'
import styles from './FilaAssistente.module.css'

/** Fila do assistente: ensaios atribuídos a ele, devolvidos primeiro. */
export default function FilaAssistente() {
  const a = useAssist()

  const devolvidos = a.fila.filter(e => e.status === 'devolvido').length
  const emExecucao = a.fila.filter(e => e.status === 'em_andamento').length
  const aIniciar = a.fila.filter(e => e.status === 'pendente').length

  // Vindo de um número do Painel (ex.: "?status=devolvido")
  const [params, setParams] = useSearchParams()
  const statusFiltro = params.get('status') || ''
  const listaFiltrada = statusFiltro ? a.fila.filter(e => e.status === statusFiltro) : a.fila

  return (
    <>
      <header className={styles.cabecalho}>
        <div>
          <h1 className={styles.titulo}>Meus ensaios</h1>
          <p className={styles.sub}>Olá, {a.eu?.nome?.split(' ')[0] || 'assistente'}. Abra um ensaio para preencher a ficha.</p>
        </div>
        <div className={styles.contadores}>
          {devolvidos > 0 && <Selo tom="erro">{devolvidos} devolvido(s)</Selo>}
          {emExecucao > 0 && <Selo tom="info">{emExecucao} em execução</Selo>}
          {aIniciar > 0 && <Selo tom="pendente">{aIniciar} a iniciar</Selo>}
        </div>
      </header>

      {!a.eu?.assinatura_url && !a.loading && (
        <div className={`${ui.aviso} ${ui.avisoAlerta}`}>
          ✍️ Você ainda não tem assinatura cadastrada. Pode preencher as fichas normalmente, mas só conseguirá
          enviar para revisão depois que o Gestor cadastrar sua assinatura.
        </div>
      )}

      {a.erro && <div className={`${ui.aviso} ${ui.avisoErro}`}>{a.erro}</div>}

      {statusFiltro && (
        <div className={`${ui.aviso} ${ui.avisoInfo}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🔎 Filtrado pelo Painel: {STATUS_ASSISTENTE[statusFiltro]?.label || statusFiltro}</span>
          <button type="button" className={ui.btnLink} onClick={() => setParams({}, { replace: true })}>Ver todos</button>
        </div>
      )}

      {a.loading ? (
        <div className={styles.carregando}><div className="spinner" /></div>
      ) : listaFiltrada.length === 0 ? (
        <div className={styles.vazio}>
          <span className={styles.vazioIcone}>✅</span>
          <strong>{statusFiltro ? 'Nenhum ensaio nessa situação' : 'Nenhum ensaio na sua fila'}</strong>
          <span>Quando o laboratorista atribuir um ensaio a você, ele aparece aqui.</span>
        </div>
      ) : (
        <div className={styles.lista}>
          {listaFiltrada.map(eo => <CardEnsaio key={eo.id} eo={eo} />)}
        </div>
      )}
    </>
  )
}

function CardEnsaio({ eo }) {
  const a = useAssist()
  const navigate = useNavigate()
  const p = a.pedidosPorId[eo.pedido_id] || {}
  const ficha = a.fichasPorId[eo.ficha_ensaio_id]
  const cat = a.ensaiosPorId[eo.ensaio_id]
  const st = STATUS_ASSISTENTE[eo.status] || { label: eo.status, tom: 'neutro' }
  const lab = a.usuariosPorId[p.laboratorista_id]
  const qtdAmostras = normalizarAmostras(p.dados_amostra).length
  const tom = eo.status === 'devolvido' ? styles.devolvido : eo.status === 'em_andamento' ? styles.andamento : ''

  return (
    <button type="button" className={`${styles.card} ${tom}`} onClick={() => navigate(`/assistente/${encodeURIComponent(eo.id)}`)}>
      <div className={styles.topo}>
        <div className={styles.nomes}>
          <strong className={styles.ensaio}>{eo.nome_ensaio || cat?.nome || 'Ensaio'}</strong>
          <span className={styles.os}>{numeroOS(p, { curto: true }) || numeroPE(p)}</span>
        </div>
        <div className={styles.selos}>
          {eo._alteradoOffline && <Selo tom="offline" title="Alterações ainda não sincronizadas">📶 Offline</Selo>}
          <Selo tom={st.tom}>{st.label}</Selo>
        </div>
      </div>

      {eo.status === 'devolvido' && eo.devolvido_motivo && (
        <div className={styles.motivo}>↩ {eo.devolvido_motivo}</div>
      )}

      <div className={styles.info}>
        <span>🏢 {nomeEmpresa(p, a.empresasPorId)}</span>
        <span>🪨 {rotuloMaterial(p.material)}{p.sub_tipo ? ` · ${rotuloSubtipo(p.material, p.sub_tipo)}` : ''}</span>
        {qtdAmostras > 1 && <span>📦 {qtdAmostras} amostras</span>}
        <span>📄 {ficha ? `${ficha.codigo}` : 'Ficha não definida'}</span>
        {lab && <span>🔬 {lab.nome}</span>}
      </div>

      <div className={styles.rodape}>
        {eo.status === 'devolvido'
          ? <span>Devolvido {idade(eo.devolvido_em)}</span>
          : <span title={dataHora(eo.data_atribuicao)}>Atribuído {idade(eo.data_atribuicao || eo.created_at)}</span>}
        {eo.rascunho_em && eo.status === 'em_andamento' && <span>Rascunho salvo {idade(eo.rascunho_em)}</span>}
        <span className={styles.abrir}>{eo.status === 'pendente' ? 'Abrir e iniciar →' : 'Continuar →'}</span>
      </div>
    </button>
  )
}
