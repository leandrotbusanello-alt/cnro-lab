import { useMemo, useState } from 'react'
import { useLab } from '../useLaboratorio'
import { modulosDoUsuario } from '../../../lib/modulos'
import { ehHistorico, rotuloUsuario } from '../../../lib/historico'
import { dataHora } from '../utils'
import { StatusEnsaio } from './StatusBadge'
import EnsaiosPicker from './EnsaiosPicker'
import Modal from '../../../components/ui/Modal'
import styles from './EnsaiosOS.module.css'
import ui from './ui.module.css'

/**
 * Ensaios da O.S.: atribuição de assistente e ficha por ensaio, status,
 * visibilidade para o campo e acesso à revisão.
 */
export default function EnsaiosOS({ pedido, ensaiosOs, podeGerenciar, ocupado, rodar, onRevisar }) {
  const { usuarios, fichas, modelos, ensaios, ensaiosPorId, usuariosPorId, acoes } = useLab()
  // fichas que já têm modelo online (o assistente só consegue executar essas)
  const fichasOnline = useMemo(() => new Set((modelos || []).filter(m => m.ativo !== false).map(m => m.ficha_ensaio_id)), [modelos])
  const rotuloFicha = f => `${f.codigo} — ${f.nome}${f.versao ? ` (${f.versao})` : ''}${fichasOnline.has(f.id) ? ' · online' : ' · sem ficha online'}`
  const [adicionando, setAdicionando] = useState(false)
  // Executor escolhido na lista, ainda não atribuído (só vale ao clicar em "Atribuir")
  const [escolhido, setEscolhido] = useState({})

  const historico = ehHistorico(pedido)
  const executores = useMemo(() => {
    // Executor = usuário ativo com o módulo Assistente liberado (migração 13).
    // Lançamento histórico: inclui inativos (quem executou pode ter saído da empresa).
    const ativos = usuarios.filter(u =>
      (historico || (u.status || 'Ativo') === 'Ativo') && modulosDoUsuario(u).includes('assistente'))
    const soAssistente = u => !modulosDoUsuario(u).includes('laboratorio')
    return {
      assistentes: ativos.filter(soAssistente),
      laboratoristas: ativos.filter(u => !soAssistente(u)),
    }
  }, [usuarios, historico])

  const aprovados = ensaiosOs.filter(e => e.status === 'aprovado').length
  const semAtribuicao = ensaiosOs.filter(e => !e.assistente_id).length

  function fichasDoEnsaio(ensaioId) {
    const ativas = fichas.filter(f => f.ativa !== false)
    const doEnsaio = ativas.filter(f => f.ensaio_id === ensaioId)
    return doEnsaio.length ? { lista: doEnsaio, todas: false } : { lista: ativas, todas: true }
  }

  return (
    <section className={ui.secao}>
      <div className={ui.secaoTitulo}>
        <span>Ensaios da O.S. <span className={styles.qtd}>{aprovados}/{ensaiosOs.length} aprovados</span></span>
        {podeGerenciar && (
          <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={() => setAdicionando(true)} disabled={ocupado}>
            + Adicionar ensaio
          </button>
        )}
      </div>

      {podeGerenciar && semAtribuicao > 0 && (
        <div className={`${ui.aviso} ${ui.avisoAlerta} ${styles.avisoTopo}`}>
          {semAtribuicao} ensaio(s) sem executor. Escolha a ficha e o executor de cada ensaio e clique em "Atribuir ensaio".
        </div>
      )}

      {ensaiosOs.length === 0 ? (
        <p className={ui.vazio}>Nenhum ensaio nesta O.S.</p>
      ) : (
        <div className={styles.lista}>
          <div className={`${styles.linha} ${styles.cabecalho}`}>
            <span>Ensaio</span><span>Ficha</span><span>Executor</span><span>Status</span><span>Campo</span><span />
          </div>

          {ensaiosOs.map(eo => {
            const cat = ensaiosPorId[eo.ensaio_id]
            const { lista: fichasOpc, todas } = fichasDoEnsaio(eo.ensaio_id)
            const travadoExecutor = ['aguardando_revisao', 'aprovado'].includes(eo.status)
            const temResultado = ['aguardando_revisao', 'aprovado', 'devolvido'].includes(eo.status)
              || eo.arquivo_url || (eo.dados_resultado && Object.keys(eo.dados_resultado).length > 0)
            const podeRemover = podeGerenciar && eo.status === 'pendente' && !eo.assistente_id

            return (
              <div key={eo.id} className={`${styles.linha} ${eo.status === 'aguardando_revisao' ? styles.destaque : ''}`}>
                <div className={styles.celEnsaio}>
                  <strong>{eo.nome_ensaio || cat?.nome}</strong>
                  {cat?.norma && <span className={styles.sub}>{cat.norma}</span>}
                  {eo.status === 'devolvido' && eo.devolvido_motivo && (
                    <span className={styles.motivo}>↩ {eo.devolvido_motivo}</span>
                  )}
                  {eo.status === 'aprovado' && eo.aprovado_em && (
                    <span className={styles.sub}>
                      Aprovado {dataHora(eo.aprovado_em)}{usuariosPorId[eo.aprovado_por_id] ? ` · ${usuariosPorId[eo.aprovado_por_id].nome}` : ''}
                    </span>
                  )}
                </div>

                <label className={styles.cel}>
                  <span className={styles.rotuloMobile}>Ficha</span>
                  <select
                    className={ui.input}
                    value={eo.ficha_ensaio_id || ''}
                    disabled={!podeGerenciar || ocupado || eo.status === 'aprovado'}
                    onChange={e => {
                      const novo = e.target.value || null
                      const iniciado = eo.ficha_ensaio_id && ['em_andamento', 'aguardando_revisao', 'devolvido'].includes(eo.status)
                      if (iniciado && !window.confirm(
                        'Trocar a ficha deste ensaio?\n\nO que o assistente já preencheu na ficha atual sai (só material, procedência e ' +
                        'informações complementares são aproveitados) e o ensaio volta para ele como "Devolvido", já com a ficha nova.')) {
                        e.target.value = eo.ficha_ensaio_id || ''
                        return
                      }
                      rodar(() => acoes.atualizarAtribuicao(pedido, eo, { fichaId: novo }),
                        iniciado ? 'Ficha trocada. O ensaio voltou para o assistente.' : 'Ficha definida.')
                    }}
                  >
                    <option value="">{fichasOpc.length ? '— Selecionar —' : 'Nenhuma ficha cadastrada'}</option>
                    {todas ? (
                      fichasOpc.length > 0 && (
                        <optgroup label="Fichas sem vínculo com este ensaio">
                          {fichasOpc.map(f => (
                            <option key={f.id} value={f.id}>{rotuloFicha(f)}</option>
                          ))}
                        </optgroup>
                      )
                    ) : fichasOpc.map(f => (
                      <option key={f.id} value={f.id}>{rotuloFicha(f)}</option>
                    ))}
                  </select>
                </label>

                <div className={`${styles.cel} ${styles.celExecutor}`}>
                  <span className={styles.rotuloMobile}>Executor</span>
                  <select
                    className={ui.input}
                    value={escolhido[eo.id] ?? (eo.assistente_id || '')}
                    disabled={!podeGerenciar || ocupado || travadoExecutor}
                    title={travadoExecutor ? 'Resultado já enviado — devolva ao assistente para trocar o executor' : ''}
                    onChange={e => setEscolhido(x => ({ ...x, [eo.id]: e.target.value }))}
                  >
                    <option value="">— Selecionar —</option>
                    {executores.assistentes.length > 0 && (
                      <optgroup label="Assistentes">
                        {executores.assistentes.map(u => <option key={u.id} value={u.id}>{rotuloUsuario(u)}</option>)}
                      </optgroup>
                    )}
                    {executores.laboratoristas.length > 0 && (
                      <optgroup label="Laboratoristas">
                        {executores.laboratoristas.map(u => <option key={u.id} value={u.id}>{rotuloUsuario(u)}</option>)}
                      </optgroup>
                    )}
                    {eo.assistente_id && !usuarios.some(u => u.id === eo.assistente_id) && (
                      <option value={eo.assistente_id}>(usuário inativo)</option>
                    )}
                  </select>
                  {escolhido[eo.id] !== undefined && escolhido[eo.id] !== (eo.assistente_id || '') && (
                    <div className={styles.atribuirAcoes}>
                      <button
                        type="button"
                        className={`${ui.btn} ${escolhido[eo.id] ? ui.btnAcao : ui.btnPerigo} ${ui.btnPequeno}`}
                        disabled={ocupado}
                        onClick={async () => {
                          const novo = escolhido[eo.id]
                          const ok = await rodar(() => acoes.atualizarAtribuicao(pedido, eo, { assistenteId: novo || null }),
                            novo ? 'Ensaio atribuído.' : 'Atribuição removida.')
                          if (ok) setEscolhido(({ [eo.id]: _, ...resto }) => resto)
                        }}
                      >
                        {escolhido[eo.id] ? (eo.assistente_id ? '✓ Trocar executor' : '✓ Atribuir ensaio') : 'Remover atribuição'}
                      </button>
                      <button type="button" className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} disabled={ocupado}
                        onClick={() => setEscolhido(({ [eo.id]: _, ...resto }) => resto)}>
                        Cancelar
                      </button>
                    </div>
                  )}
                  {eo.assistente_id && (
                    <Auxiliares
                      eo={eo}
                      candidatos={[...executores.assistentes, ...executores.laboratoristas]}
                      usuariosPorId={usuariosPorId}
                      podeGerenciar={podeGerenciar}
                      ocupado={ocupado}
                      onMudar={(lista, msg) => rodar(() => acoes.atualizarAtribuicao(pedido, eo, { auxiliaresIds: lista }), msg)}
                    />
                  )}
                </div>

                <div className={styles.cel}>
                  <span className={styles.rotuloMobile}>Status</span>
                  <span className={styles.statusWrap}><StatusEnsaio status={eo.status} /></span>
                </div>

                <label className={`${styles.cel} ${styles.toggle}`} title="Resultado visível para quem solicitou">
                  <span className={styles.rotuloMobile}>Visível ao campo</span>
                  <input
                    type="checkbox"
                    checked={!!eo.visivel_campo}
                    disabled={!podeGerenciar || ocupado}
                    onChange={e => rodar(() => acoes.alterarVisibilidade(pedido, eo, e.target.checked),
                      e.target.checked ? 'Resultado liberado ao campo.' : 'Resultado ocultado do campo.')}
                  />
                  <span className={styles.toggleTexto}>{eo.visivel_campo ? 'Visível' : 'Oculto'}</span>
                </label>

                <div className={styles.celAcoes}>
                  {temResultado && (
                    <button
                      className={`${ui.btn} ${eo.status === 'aguardando_revisao' && podeGerenciar ? ui.btnAcao : ui.btnSecundario} ${ui.btnPequeno}`}
                      onClick={() => onRevisar(eo)}
                    >
                      {eo.status === 'aguardando_revisao' && podeGerenciar ? 'Revisar' : 'Ver resultado'}
                    </button>
                  )}
                  {podeRemover && (
                    <button
                      className={`${ui.btn} ${ui.btnPerigo} ${ui.btnPequeno}`}
                      disabled={ocupado}
                      onClick={() => {
                        if (window.confirm(`Remover "${eo.nome_ensaio}" desta O.S.?`)) {
                          rodar(() => acoes.removerEnsaioDaOS(pedido, eo), 'Ensaio removido.')
                        }
                      }}
                    >
                      Remover
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {adicionando && (
        <Modal titulo="Adicionar ensaio à O.S." onFechar={() => setAdicionando(false)} largura="lg">
          <EnsaiosPicker
            ensaios={ensaios}
            multiplo={false}
            excluir={ensaiosOs.map(e => e.ensaio_id)}
            onEscolher={async ensaio => {
              const ok = await rodar(() => acoes.adicionarEnsaioNaOS(pedido, ensaio), `${ensaio.nome} adicionado.`)
              if (ok) setAdicionando(false)
            }}
          />
        </Modal>
      )}
    </section>
  )
}

/**
 * Assistentes auxiliares (migração 19): participam do ensaio (ex.: um mede, outro anota),
 * mas quem preenche e assina a ficha é o executor. O ensaio conta para todos no Painel.
 */
function Auxiliares({ eo, candidatos, usuariosPorId, podeGerenciar, ocupado, onMudar }) {
  const atuais = eo.auxiliares_ids || []
  const livres = candidatos.filter(u => u.id !== eo.assistente_id && !atuais.includes(u.id))
  if (!atuais.length && !podeGerenciar) return null
  return (
    <div className={styles.auxiliares}>
      {atuais.map(id => (
        <span key={id} className={styles.auxiliar} title="Auxiliar: participa do ensaio, mas não preenche nem assina">
          🤝 {usuariosPorId[id]?.nome || 'usuário'}
          {podeGerenciar && (
            <button type="button" aria-label={`Remover auxiliar ${usuariosPorId[id]?.nome || ''}`} disabled={ocupado}
              onClick={() => onMudar(atuais.filter(x => x !== id), 'Auxiliar removido.')}>×</button>
          )}
        </span>
      ))}
      {podeGerenciar && livres.length > 0 && (
        <select
          className={`${ui.input} ${styles.auxiliarSelect}`}
          value=""
          disabled={ocupado}
          aria-label="Incluir auxiliar"
          onChange={e => { if (e.target.value) onMudar([...atuais, e.target.value], 'Auxiliar incluído.') }}
        >
          <option value="">+ Auxiliar…</option>
          {livres.map(u => <option key={u.id} value={u.id}>{rotuloUsuario(u)}</option>)}
        </select>
      )}
    </div>
  )
}
