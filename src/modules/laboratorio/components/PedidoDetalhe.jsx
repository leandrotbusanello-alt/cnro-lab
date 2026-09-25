import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLab } from '../useLaboratorio'
import { idMapTodos } from '../../../lib/offlineDB'
import { ehIdTemp } from '../../../lib/syncQueue'
import {
  numeroPE, numeroOS, ehOSProvisoria, nomeEmpresa, rotuloMaterial, rotuloSubtipo,
  dataHora, data, idade,
} from '../utils'
import { situacao } from '../classificacao'
import { StatusPedido, Selo } from './StatusBadge'
import AmostrasView from './AmostrasView'
import EditarPedido from './EditarPedido'
import EnsaiosOS from './EnsaiosOS'
import HistoricoTimeline from './HistoricoTimeline'
import ModalMotivo from './ModalMotivo'
import ModalGerarOS from './ModalGerarOS'
import ModalTransferir from './ModalTransferir'
import ModalFinalizar from './ModalFinalizar'
import RevisaoEnsaio from './RevisaoEnsaio'
import ModalExcluirPedido from './ModalExcluirPedido'
import ModalAlterarNumero from './ModalAlterarNumero'
import FichaDocumento from './fichas/FichaDocumento'
import Toast from '../../../components/ui/Toast'
import styles from './PedidoDetalhe.module.css'
import ui from './ui.module.css'

export default function PedidoDetalhe() {
  const { pedidoId: idParam } = useParams()
  const pedidoId = decodeURIComponent(idParam)
  const lab = useLab()
  const navigate = useNavigate()
  const location = useLocation()

  const [modo, setModo] = useState('ver')          // 'ver' | 'editar'
  const [modal, setModal] = useState(null)         // { tipo, ... }
  const [toast, setToast] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const fecharToast = useCallback(() => setToast(null), [])

  const pedido = lab.pedidosPorId[pedidoId]
  const ensaiosOs = lab.ensaiosOsPorPedido[pedidoId] || []

  // Pedido provisório que acabou de ser sincronizado → vai para o definitivo
  useEffect(() => {
    if (pedido || lab.loading || !ehIdTemp(pedidoId)) return
    idMapTodos().then(mapa => {
      if (mapa[pedidoId]) navigate(`/laboratorio/${mapa[pedidoId]}`, { replace: true, state: location.state })
    })
  }, [pedido, lab.loading, pedidoId, navigate, location.state])

  function voltar() {
    navigate(location.state?.voltar || '/laboratorio')
  }

  if (!pedido) {
    return (
      <div className={styles.naoEncontrado}>
        {lab.loading ? <div className="spinner" /> : (
          <>
            <p>Pedido não encontrado (pode ter sido concluído há mais de 90 dias ou cancelado).</p>
            <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={voltar}>← Voltar</button>
          </>
        )}
      </div>
    )
  }

  const perm = lab.permissoes(pedido)
  const sit = situacao(pedido, ensaiosOs, lab.meuIdPara(pedido))
  const responsavel = lab.usuariosPorId[pedido.laboratorista_id]
  const solicitante = lab.usuariosPorId[pedido.solicitante_id]
  const temOS = !!pedido.numero_os

  /** Executa uma ação, mostra o resultado e retorna true/false */
  async function rodar(fn, msgOk) {
    setOcupado(true)
    try {
      const r = await fn()
      setToast(r?.offline
        ? { type: 'warning', message: 'Salvo neste aparelho. Será enviado quando houver conexão.' }
        : { type: 'success', message: msgOk })
      return true
    } catch (e) {
      setToast({ type: 'error', message: e.message || 'Não foi possível concluir a ação.' })
      return false
    } finally {
      setOcupado(false)
    }
  }

  const fechar = () => setModal(null)

  return (
    <div className={styles.wrapper}>
      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={voltar}>← Voltar</button>
        <div className={styles.titulos}>
          <h2 className={styles.titulo}>
            {numeroPE(pedido)}
            {temOS && <span className={styles.os}> · {numeroOS(pedido)}</span>}
          </h2>
          <div className={styles.selos}>
            <StatusPedido status={pedido.status} />
            {perm.historico && <Selo tom="neutro" title="Lançamento histórico (somente DEV)">📜 Lançamento histórico</Selo>}
            {sit.correcaoRecebida && <Selo tom="alerta">↩ Correção recebida do campo</Selo>}
            {ehOSProvisoria(pedido) && <Selo tom="offline">Número provisório</Selo>}
            {sit.alteradoOffline && <Selo tom="offline">📶 Não sincronizado</Selo>}
          </div>
        </div>
      </div>

      {/* ── Avisos de contexto ────────────────────────────────────────────── */}
      <Avisos pedido={pedido} perm={perm} responsavel={responsavel} lab={lab} />

      {/* ── Barra de ações ────────────────────────────────────────────────── */}
      {modo === 'ver' && (
        <div className={styles.acoes}>
          {perm.podeAnalisar && (
            <>
              <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={() => setModo('editar')} disabled={ocupado}>
                ✏️ Editar pedido
              </button>
              <button className={`${ui.btn} ${ui.btnPerigo}`} onClick={() => setModal({ tipo: 'devolverCampo' })} disabled={ocupado}>
                ↩ Devolver ao campo
              </button>
              <button className={`${ui.btn} ${ui.btnAcao}`} onClick={() => setModal({ tipo: 'gerarOS' })} disabled={ocupado}>
                ✓ Validar e gerar O.S.
              </button>
            </>
          )}
          {perm.podeGerenciarOS && (
            <button
              className={`${ui.btn} ${ui.btnAcao}`}
              onClick={() => setModal({ tipo: 'finalizar' })}
              disabled={ocupado || !sit.todosAprovados}
              title={sit.todosAprovados ? '' : 'Todos os ensaios precisam estar aprovados'}
            >
              ✍️ Finalizar O.S.
            </button>
          )}
          {perm.podeTransferir && (
            <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={() => setModal({ tipo: 'transferir' })} disabled={ocupado}>
              ⇄ Transferir
            </button>
          )}
          {perm.podeAlterarNumero && (
            <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={() => setModal({ tipo: 'numero' })} disabled={ocupado}
              title="Somente DEV">
              # Alterar nº
            </button>
          )}
          {perm.podeExcluir && (
            <button className={`${ui.btn} ${ui.btnPerigo}`} onClick={() => setModal({ tipo: 'excluir' })} disabled={ocupado}
              title="Somente DEV">
              🗑 Excluir pedido
            </button>
          )}
        </div>
      )}

      {/* ── Conteúdo ──────────────────────────────────────────────────────── */}
      {modo === 'editar' ? (
        <EditarPedido
          pedido={pedido}
          onCancelar={() => setModo('ver')}
          onSalvar={async (patch, campos) => {
            const ok = await rodar(() => lab.acoes.salvarEdicao(pedido, patch, campos), 'Pedido atualizado.')
            if (ok) setModo('ver')
          }}
          ocupado={ocupado}
        />
      ) : (
        <div className={styles.grade}>
          <div className={styles.principal}>
            {/* Dados gerais */}
            <section className={ui.secao}>
              <div className={ui.secaoTitulo}>Dados do pedido</div>
              <div className={ui.kv}>
                <Item k="Empresa" v={nomeEmpresa(pedido, lab.empresasPorId)} />
                <Item k="Lote" v={pedido.lote || <span className={styles.faltando}>não informado</span>} />
                <Item k="Material" v={rotuloMaterial(pedido.material)} />
                <Item k="Subcategoria" v={rotuloSubtipo(pedido.material, pedido.sub_tipo) || '—'} />
                <Item k="Solicitante" v={solicitante?.nome || '—'} />
                <Item k="Data do pedido" v={`${dataHora(pedido.created_at)} (${idade(pedido.created_at)})`} />
                {pedido.data_validacao && <Item k="Validação da O.S." v={data(pedido.data_validacao)} />}
                <Item k="Responsável (Lab)" v={responsavel?.nome || 'Sem responsável'} />
              </div>
              {pedido.observacoes && (
                <div className={styles.obs}>
                  <span className={ui.kvChave}>Observações</span>
                  <p>{pedido.observacoes}</p>
                </div>
              )}
            </section>

            {/* Amostras */}
            <AmostrasView pedido={pedido} />

            {/* Ensaios */}
            {temOS ? (
              <EnsaiosOS
                pedido={pedido}
                ensaiosOs={ensaiosOs}
                podeGerenciar={perm.podeGerenciarOS}
                ocupado={ocupado}
                rodar={rodar}
                onRevisar={eo => setModal({ tipo: 'revisao', ensaioOsId: eo.id })}
              />
            ) : (
              <section className={ui.secao}>
                <div className={ui.secaoTitulo}>
                  Ensaios solicitados <span className={styles.qtd}>{(pedido.ensaios_ids || []).length}</span>
                </div>
                {(pedido.ensaios_ids || []).length === 0 ? (
                  <p className={ui.vazio}>Nenhum ensaio selecionado.</p>
                ) : (
                  <ul className={styles.listaEnsaios}>
                    {(pedido.ensaios_ids || []).map(id => {
                      const e = lab.ensaiosPorId[id]
                      return (
                        <li key={id}>
                          <strong>{e?.nome || 'Ensaio não encontrado'}</strong>
                          {e?.norma && <span> · {e.norma}</span>}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )}
          </div>

          <aside className={styles.lateral}>
            <section className={ui.secao}>
              <div className={ui.secaoTitulo}>Documentos</div>
              <div className={styles.docs}>
                <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={() => setModal({ tipo: 'ficha', doc: 'solicitacao' })}>
                  📄 FR-IMOB-05 · Solicitação
                </button>
                <button
                  className={`${ui.btn} ${ui.btnSecundario}`}
                  onClick={() => setModal({ tipo: 'ficha', doc: 'os' })}
                  disabled={!temOS}
                  title={temOS ? '' : 'Disponível após gerar a O.S.'}
                >
                  📄 FR-IMOB-04 · Ordem de Serviço
                </button>
              </div>
            </section>
            <HistoricoTimeline historico={pedido.historico} />
          </aside>
        </div>
      )}

      {/* ── Modais ────────────────────────────────────────────────────────── */}
      {modal?.tipo === 'devolverCampo' && (
        <ModalMotivo
          titulo="Devolver ao campo"
          subtitulo={`${numeroPE(pedido)} volta para ${solicitante?.nome || 'o solicitante'} corrigir.`}
          rotulo="Motivo da devolução"
          placeholder="Descreva o que precisa ser corrigido (ex.: KM da amostra 2 ausente)."
          textoConfirmar="Devolver ao campo"
          perigo
          ocupado={ocupado}
          onFechar={fechar}
          onConfirmar={async motivo => {
            const ok = await rodar(() => lab.acoes.devolverAoCampo(pedido, motivo), 'Pedido devolvido ao campo.')
            if (ok) fechar()
          }}
        />
      )}
      {modal?.tipo === 'gerarOS' && (
        <ModalGerarOS
          pedido={pedido}
          ocupado={ocupado}
          onFechar={fechar}
          onConfirmar={async ({ lote, dataValidacao }) => {
            const ok = await rodar(() => lab.acoes.gerarOS(pedido, { lote, dataValidacao }), 'O.S. gerada.')
            if (ok) fechar()
          }}
        />
      )}
      {modal?.tipo === 'transferir' && (
        <ModalTransferir
          pedido={pedido}
          ocupado={ocupado}
          onFechar={fechar}
          onConfirmar={async (paraId, motivo) => {
            const ok = await rodar(() => lab.acoes.transferirOS(pedido, paraId, motivo), 'O.S. transferida.')
            if (ok) fechar()
          }}
        />
      )}
      {modal?.tipo === 'finalizar' && (
        <ModalFinalizar
          pedido={pedido}
          ensaiosOs={ensaiosOs}
          ocupado={ocupado}
          rodar={rodar}
          onFechar={fechar}
          onConfirmar={async (opcoes) => {
            const ok = await rodar(() => lab.acoes.finalizarOS(pedido, opcoes), 'O.S. finalizada.')
            if (ok) fechar()
          }}
        />
      )}
      {modal?.tipo === 'numero' && (
        <ModalAlterarNumero
          pedido={pedido}
          ocupado={ocupado}
          onFechar={fechar}
          onConfirmar={async n => {
            const ok = await rodar(() => lab.acoes.alterarNumeroPE(pedido, n), 'Número alterado.')
            if (ok) fechar()
          }}
        />
      )}
      {modal?.tipo === 'excluir' && (
        <ModalExcluirPedido
          pedido={pedido}
          ensaiosOs={ensaiosOs}
          ocupado={ocupado}
          onFechar={fechar}
          onConfirmar={async confirmacao => {
            const ok = await rodar(() => lab.acoes.excluirPedido(pedido, confirmacao), `${numeroPE(pedido)} excluído.`)
            if (ok) voltar()
          }}
        />
      )}
      {modal?.tipo === 'revisao' && (
        <RevisaoEnsaio
          pedido={pedido}
          ensaioOs={ensaiosOs.find(e => e.id === modal.ensaioOsId)}
          podeRevisar={perm.podeGerenciarOS}
          ocupado={ocupado}
          rodar={rodar}
          onFechar={fechar}
        />
      )}
      {modal?.tipo === 'ficha' && (
        <FichaDocumento
          doc={modal.doc}
          pedido={pedido}
          editavel={modal.doc === 'os' ? perm.podeGerenciarOS : (perm.podeAnalisar || perm.podeGerenciarOS)}
          ocupado={ocupado}
          onFechar={fechar}
          onSalvar={dados => rodar(
            () => (modal.doc === 'os'
              ? lab.acoes.salvarFichaOS(pedido, dados)
              : lab.acoes.salvarFichaSolicitacao(pedido, dados)),
            'Ficha salva.',
          )}
        />
      )}

      {toast && <Toast key={toast.message + toast.type} {...toast} onClose={fecharToast} />}
    </div>
  )
}

function Item({ k, v }) {
  return (
    <div className={ui.kvItem}>
      <span className={ui.kvChave}>{k}</span>
      <span className={ui.kvValor}>{v}</span>
    </div>
  )
}

function Avisos({ pedido, perm, responsavel, lab }) {
  const ultimoEvento = (pedido.historico || []).slice(-1)[0]
  const finalizador = lab.usuariosPorId[pedido.finalizado_por]

  if (perm.historico && pedido.status !== 'concluido') {
    return (
      <div className={`${ui.aviso} ${ui.avisoInfo}`}>
        📜 <span><strong>Lançamento histórico.</strong> Você age em nome de <strong>{responsavel?.nome || 'laboratorista'}</strong> (laboratorista)
        e dos executores atribuídos, com as assinaturas deles e as datas que informar em cada etapa.
        O histórico registra que o lançamento foi feito por você. Somente o DEV vê e altera este pedido.</span>
      </div>
    )
  }
  if (pedido.status === 'concluido') {
    return (
      <div className={`${ui.aviso} ${ui.avisoOk}`}>
        🔒 O.S. finalizada em {dataHora(pedido.finalizado_em)}{finalizador ? ` por ${finalizador.nome}` : ''}.
        Documento bloqueado — somente o Gestor pode reabrir.
      </div>
    )
  }
  if (pedido.status === 'cancelado') {
    return <div className={`${ui.aviso} ${ui.avisoErro}`}>Pedido cancelado.</div>
  }
  if (pedido.status === 'devolvido_campo') {
    return (
      <div className={`${ui.aviso} ${ui.avisoAlerta}`}>
        ↩ Aguardando correção do campo.{pedido.motivo_devolucao && <> Motivo: <strong>{pedido.motivo_devolucao}</strong></>}
      </div>
    )
  }
  if (perm.livre) {
    return (
      <div className={`${ui.aviso} ${ui.avisoInfo}`}>
        ℹ️ Pedido na fila geral. Você passa a ser o responsável ao editar, devolver ao campo ou gerar a O.S.
        Se apenas consultar e sair, ele continua na fila.
      </div>
    )
  }
  if (!perm.souResp) {
    return (
      <div className={`${ui.aviso} ${ui.avisoInfo}`}>
        👁 Somente leitura — responsável: <strong>{responsavel?.nome || 'outro laboratorista'}</strong>.
        Para assumir, peça a transferência da O.S.
      </div>
    )
  }
  if (pedido.status === 'aguardando_lab' && ultimoEvento) {
    return (
      <div className={`${ui.aviso} ${ui.avisoAlerta}`}>
        ↩ O campo reenviou este pedido após a correção. Confira os dados e siga com a análise.
      </div>
    )
  }
  return null
}
