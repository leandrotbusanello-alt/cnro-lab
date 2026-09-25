import { useLocation, useNavigate } from 'react-router-dom'
import { useLab } from '../useLaboratorio'
import { StatusPedido, Selo } from './StatusBadge'
import { numeroPE, numeroOS, nomeEmpresa, rotuloMaterial, rotuloSubtipo, idade, dataHora, normalizarAmostras } from '../utils'
import styles from './PedidoCard.module.css'

export default function PedidoCard({ pedido: p, ensaiosOs, sit, mostrarResponsavel }) {
  const { usuariosPorId, empresasPorId } = useLab()
  const navigate = useNavigate()
  const location = useLocation()
  const os = numeroOS(p, { curto: true })
  const qtdAmostras = normalizarAmostras(p.dados_amostra).length
  const qtdEnsaios = ensaiosOs.length || (p.ensaios_ids || []).length
  const responsavel = usuariosPorId[p.laboratorista_id]?.nome

  function abrir() {
    navigate(`/laboratorio/${encodeURIComponent(p.id)}`, { state: { voltar: location.pathname + location.search } })
  }

  return (
    <button type="button" className={`${styles.card} ${sit.correcaoRecebida ? styles.destaque : ''}`} onClick={abrir}>
      <div className={styles.topo}>
        <div className={styles.numeros}>
          <span className={styles.pe}>{numeroPE(p)}</span>
          {os && <span className={styles.os}>{os}</span>}
        </div>
        <div className={styles.selos}>
          {sit.historico && <Selo tom="neutro" title="Lançamento histórico (somente DEV)">📜 Histórico</Selo>}
          {sit.correcaoRecebida && <Selo tom="alerta">↩ Correção recebida</Selo>}
          {sit.qtdRevisao > 0 && <Selo tom="alerta">{sit.qtdRevisao} p/ revisar</Selo>}
          {sit.qtdDevolvidos > 0 && <Selo tom="erro">{sit.qtdDevolvidos} devolvido(s) ao assist.</Selo>}
          {sit.atribuicaoPendente && <Selo tom="pendente">Atribuição pendente</Selo>}
          {sit.alteradoOffline && <Selo tom="offline" title="Alterações ainda não sincronizadas">📶 Offline</Selo>}
          <StatusPedido status={p.status} />
        </div>
      </div>

      <div className={styles.info}>
        <span>🏢 {nomeEmpresa(p, empresasPorId)}</span>
        {p.lote && <span>📍 Lote {p.lote}</span>}
        <span>🪨 {rotuloMaterial(p.material)}{p.sub_tipo ? ` · ${rotuloSubtipo(p.material, p.sub_tipo)}` : ''}</span>
        <span>🧪 {qtdEnsaios} ensaio(s){qtdAmostras > 1 ? ` · ${qtdAmostras} amostras` : ''}</span>
        {usuariosPorId[p.solicitante_id] && <span>👷 {usuariosPorId[p.solicitante_id].nome}</span>}
      </div>

      <div className={styles.rodape}>
        <span title={dataHora(p.created_at)}>📅 {dataHora(p.created_at)} · {idade(p.created_at)}</span>
        {ensaiosOs.length > 0 && (
          <span className={styles.progresso}>
            <span className={styles.barra}>
              <span style={{ width: `${Math.round((sit.qtdAprovados / ensaiosOs.length) * 100)}%` }} />
            </span>
            {sit.qtdAprovados}/{ensaiosOs.length} aprovados
          </span>
        )}
        {(mostrarResponsavel || sit.historico) && (
          <span className={styles.resp}>{responsavel ? `🔬 ${responsavel}` : 'Sem responsável'}</span>
        )}
      </div>
    </button>
  )
}
