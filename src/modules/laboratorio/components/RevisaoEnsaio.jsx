import { useEffect, useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { useLab } from '../useLaboratorio'
import { dataHora } from '../utils'
import { StatusEnsaio } from './StatusBadge'
import ResultadoView from './ResultadoView'
import ModalMotivo from './ModalMotivo'
import styles from './RevisaoEnsaio.module.css'
import ui from './ui.module.css'

/**
 * Revisão de um ensaio enviado pelo assistente: visualizar resultado/arquivo,
 * aprovar (com opção de liberar ao campo) ou devolver ao assistente.
 *
 * Correção de valores na própria ficha: usará o componente de ficha digital do
 * Módulo Assistente (<FichaEnsaio modo="revisao" />) quando estiver disponível.
 */
export default function RevisaoEnsaio({ pedido, ensaioOs: eo, podeRevisar, ocupado, rodar, onFechar }) {
  const lab = useLab()
  const [detalhado, setDetalhado] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [arquivo, setArquivo] = useState(null)
  const [assinatura, setAssinatura] = useState(null)
  const [liberar, setLiberar] = useState(!!eo?.visivel_campo)
  const [devolvendo, setDevolvendo] = useState(false)

  const assistente = lab.usuariosPorId[eo?.assistente_id]
  const ficha = lab.fichasPorId[eo?.ficha_ensaio_id]
  const ensaio = lab.ensaiosPorId[eo?.ensaio_id]

  useEffect(() => {
    if (!eo) return
    let ativo = true
    setCarregando(true)
    lab.carregarResultadoDetalhado(eo, eo.nome_ensaio || ensaio?.nome)
      .then(r => { if (ativo) setDetalhado(r) })
      .finally(() => { if (ativo) setCarregando(false) })
    lab.urlArquivo(eo.arquivo_url).then(u => { if (ativo) setArquivo(u) })
    if (assistente) lab.urlAssinatura(assistente).then(u => { if (ativo) setAssinatura(u) })
    return () => { ativo = false }
  }, [eo?.id, eo?.resultado_id, eo?.arquivo_url]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!eo) return null

  const aguardando = eo.status === 'aguardando_revisao'
  const podeAprovar = podeRevisar && aguardando
  const podeDevolver = podeRevisar && ['aguardando_revisao', 'aprovado'].includes(eo.status)
  const temDados = eo.dados_resultado && Object.keys(eo.dados_resultado).length > 0
  const ehImagem = arquivo && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(eo.arquivo_url || '')

  if (devolvendo) {
    return (
      <ModalMotivo
        titulo="Devolver ao assistente"
        subtitulo={`${eo.nome_ensaio} · ${assistente?.nome || 'assistente'}`}
        rotulo="Inconsistência encontrada"
        placeholder="Descreva o que precisa ser corrigido no ensaio."
        textoConfirmar="Devolver ao assistente"
        perigo
        ocupado={ocupado}
        onFechar={() => setDevolvendo(false)}
        onConfirmar={async motivo => {
          const ok = await rodar(() => lab.acoes.devolverAoAssistente(pedido, eo, motivo), 'Ensaio devolvido ao assistente.')
          if (ok) onFechar()
        }}
      />
    )
  }

  return (
    <Modal
      titulo={podeAprovar ? `Revisar: ${eo.nome_ensaio}` : eo.nome_ensaio}
      subtitulo={ensaio?.norma}
      largura="lg"
      onFechar={onFechar}
      rodape={(
        <>
          <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={onFechar} disabled={ocupado}>Fechar</button>
          {podeDevolver && (
            <button className={`${ui.btn} ${ui.btnPerigo}`} onClick={() => setDevolvendo(true)} disabled={ocupado}>
              ↩ Devolver ao assistente
            </button>
          )}
          {podeAprovar && (
            <button
              className={`${ui.btn} ${ui.btnAcao}`}
              disabled={ocupado}
              onClick={async () => {
                const ok = await rodar(() => lab.acoes.aprovarEnsaio(pedido, eo, { visivelCampo: liberar }), 'Ensaio aprovado.')
                if (ok) onFechar()
              }}
            >
              ✓ Aprovar resultado
            </button>
          )}
        </>
      )}
    >
      <div className={ui.pilha}>
        <div className={ui.kv}>
          <Item k="Status" v={<StatusEnsaio status={eo.status} />} />
          <Item k="Executor" v={assistente?.nome || '—'} />
          <Item k="Ficha" v={ficha ? `${ficha.codigo} — ${ficha.nome}` : '—'} />
          <Item k="Preenchimento" v={eo.modo_preenchi === 'upload' ? 'Upload de foto/PDF' : 'Ficha digital'} />
          <Item k="Atribuído em" v={dataHora(eo.data_atribuicao)} />
          <Item k="Concluído em" v={dataHora(eo.data_conclusao)} />
          {detalhado?.resultado?.conformidade && <Item k="Conformidade" v={detalhado.resultado.conformidade} />}
        </div>

        {eo.devolvido_motivo && eo.status !== 'aprovado' && (
          <div className={`${ui.aviso} ${ui.avisoAlerta}`}>
            ↩ Devolvido anteriormente{eo.devolvido_em ? ` em ${dataHora(eo.devolvido_em)}` : ''}: {eo.devolvido_motivo}
          </div>
        )}

        <div className={styles.resultado}>
          <div className={ui.secaoTitulo}>Resultado</div>
          {carregando && <p className={ui.ajuda}>Carregando resultado…</p>}
          {detalhado?.detalhes?.length > 0 && <ResultadoView dados={detalhado.detalhes} />}
          {temDados && <ResultadoView dados={eo.dados_resultado} />}
          {detalhado?.resultado?.observacoes && (
            <p className={styles.obs}><strong>Observações:</strong> {detalhado.resultado.observacoes}</p>
          )}
          {eo.arquivo_url && (
            <div className={styles.arquivo}>
              {ehImagem ? (
                <a href={arquivo} target="_blank" rel="noreferrer"><img src={arquivo} alt="Ficha enviada" /></a>
              ) : arquivo ? (
                <a className={`${ui.btn} ${ui.btnSecundario}`} href={arquivo} target="_blank" rel="noreferrer">📄 Abrir arquivo enviado</a>
              ) : (
                <p className={ui.ajuda}>Arquivo anexado (disponível com conexão): {eo.arquivo_url}</p>
              )}
            </div>
          )}
          {!carregando && !temDados && !eo.arquivo_url && !(detalhado?.detalhes?.length > 0) && (
            <p className={ui.vazio}>Nenhum resultado registrado ainda.</p>
          )}
        </div>

        {assinatura && (
          <div className={styles.assinatura}>
            <img src={assinatura} alt={`Assinatura de ${assistente?.nome}`} />
            <span>{assistente?.nome} — executor</span>
          </div>
        )}

        {podeAprovar && (
          <label className={styles.liberar}>
            <input type="checkbox" checked={liberar} onChange={e => setLiberar(e.target.checked)} />
            <span>
              <strong>Liberar resultado para o campo</strong>
              <small>O solicitante poderá ver este resultado assim que for aprovado, sem esperar a O.S. inteira.</small>
            </span>
          </label>
        )}
      </div>
    </Modal>
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
