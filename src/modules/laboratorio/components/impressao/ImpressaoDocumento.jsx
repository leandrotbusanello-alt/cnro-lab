import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLab } from '../../useLaboratorio'
import {
  numeroPE, numeroOS, ehOSProvisoria, nomeEmpresa, rotuloMaterial, rotuloSubtipo,
  data, dataHora, normalizarAmostras, rotuloCampo, valorExibicao,
} from '../../utils'
import { STATUS_ENSAIO } from '../../constants'
import styles from './ImpressaoDocumento.module.css'

/**
 * Pré-visualização e impressão (Imprimir → Salvar como PDF) dos documentos:
 *   doc="os"          → FR-IMOB-04 Ordem de Serviço
 *   doc="solicitacao" → FR-IMOB-05 Solicitação de Ensaios/Estudos
 */
export default function ImpressaoDocumento({ doc, pedido, ensaiosOs, onFechar }) {
  const lab = useLab()
  const [assinaturas, setAssinaturas] = useState({})

  // Assinaturas (executores com resultado enviado + laboratorista na O.S. finalizada)
  useEffect(() => {
    let ativo = true
    const ids = new Set()
    if (doc === 'os') {
      ensaiosOs.filter(e => ['aguardando_revisao', 'aprovado'].includes(e.status) && e.assistente_id)
        .forEach(e => ids.add(e.assistente_id))
      if (pedido.status === 'concluido' && pedido.finalizado_por) ids.add(pedido.finalizado_por)
    }
    Promise.all([...ids].map(async id => [id, await lab.urlAssinatura(lab.usuariosPorId[id])]))
      .then(pares => { if (ativo) setAssinaturas(Object.fromEntries(pares)) })
    return () => { ativo = false }
  }, [doc, pedido.id, pedido.status]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', onKey)
    document.body.classList.add(styles.imprimindo)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove(styles.imprimindo)
    }
  }, [onFechar])

  const titulo = doc === 'os' ? 'FR-IMOB-04 · Ordem de Serviço' : 'FR-IMOB-05 · Solicitação de Ensaios'

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.barra}>
        <strong>{titulo}</strong>
        <div className={styles.barraAcoes}>
          <button className={styles.btnImprimir} onClick={() => window.print()}>🖨 Imprimir / Salvar PDF</button>
          <button className={styles.btnFechar} onClick={onFechar}>Fechar</button>
        </div>
      </div>
      <div className={styles.folhaWrap}>
        {doc === 'os'
          ? <FichaOS pedido={pedido} ensaiosOs={ensaiosOs} lab={lab} assinaturas={assinaturas} />
          : <FichaSolicitacao pedido={pedido} lab={lab} />}
      </div>
    </div>,
    document.body,
  )
}

// ── Cabeçalho comum ──────────────────────────────────────────────────────────

function Cabecalho({ titulo, codigo, versao }) {
  return (
    <table className={styles.cabecalho}>
      <tbody>
        <tr>
          <td className={styles.logo}>
            <strong>CNRO</strong>
            <span>Laboratório</span>
          </td>
          <td className={styles.tituloDoc}>{titulo}</td>
          <td className={styles.codigo}>
            <strong>{codigo}</strong>
            <span>{versao || 'Rev00'}</span>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

function Campo({ rotulo, valor, largo }) {
  return (
    <td className={largo ? styles.largo : undefined} colSpan={largo ? 3 : 1}>
      <span className={styles.rotulo}>{rotulo}</span>
      <span className={styles.valor}>{valor || '—'}</span>
    </td>
  )
}

function Marca({ pedido, doc }) {
  if (doc === 'os' && ehOSProvisoria(pedido)) return <div className={styles.marca}>PROVISÓRIO</div>
  if (!pedido.sequencial && !pedido.numero_pe) return <div className={styles.marca}>PROVISÓRIO</div>
  return null
}

// ── FR-IMOB-04 · Ordem de Serviço ────────────────────────────────────────────

function FichaOS({ pedido, ensaiosOs, lab, assinaturas }) {
  const f = pedido.ficha_os || {}
  const empresa = lab.empresasPorId[pedido.empresa_id]
  const solicitante = lab.usuariosPorId[pedido.solicitante_id]
  const responsavel = lab.usuariosPorId[pedido.finalizado_por || pedido.laboratorista_id]
  const concluida = pedido.status === 'concluido'

  return (
    <div className={styles.folha}>
      <Marca pedido={pedido} doc="os" />
      <Cabecalho titulo="ORDEM DE SERVIÇO" codigo="FR-IMOB-04" />

      <table className={styles.grade}>
        <tbody>
          <tr>
            <Campo rotulo="Nº da O.S." valor={numeroOS(pedido)?.replace(/^O\.S\.\s*/, '')} />
            <Campo rotulo="Pedido" valor={numeroPE(pedido)} />
            <Campo rotulo="Data da solicitação" valor={data(f.data_solicitacao || pedido.created_at)} />
            <Campo rotulo="Validação" valor={data(pedido.data_validacao)} />
          </tr>
          <tr>
            <Campo rotulo="Obra" valor={f.obra || empresa?.rodovia} />
            <Campo rotulo="Empresa / Consórcio" valor={nomeEmpresa(pedido, lab.empresasPorId)} />
            <Campo rotulo="Lote" valor={f.lote || pedido.lote} />
            <Campo rotulo="Solicitante" valor={f.solicitante || solicitante?.nome} />
          </tr>
          <tr>
            <Campo rotulo="Material" valor={`${rotuloMaterial(pedido.material)}${pedido.sub_tipo ? ` · ${rotuloSubtipo(pedido.material, pedido.sub_tipo)}` : ''}`} />
            <Campo rotulo="Início dos ensaios" valor={data(f.inicio_ensaios)} />
            <Campo rotulo="Fim dos ensaios" valor={data(f.fim_ensaios)} />
            <Campo rotulo="Previsão de entrega" valor={data(f.previsao_entrega)} />
          </tr>
        </tbody>
      </table>

      <h4 className={styles.secao}>Ensaios</h4>
      <table className={styles.tabela}>
        <thead>
          <tr><th>#</th><th>Ensaio</th><th>Norma</th><th>Ficha</th><th>Executor</th><th>Status</th><th>Assinatura</th></tr>
        </thead>
        <tbody>
          {ensaiosOs.map((eo, i) => {
            const ficha = lab.fichasPorId[eo.ficha_ensaio_id]
            const exec = lab.usuariosPorId[eo.assistente_id]
            return (
              <tr key={eo.id}>
                <td>{i + 1}</td>
                <td>{eo.nome_ensaio}</td>
                <td>{lab.ensaiosPorId[eo.ensaio_id]?.norma || '—'}</td>
                <td>{ficha ? `${ficha.codigo}` : '—'}</td>
                <td>{exec?.nome || '—'}</td>
                <td>{STATUS_ENSAIO[eo.status]?.label || eo.status}</td>
                <td className={styles.celAssinatura}>
                  {assinaturas[eo.assistente_id] && ['aguardando_revisao', 'aprovado'].includes(eo.status)
                    ? <img src={assinaturas[eo.assistente_id]} alt="" /> : null}
                </td>
              </tr>
            )
          })}
          {ensaiosOs.length === 0 && <tr><td colSpan={7}>Nenhum ensaio.</td></tr>}
        </tbody>
      </table>

      <h4 className={styles.secao}>Observação</h4>
      <div className={styles.caixa}>{f.observacao || pedido.observacoes || '—'}</div>

      <div className={styles.assinaturas}>
        <div className={styles.blocoAssinatura}>
          <div className={styles.espacoAssinatura}>
            {concluida && assinaturas[pedido.finalizado_por] && <img src={assinaturas[pedido.finalizado_por]} alt="" />}
          </div>
          <div className={styles.linhaAssinatura}>{responsavel?.nome || '________________'}</div>
          <span>Laboratorista responsável{concluida ? ` · ${dataHora(pedido.finalizado_em)}` : ''}</span>
        </div>
      </div>

      <div className={styles.rodape}>
        <span>Elaborado: {f.elaborado_por || '—'} · Revisado: {f.revisado_por || '—'} · Aprovado: {f.aprovado_por || '—'}</span>
        <span>{concluida ? 'O.S. finalizada' : 'O.S. em andamento — documento não finalizado'} · Impresso em {dataHora(new Date().toISOString())}</span>
      </div>
    </div>
  )
}

// ── FR-IMOB-05 · Solicitação de Ensaios/Estudos ──────────────────────────────

function FichaSolicitacao({ pedido, lab }) {
  const f = pedido.ficha_sol || {}
  const empresa = lab.empresasPorId[pedido.empresa_id]
  const solicitante = lab.usuariosPorId[pedido.solicitante_id]
  const amostras = normalizarAmostras(pedido.dados_amostra)
  const locs = Array.isArray(f.localizacoes) && f.localizacoes.length
    ? f.localizacoes
    : amostras.map(a => ({
        estaca: a.estaca_inicial || a.estaca_extracao || a.estaca, estaca_final: a.estaca_final,
        pista: a.pista, faixa: a.faixa, lado: a.lado, camada: a.camada,
      }))
  const tipo = t => (f[`tipo_${t}`] || pedido.tipo_solicitacao === t ? '☒' : '☐')

  return (
    <div className={styles.folha}>
      <Marca pedido={pedido} doc="solicitacao" />
      <Cabecalho titulo="SOLICITAÇÃO DE ENSAIOS / ESTUDOS" codigo="FR-IMOB-05" />

      <table className={styles.grade}>
        <tbody>
          <tr>
            <Campo rotulo="Pedido" valor={numeroPE(pedido)} />
            <Campo rotulo="Data" valor={data(pedido.created_at)} />
            <Campo rotulo="Obra" valor={f.obra || empresa?.rodovia} />
            <Campo rotulo="Lote" valor={f.lote || pedido.lote} />
          </tr>
          <tr>
            <Campo rotulo="Empresa / Consórcio" valor={nomeEmpresa(pedido, lab.empresasPorId)} />
            <Campo rotulo="Solicitante" valor={f.solicitante || solicitante?.nome} />
            <Campo rotulo="Contato" valor={f.contato} />
            <Campo rotulo="Material" valor={`${rotuloMaterial(pedido.material)}${pedido.sub_tipo ? ` · ${rotuloSubtipo(pedido.material, pedido.sub_tipo)}` : ''}`} />
          </tr>
        </tbody>
      </table>

      <div className={styles.tipos}>
        <span>{tipo('contraprova')} Contraprova</span>
        <span>{tipo('investigacao')} Investigação</span>
        <span>{tipo('estudo')} Estudo</span>
        <span>{tipo('outros')} Outros{f.tipo_outros_texto ? `: ${f.tipo_outros_texto}` : ''}</span>
      </div>

      <h4 className={styles.secao}>Localização das amostras</h4>
      <table className={styles.tabela}>
        <thead>
          <tr><th>Amostra</th><th>Estaca / KM</th><th>Estaca final</th><th>Pista</th><th>Faixa</th><th>Lado</th><th>Camada</th></tr>
        </thead>
        <tbody>
          {locs.map((l, i) => (
            <tr key={i}>
              <td>{i + 1}</td><td>{l.estaca || '—'}</td><td>{l.estaca_final || '—'}</td><td>{l.pista || '—'}</td>
              <td>{l.faixa || '—'}</td><td>{l.lado || '—'}</td><td>{l.camada || '—'}</td>
            </tr>
          ))}
          {locs.length === 0 && <tr><td colSpan={7}>—</td></tr>}
        </tbody>
      </table>

      <h4 className={styles.secao}>Dados das amostras</h4>
      {amostras.map((a, i) => {
        const campos = Object.entries(a).filter(([, v]) => v !== '' && v !== null && v !== undefined)
        return (
          <div key={i} className={styles.amostra}>
            <strong>Amostra {i + 1}:</strong>{' '}
            {campos.length === 0 ? '—' : campos.map(([k, v]) => `${rotuloCampo(k)}: ${valorExibicao(v)}`).join(' · ')}
          </div>
        )
      })}

      <h4 className={styles.secao}>Ensaios solicitados</h4>
      <div className={styles.caixa}>
        {(pedido.ensaios_ids || []).map(id => lab.ensaiosPorId[id]?.nome || '?').join(' · ') || '—'}
      </div>

      <h4 className={styles.secao}>Observação</h4>
      <div className={styles.caixa}>{f.observacao || pedido.observacoes || '—'}</div>

      <div className={styles.assinaturas}>
        <div className={styles.blocoAssinatura}>
          <div className={styles.espacoAssinatura} />
          <div className={styles.linhaAssinatura}>{solicitante?.nome || '________________'}</div>
          <span>Solicitante</span>
        </div>
        <div className={styles.blocoAssinatura}>
          <div className={styles.espacoAssinatura} />
          <div className={styles.linhaAssinatura}>{lab.usuariosPorId[pedido.laboratorista_id]?.nome || '________________'}</div>
          <span>Recebido pelo laboratório</span>
        </div>
      </div>

      <div className={styles.rodape}>
        <span>Elaborado: {f.elaborado_por || '—'} · Revisado: {f.revisado_por || '—'} · Aprovado: {f.aprovado_por || '—'}</span>
        <span>Impresso em {dataHora(new Date().toISOString())}</span>
      </div>
    </div>
  )
}
