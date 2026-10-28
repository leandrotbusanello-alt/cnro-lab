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
import AvisoTraco from './AvisoTraco'
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
import ModalDatas from './ModalDatas'
import ModalReabrir from './ModalReabrir'
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

  // FR-IMOB-04 aberta antes da O.S. (migração 17): com internet, abre a ficha já
  // preenchida e o botão "Gerar O.S." fica dentro dela. Sem internet, o modal simples.
  async function abrirGerarOS() {
    if (!navigator.onLine || ehIdTemp(pedido.id)) { setModal({ tipo: 'gerarOS' }); return }
    setOcupado(true)
    try {
      const previa = await lab.previaFichaOS(pedido.id)
      setModal(previa ? { tipo: 'ficha', doc: 'os', previa } : { tipo: 'gerarOS' })
    } catch (e) {
      setToast({ type: 'error', message: e.message || 'Não foi possível abrir a FR-IMOB-04.' })
    } finally {
      setOcupado(false)
    }
  }

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
            {perm.historico && <Selo tom="neutro" title="Lançamento histórico (DEV e quem tem a permissão)">📜 Lançamento histórico</Selo>}
            {sit.correcaoRecebida && <Selo tom="alerta">↩ Correção recebida do campo</Selo>}
            {ehOSProvisoria(pedido) && <Selo tom="offline">Número provisório</Selo>}
            {sit.alteradoOffline && <Selo tom="offline">📶 Não sincronizado</Selo>}
            {perm.reaberta && <Selo tom="alerta" title={pedido.reaberta_motivo || ''}>🔓 Reaberta</Selo>}
            {perm.reaberturaSolicitada && <Selo tom="alerta">🔓 Reabertura solicitada</Selo>}
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
              <button className={`${ui.btn} ${ui.btnAcao}`} onClick={abrirGerarOS} disabled={ocupado}>
                ✓ Validar e gerar O.S.
              </button>
            </>
          )}
          {perm.podeEditarReaberta && (
            <>
              <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={() => setModo('editar')} disabled={ocupado}>
                ✏️ Editar pedido
              </button>
              <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={() => setModal({ tipo: 'datasOS' })} disabled={ocupado}>
                📅 Datas da O.S.
              </button>
            </>
          )}
          {perm.podeSolicitarReabertura && (
            <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={() => setModal({ tipo: 'solicitarReabertura' })} disabled={ocupado}>
              🔓 Solicitar reabertura
            </button>
          )}
          {perm.podeReabrir && perm.reaberturaSolicitada && (
            <>
              <button className={`${ui.btn} ${ui.btnAcao}`} onClick={() => setModal({ tipo: 'reabrir' })} disabled={ocupado}>
                ✓ Autorizar reabertura
              </button>
              <button className={`${ui.btn} ${ui.btnPerigo}`} onClick={() => setModal({ tipo: 'recusarReabertura' })} disabled={ocupado}>
                ✕ Recusar
              </button>
            </>
          )}
          {perm.podeReabrir && !perm.reaberturaSolicitada && (
            <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={() => setModal({ tipo: 'reabrir' })} disabled={ocupado}>
              🔓 Reabrir O.S.
            </button>
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
          comOS={temOS}
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
            <AvisoTraco pedido={pedido} />
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
                onEditarDatas={perm.podeEditarReaberta ? eo => setModal({ tipo: 'datasEnsaio', ensaioOsId: eo.id }) : undefined}
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
                  onClick={() => (temOS ? setModal({ tipo: 'ficha', doc: 'os' }) : abrirGerarOS())}
                  disabled={!temOS && (!perm.podeAnalisar || ocupado)}
                  title={temOS ? '' : perm.podeAnalisar ? 'Abrir a ficha, ajustar e gerar a O.S.' : 'Disponível após gerar a O.S.'}
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
      {modal?.tipo === 'solicitarReabertura' && (
        <ModalMotivo
          titulo="Solicitar reabertura da O.S."
          subtitulo={`${numeroOS(pedido)} · o Gestor recebe o pedido e autoriza ou recusa.`}
          rotulo="Motivo da reabertura"
          placeholder="O que precisa ser corrigido (ex.: empresa errada; data da O.S. com ano errado)."
          textoConfirmar="Enviar pedido ao Gestor"
          ocupado={ocupado}
          onFechar={fechar}
          onConfirmar={async motivo => {
            const ok = await rodar(() => lab.acoes.solicitarReabertura(pedido, motivo), 'Pedido de reabertura enviado ao Gestor.')
            if (ok) fechar()
          }}
        />
      )}
      {modal?.tipo === 'recusarReabertura' && (
        <ModalMotivo
          titulo="Recusar reabertura"
          subtitulo={`Pedido de ${lab.usuariosPorId[pedido.reabertura_solicitada_por]?.nome || 'laboratorista'}: “${pedido.reabertura_motivo || ''}”`}
          rotulo="Motivo da recusa"
          textoConfirmar="Recusar"
          perigo
          ocupado={ocupado}
          onFechar={fechar}
          onConfirmar={async motivo => {
            const ok = await rodar(() => lab.acoes.recusarReabertura(pedido, motivo), 'Reabertura recusada.')
            if (ok) fechar()
          }}
        />
      )}
      {modal?.tipo === 'reabrir' && (
        <ModalReabrir
          pedido={pedido}
          solicitante={lab.usuariosPorId[pedido.reabertura_solicitada_por]}
          ocupado={ocupado}
          onFechar={fechar}
          onConfirmar={async motivo => {
            const ok = await rodar(() => lab.acoes.reabrirOS(pedido, motivo), 'O.S. reaberta. Ela volta para o laboratorista.')
            if (ok) fechar()
          }}
        />
      )}
      {modal?.tipo === 'datasOS' && (
        <ModalDatas
          titulo="Datas da O.S."
          subtitulo={numeroOS(pedido)}
          aviso={`O número da O.S. começa pela data da O.S. — ao mudá-la, o número muda junto (lote e sequencial continuam). A data da solicitação fica em ${pedido.ano}, o ano do PE.`}
          campos={[
            { chave: 'dataSolicitacao', rotulo: 'Data da solicitação (PE)', valor: pedido.created_at, tipo: 'momento', obrigatorio: true },
            { chave: 'dataOS', rotulo: 'Data da O.S.', valor: pedido.data_validacao, tipo: 'data', obrigatorio: true },
          ]}
          ocupado={ocupado}
          onFechar={fechar}
          onConfirmar={async v => {
            const ok = await rodar(() => lab.acoes.alterarDatasOS(pedido, v), 'Datas da O.S. atualizadas.')
            if (ok) fechar()
          }}
        />
      )}
      {modal?.tipo === 'datasEnsaio' && (() => {
        const eo = ensaiosOs.find(e => e.id === modal.ensaioOsId)
        if (!eo) return null
        return (
          <ModalDatas
            titulo="Datas do ensaio"
            subtitulo={`${eo.nome_ensaio} · ${numeroOS(pedido)}`}
            aviso="As datas das assinaturas na ficha (executor e calculista) e as do resultado acompanham."
            campos={[
              { chave: 'atribuicao', rotulo: 'Atribuição', valor: eo.data_atribuicao, tipo: 'momento' },
              { chave: 'inicio', rotulo: 'Início da execução', valor: eo.iniciado_em, tipo: 'momento' },
              { chave: 'envio', rotulo: 'Envio para revisão (execução)', valor: eo.enviado_em || eo.data_conclusao, tipo: 'momento' },
              { chave: 'aprovacao', rotulo: 'Aprovação', valor: eo.aprovado_em, tipo: 'momento', desabilitado: eo.status !== 'aprovado' },
            ]}
            ocupado={ocupado}
            onFechar={fechar}
            onConfirmar={async v => {
              const ok = await rodar(() => lab.acoes.alterarDatasEnsaio(pedido, eo, v), 'Datas do ensaio atualizadas.')
              if (ok) fechar()
            }}
          />
        )
      })()}
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
          previa={modal.previa}
          editavel={modal.previa ? perm.podeAnalisar : modal.doc === 'os' ? perm.podeGerenciarOS : (perm.podeAnalisar || perm.podeGerenciarOS)}
          ocupado={ocupado}
          onFechar={fechar}
          onGerarOS={async opcoes => {
            const ok = await rodar(() => lab.acoes.gerarOS(pedido, opcoes), 'O.S. gerada.')
            if (ok) fechar()
          }}
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
        O histórico registra que o lançamento foi feito por você. Somente o DEV e quem tem a permissão de lançar histórico veem e alteram este pedido.</span>
      </div>
    )
  }
  if (pedido.status === 'concluido') {
    const solicitante = lab.usuariosPorId[pedido.reabertura_solicitada_por]
    return (
      <>
        <div className={`${ui.aviso} ${ui.avisoOk}`}>
          🔒 O.S. finalizada em {dataHora(pedido.finalizado_em)}{finalizador ? ` por ${finalizador.nome}` : ''}.
          Documento bloqueado — somente o Gestor pode reabrir.
        </div>
        {pedido.reabertura_solicitada_em && (
          <div className={`${ui.aviso} ${ui.avisoAlerta}`}>
            🔓 <span><strong>Reabertura solicitada</strong> por {solicitante?.nome || 'laboratorista'} em {dataHora(pedido.reabertura_solicitada_em)}
            {' '}— aguardando o Gestor. Motivo: <strong>{pedido.reabertura_motivo}</strong></span>
          </div>
        )}
      </>
    )
  }
  if (perm.reaberta) {
    const quem = lab.usuariosPorId[pedido.reaberta_por]
    return (
      <div className={`${ui.aviso} ${ui.avisoAlerta}`}>
        🔓 <span><strong>O.S. reaberta</strong> em {dataHora(pedido.reaberta_em)}{quem ? ` por ${quem.nome}` : ''}.
        Motivo: <strong>{pedido.reaberta_motivo}</strong>. A finalização anterior foi desconsiderada:
        corrija o que for preciso (pedido, datas, ensaios) e finalize de novo.</span>
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
