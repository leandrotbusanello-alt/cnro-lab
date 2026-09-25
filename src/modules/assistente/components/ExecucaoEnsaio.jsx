import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Modal from '../../../components/ui/Modal'
import { useAssist } from '../useAssistente'
import { STATUS_ASSISTENTE, ESPERA_RASCUNHO_LOCAL } from '../constants'
import {
  modeloIdDoEnsaio, lerRascunho, gravarRascunho, baseDoRascunho,
} from '../assistenteRepo'
import { obterModelo } from '../../fichas/fichasRepo'
import { camposDoPedido } from '../../fichas/camposPedido'
import { estadoDosDados } from '../../fichas/motor/ficha.js'
import { useFicha } from '../../fichas/useFicha'
import { INTERVALO_RASCUNHO_SERVIDOR } from '../../fichas/constants'
import FichaEnsaio from '../../fichas/components/FichaEnsaio'
import FotoApoio from '../../fichas/components/FotoApoio'
import { urlAssinatura } from '../../laboratorio/labRepo'
import { numeroOS, numeroPE, dataHora, hojeISO } from '../../laboratorio/utils'
import { ehHistorico, dataParaISO, isoParaData } from '../../../lib/historico'
import { Selo } from '../../laboratorio/components/StatusBadge'
import DadosPedido from './DadosPedido'
import ui from '../../laboratorio/components/ui.module.css'
import styles from './ExecucaoEnsaio.module.css'

const hora = iso => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '')

/**
 * Execução de um ensaio pelo assistente:
 *   Iniciar → preencher a ficha (salva sozinha no aparelho e no servidor) →
 *   assinar → enviar para revisão (o ensaio sai da fila).
 */
export default function ExecucaoEnsaio() {
  const a = useAssist()
  const { ensaioOsId } = useParams()
  const navigate = useNavigate()
  const id = decodeURIComponent(ensaioOsId || '')
  const eo = a.ensaiosOs.find(e => e.id === id)
  const pedido = eo ? a.pedidosPorId[eo.pedido_id] : null
  // Lançamento histórico: o DEV preenche e assina em nome do assistente atribuído, na data informada
  const historico = ehHistorico(pedido)
  const executor = eo ? a.executorDe(eo) : a.eu
  const nomeExec = historico ? (executor?.nome || 'O executor') : 'Você'
  const dataMinExec = isoParaData(eo?.data_atribuicao) || pedido?.data_validacao || ''
  const [dataExec, setDataExec] = useState('')
  const dataExecOk = !historico || (!!dataExec && dataExec <= hojeISO() && (!dataMinExec || dataExec >= dataMinExec))

  // ── Modelo da ficha ──────────────────────────────────────────────────────
  const modeloId = eo ? modeloIdDoEnsaio(eo, a.modelos) : null
  const [modeloReg, setModeloReg] = useState(null)
  const [erroModelo, setErroModelo] = useState(null)
  useEffect(() => {
    let ativo = true
    setErroModelo(null)
    if (!modeloId) { setModeloReg(null); return undefined }
    obterModelo(modeloId)
      .then(m => {
        if (!ativo) return
        setModeloReg(m)
        if (!m) setErroModelo('A ficha ainda não foi baixada neste aparelho. Conecte-se à internet uma vez para baixá-la.')
      })
      .catch(e => { if (ativo) setErroModelo(e.message) })
    return () => { ativo = false }
  }, [modeloId])

  const pedidoCampos = useMemo(() => camposDoPedido(pedido, { empresasPorId: a.empresasPorId }), [pedido, a.empresasPorId])

  // ── Estado da ficha (rascunho do aparelho ou dados do servidor) ──────────
  const [estado, setEstado] = useState(null)
  const [assinatura, setAssinatura] = useState(null)       // { nome, em }
  const [salvoLocalEm, setSalvoLocalEm] = useState(null)
  const [servidorEm, setServidorEm] = useState(null)
  const sujoServidor = useRef(false)
  const carregado = useRef(null)
  const base = eo ? baseDoRascunho(eo) : null

  // Só marca como carregado quando a leitura termina: se a lista recarregar no meio
  // (tempo real, foco da janela), a leitura descartada é refeita e a ficha não fica em branco.
  useEffect(() => {
    if (!eo) return undefined
    const chave = `${eo.id}|${base}`
    if (carregado.current === chave) return undefined
    let ativo = true
    lerRascunho(eo).then(r => {
      if (!ativo || carregado.current === chave) return
      carregado.current = chave
      const doServidor = estadoDosDados(eo.dados_resultado)
      const rascunhoMaisNovo = r && (!eo.rascunho_em || r.salvoEm >= eo.rascunho_em)
      setEstado(rascunhoMaisNovo ? r.estado : doServidor)
      setAssinatura(rascunhoMaisNovo ? r.assinatura : null)
      setSalvoLocalEm(r?.salvoEm || null)
      setServidorEm(eo.rascunho_em || null)
      sujoServidor.current = !!(rascunhoMaisNovo && (!r.enviadoServidorEm || r.enviadoServidorEm < r.salvoEm))
    })
    return () => { ativo = false }
  }, [eo, base])

  const ficha = useFicha(modeloReg, estado || { entradas: {}, escolhas: {} }, pedidoCampos)

  // URL da imagem da assinatura do usuário (funciona offline depois do 1º download)
  const [urlMinha, setUrlMinha] = useState(null)
  useEffect(() => { if (executor?.assinatura_url) urlAssinatura(executor).then(setUrlMinha) }, [executor])

  // ── Salvamento automático ────────────────────────────────────────────────
  const emExecucao = eo?.status === 'em_andamento'
  const alterar = useCallback(novo => { setEstado(novo); sujoServidor.current = true }, [])

  useEffect(() => {
    if (!eo || !estado || !emExecucao) return undefined
    const t = setTimeout(() => {
      gravarRascunho(eo, { estado, assinatura }).then(() => setSalvoLocalEm(new Date().toISOString())).catch(() => {})
    }, ESPERA_RASCUNHO_LOCAL)
    return () => clearTimeout(t)
  }, [estado, assinatura, eo, emExecucao])

  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState(null)       // { tipo, texto }

  const salvarServidor = useCallback(async ({ manual = false } = {}) => {
    if (!eo || !estado || !ficha.indice || eo.status !== 'em_andamento') return
    if (!manual && !sujoServidor.current) return
    setSalvando(true)
    try {
      sujoServidor.current = false
      const r = await a.acoes.salvarRascunho(eo, ficha.dados())
      const agora = new Date().toISOString()
      await gravarRascunho(eo, { estado, assinatura, enviadoServidorEm: agora })
      setServidorEm(agora)
      if (manual) setAviso({ tipo: 'ok', texto: r.offline ? 'Salvo no aparelho. Será enviado quando a internet voltar.' : 'Rascunho salvo.' })
    } catch (e) {
      sujoServidor.current = true
      if (manual) setAviso({ tipo: 'erro', texto: e.message })
    } finally {
      setSalvando(false)
    }
  }, [eo, estado, assinatura, ficha, a.acoes])

  useEffect(() => {
    if (!emExecucao) return undefined
    const t = setInterval(() => { if (navigator.onLine) salvarServidor() }, INTERVALO_RASCUNHO_SERVIDOR)
    return () => clearInterval(t)
  }, [emExecucao, salvarServidor])

  // ── Ações ────────────────────────────────────────────────────────────────
  const [ocupado, setOcupado] = useState(false)
  const [confirmarEnvio, setConfirmarEnvio] = useState(false)
  const [fotoAberta, setFotoAberta] = useState(false)

  async function iniciar() {
    setOcupado(true)
    setAviso(null)
    try {
      const r = await a.acoes.iniciar(eo)
      setAviso({ tipo: 'ok', texto: r.offline ? 'Ensaio iniciado neste aparelho (será sincronizado).' : 'Ensaio iniciado. Pode preencher a ficha.' })
    } catch (e) {
      setAviso({ tipo: 'erro', texto: e.message })
    } finally {
      setOcupado(false)
    }
  }

  function pedirEnvio() {
    setAviso(null)
    const sit = ficha.situacao
    if (sit.invalidos.length) {
      setAviso({ tipo: 'erro', texto: `Corrija ${sit.invalidos.length} campo(s) marcados em vermelho (${sit.invalidos.slice(0, 5).join(', ')}).` })
      return
    }
    if (sit.preenchidos === 0) { setAviso({ tipo: 'erro', texto: 'A ficha está vazia.' }); return }
    if (!executor?.assinatura_url) {
      setAviso({ tipo: 'erro', texto: `${historico ? `${nomeExec} não tem` : 'Você ainda não tem'} assinatura cadastrada. Peça ao Gestor para cadastrar antes de enviar.` })
      return
    }
    if (!assinatura) {
      setAviso({ tipo: 'erro', texto: 'Assine a ficha no campo “Responsável executor” antes de enviar.' })
      return
    }
    if (historico && !dataExec) setDataExec(dataMinExec && dataMinExec <= hojeISO() ? dataMinExec : hojeISO())
    setConfirmarEnvio(true)
  }

  async function enviar() {
    setOcupado(true)
    try {
      const r = await a.acoes.enviar(eo, ficha.dados(), historico ? dataParaISO(dataExec) : assinatura.em)
      navigate('/assistente', {
        replace: true,
        state: {
          mensagem: r.offline
            ? 'Ficha guardada para envio. Assim que a internet voltar, ela vai para o laboratorista.'
            : 'Ficha enviada para revisão do laboratorista.',
        },
      })
    } catch (e) {
      setConfirmarEnvio(false)
      setAviso({ tipo: 'erro', texto: e.message })
    } finally {
      setOcupado(false)
    }
  }

  // ── Telas de exceção ─────────────────────────────────────────────────────
  if (!eo) {
    if (a.loading) return <div className={styles.carregando}><div className="spinner" /></div>
    return (
      <div className={styles.fora}>
        <p>Este ensaio não está mais na sua fila (foi enviado para revisão ou atribuído a outra pessoa).</p>
        <Link to="/assistente" className={`${ui.btn} ${ui.btnPrimario}`}>Voltar para meus ensaios</Link>
      </div>
    )
  }

  const st = STATUS_ASSISTENTE[eo.status] || { label: eo.status, tom: 'neutro' }
  const fichaCad = a.fichasPorId[eo.ficha_ensaio_id]
  const semFicha = !eo.ficha_ensaio_id
  const semModelo = !!eo.ficha_ensaio_id && !modeloId
  const sit = ficha.situacao

  return (
    <div className={styles.tela}>
      <div className={styles.topo}>
        <Link to="/assistente" className={styles.voltar}>← Meus ensaios</Link>
        <div className={styles.titulos}>
          <h1>{eo.nome_ensaio || 'Ensaio'}</h1>
          <span>
            {numeroOS(pedido) || numeroPE(pedido)}
            {modeloReg ? ` · ${modeloReg.codigo} ${modeloReg.versao}` : fichaCad ? ` · ${fichaCad.codigo}` : ''}
          </span>
        </div>
        <Selo tom={st.tom}>{st.label}</Selo>
      </div>

      {eo.status === 'devolvido' && (
        <div className={`${ui.aviso} ${ui.avisoErro}`}>
          ↩ Devolvido pelo laboratorista{eo.devolvido_em ? ` em ${dataHora(eo.devolvido_em)}` : ''}: <strong>&nbsp;{eo.devolvido_motivo || 'sem motivo informado'}</strong>
        </div>
      )}

      {historico && (
        <div className={`${ui.aviso} ${ui.avisoInfo}`}>
          📜 <span><strong>Lançamento histórico.</strong> Você preenche e assina em nome de <strong>{executor?.nome || 'executor não definido'}</strong>.
          A data da execução é informada no envio.</span>
        </div>
      )}

      {pedido && <DadosPedido pedido={pedido} eo={eo} ctx={a} aberto={eo.status !== 'em_andamento'} />}

      {semFicha && <div className={`${ui.aviso} ${ui.avisoAlerta}`}>O laboratorista ainda não definiu a ficha deste ensaio. Avise-o para poder começar.</div>}
      {semModelo && (
        <div className={`${ui.aviso} ${ui.avisoAlerta}`}>
          A ficha {fichaCad?.codigo || ''} ainda não está disponível no sistema online. Avise o laboratorista.
        </div>
      )}
      {erroModelo && <div className={`${ui.aviso} ${ui.avisoAlerta}`}>{erroModelo}</div>}
      {aviso && (
        <div className={`${ui.aviso} ${aviso.tipo === 'erro' ? ui.avisoErro : ui.avisoOk}`} role="status">{aviso.texto}</div>
      )}

      {!emExecucao && modeloReg && (
        <div className={styles.iniciarCaixa}>
          <div>
            <strong>{eo.status === 'devolvido' ? 'Corrigir a ficha' : 'Pronto para começar?'}</strong>
            <span>
              {eo.status === 'devolvido'
                ? 'A ficha abre com os dados que você enviou. Corrija o que o laboratorista pediu, assine de novo e reenvie.'
                : 'Ao iniciar, o ensaio passa para “Em execução” e o laboratorista acompanha o andamento.'}
            </span>
          </div>
          <button className={`${ui.btn} ${ui.btnAcao}`} onClick={iniciar} disabled={ocupado}>
            {ocupado ? 'Iniciando…' : eo.status === 'devolvido' ? 'Iniciar correção' : '▶ Iniciar ensaio'}
          </button>
        </div>
      )}

      {modeloReg && ficha.indice && estado && (
        <div className={`${styles.area} ${fotoAberta ? styles.comFoto : ''}`}>
          <div className={styles.areaFicha}>
            <FichaEnsaio
              indice={ficha.indice}
              motor={ficha.motor}
              estado={estado}
              onEstado={alterar}
              modo={emExecucao ? 'preencher' : 'leitura'}
              assinaturas={{ executor: assinatura ? { ...assinatura, url: urlMinha } : null }}
              podeAssinar={{ executor: emExecucao && !!executor?.assinatura_url }}
              motivoSemAssinatura={!executor?.assinatura_url
                ? `${historico ? `${nomeExec} não tem` : 'Você ainda não tem'} assinatura cadastrada. Peça ao Gestor para cadastrar.`
                : !emExecucao ? 'Inicie o ensaio para preencher e assinar.' : undefined}
              usuarioNome={executor?.nome}
              onAssinar={() => { setAssinatura({ nome: executor?.nome, em: new Date().toISOString() }); sujoServidor.current = true }}
              onRemoverAssinatura={() => { setAssinatura(null); sujoServidor.current = true }}
              idBase={`eo-${eo.id.slice(0, 8)}`}
            />
          </div>
          {fotoAberta && <FotoApoio ensaioOsId={eo.id} onFechar={() => setFotoAberta(false)} />}
        </div>
      )}

      {emExecucao && modeloReg && estado && (
        <div className={styles.barraAcoes}>
          <div className={styles.situacao}>
            <span><strong>{sit?.preenchidos || 0}</strong> de {sit?.total || 0} campos</span>
            <span>{assinatura ? '✍️ Assinada' : 'Sem assinatura'}</span>
            <span className={styles.salvo}>
              {salvando ? 'Salvando…' : servidorEm ? `Salvo ${hora(servidorEm)}` : salvoLocalEm ? `No aparelho ${hora(salvoLocalEm)}` : ''}
            </span>
          </div>
          <div className={styles.botoes}>
            <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={() => setFotoAberta(v => !v)}>
              📷 {fotoAberta ? 'Ocultar foto' : 'Foto de apoio'}
            </button>
            <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={() => salvarServidor({ manual: true })} disabled={salvando}>
              Salvar
            </button>
            <button className={`${ui.btn} ${ui.btnAcao}`} onClick={pedirEnvio} disabled={ocupado}>
              Enviar para revisão
            </button>
          </div>
        </div>
      )}

      {confirmarEnvio && (
        <Modal
          titulo="Enviar para revisão"
          subtitulo={`${eo.nome_ensaio} · ${numeroOS(pedido) || numeroPE(pedido)}`}
          onFechar={() => !ocupado && setConfirmarEnvio(false)}
          rodape={(
            <>
              <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={() => setConfirmarEnvio(false)} disabled={ocupado}>Revisar mais</button>
              <button className={`${ui.btn} ${ui.btnAcao}`} onClick={enviar} disabled={ocupado || !dataExecOk}>{ocupado ? 'Enviando…' : 'Enviar'}</button>
            </>
          )}
        >
          <div className={ui.pilha}>
            <p><strong>{sit.preenchidos}</strong> de {sit.total} campos preenchidos · assinada por {assinatura?.nome}.</p>
            {historico && (
              <label className={ui.campo}>
                <span className={ui.rotulo}>📜 Data da execução (lançamento histórico) <span className={ui.obrigatorio}>*</span></span>
                <input type="date" className={ui.input} value={dataExec} min={dataMinExec || undefined} max={hojeISO()}
                  onChange={e => setDataExec(e.target.value)} />
                {!dataExecOk && <span className={ui.ajuda} style={{ color: '#b91c1c' }}>Informe uma data entre a atribuição e hoje.</span>}
              </label>
            )}
            <p>Depois de enviar, este ensaio sai da sua lista e vai para o laboratorista revisar.
              Você só volta a ter acesso se ele devolver para correção.</p>
            <p className={ui.ajuda}>As fotos de apoio deste ensaio serão apagadas do aparelho.</p>
          </div>
        </Modal>
      )}
    </div>
  )
}
