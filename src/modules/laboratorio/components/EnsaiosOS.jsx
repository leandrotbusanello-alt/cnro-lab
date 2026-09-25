import { useMemo, useState } from 'react'
import { useLab } from '../useLaboratorio'
import { modulosDoUsuario } from '../../../lib/modulos'
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

  const executores = useMemo(() => {
    // Executor = usuário ativo com o módulo Assistente liberado (migração 13)
    const ativos = usuarios.filter(u =>
      (u.status || 'Ativo') === 'Ativo' && modulosDoUsuario(u).includes('assistente'))
    const soAssistente = u => !modulosDoUsuario(u).includes('laboratorio')
    return {
      assistentes: ativos.filter(soAssistente),
      laboratoristas: ativos.filter(u => !soAssistente(u)),
    }
  }, [usuarios])

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
          {semAtribuicao} ensaio(s) sem executor. Selecione o assistente de cada ensaio.
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
                    onChange={e => rodar(() => acoes.atualizarAtribuicao(pedido, eo, { fichaId: e.target.value || null }), 'Ficha definida.')}
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

                <label className={styles.cel}>
                  <span className={styles.rotuloMobile}>Executor</span>
                  <select
                    className={ui.input}
                    value={eo.assistente_id || ''}
                    disabled={!podeGerenciar || ocupado || travadoExecutor}
                    title={travadoExecutor ? 'Resultado já enviado — devolva ao assistente para trocar o executor' : ''}
                    onChange={e => rodar(() => acoes.atualizarAtribuicao(pedido, eo, { assistenteId: e.target.value || null }),
                      e.target.value ? 'Ensaio atribuído.' : 'Atribuição removida.')}
                  >
                    <option value="">— Selecionar —</option>
                    {executores.assistentes.length > 0 && (
                      <optgroup label="Assistentes">
                        {executores.assistentes.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                      </optgroup>
                    )}
                    {executores.laboratoristas.length > 0 && (
                      <optgroup label="Laboratoristas">
                        {executores.laboratoristas.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                      </optgroup>
                    )}
                    {eo.assistente_id && !usuarios.some(u => u.id === eo.assistente_id) && (
                      <option value={eo.assistente_id}>(usuário inativo)</option>
                    )}
                  </select>
                </label>

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
