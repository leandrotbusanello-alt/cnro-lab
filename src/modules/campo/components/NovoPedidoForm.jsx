import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCampo } from '../useCampo'
import { useAuthStore } from '../../../store/authStore'
import { ehDev, dataParaISO, laboratoristasHistorico, rotuloUsuario } from '../../../lib/historico'
import { hojeISO } from '../../laboratorio/utils'
import { TIPOS_SOLICITACAO, TIPOS_AMOSTRA, SUBCATEGORIAS } from '../constants'
import EnsaiosSelector from './EnsaiosSelector'
import CampoSolos    from './subcategorias/CampoSolos'
import CampoAsfalto  from './subcategorias/CampoAsfalto'
import CampoConcreto from './subcategorias/CampoConcreto'
import CampoEspecial from './subcategorias/CampoEspecial'
import Toast from '../../../components/ui/Toast'
import styles from './NovoPedidoForm.module.css'
import { formatarPE, MAX_SEQUENCIAL } from '../../../lib/numeracao'

// Safely parse dados_amostra which may be a string (JSON) or already an array
function parseDadosAmostra(dados) {
  if (!dados) return null
  if (Array.isArray(dados)) return dados
  if (typeof dados === 'string') {
    try { return JSON.parse(dados) } catch { return null }
  }
  return null
}

// Informações Gerais → nome do campo gravado em cada amostra (o que o Laboratório lê)
const CAMPOS_GERAIS = {
  trecho:         'trecho',
  estaca_inicial: 'estaca_inicial',
  estaca_final:   'estaca_final',
  pista:          'pista',
  data_coleta:    'data_coleta',
  responsavel:    'responsavel_coleta',
}

export default function NovoPedidoForm({ onVoltar, pedidoInicial = null, modoCorrecao = false }) {
  const { empresas, ensaios, usuarios, enviarPedido, corrigirPedido, uploadCertificado } = useCampo()
  const { perfil } = useAuthStore()
  const navigate = useNavigate()
  const [toast, setToast]       = useState(null)
  const [enviando, setEnviando] = useState(false)

  // ── Lançamento histórico (somente DEV — migração 14) ──────────────────────
  // Pedido antigo (papel): em nome de quem solicitou, com a data e o número reais.
  const podeHistorico = ehDev(perfil) && !modoCorrecao
  const [hist, setHist] = useState({ ativo: false, numero: '', data: '', solicitante_id: '', laboratorista_id: '' })
  const histNumeroOk = !hist.numero || (/^\d{1,5}$/.test(hist.numero) && Number(hist.numero) >= 1 && Number(hist.numero) <= MAX_SEQUENCIAL)

  // Safe parse of dados_amostra from pedidoInicial (may be JSON string from DB)
  const dadosAmostraInit = parseDadosAmostra(pedidoInicial?.dados_amostra)

  // ── Seção 1: Empresa + Tipo de Solicitação ────────────────────────────────
  const [empresaId, setEmpresaId]             = useState(pedidoInicial?.empresa_id || '')
  const [tipoSolicitacao, setTipoSolicitacao] = useState(pedidoInicial?.tipo_solicitacao || 'rotina')

  // ── Seção 2: Especificação (FR-IMOB-04) → pedidos_ensaio.especificacoes ─
  const [especificacoes, setEspecificacoes] = useState(pedidoInicial?.especificacoes || [])
  // ── Seção 6: Detalhar Ensaios → pedidos_ensaio.ensaios_ids (ids do catálogo) ─
  const [ensaiosSel, setEnsaiosSel] = useState(pedidoInicial?.ensaios_ids || [])

  // ── Seção 3: Tipo de Amostra + Subcategoria ───────────────────────────────
  const [tipoAmostra,  setTipoAmostra]  = useState(pedidoInicial?.material || '')
  const [subcategoria, setSubcategoria] = useState(pedidoInicial?.sub_tipo     || '')

  // ── Seção 4: Informações Gerais (preenchidas uma vez) ─────────────────────
  const [infoGeral, setInfoGeral] = useState(
    dadosAmostraInit?.[0]?.info_geral ? { ...dadosAmostraInit[0].info_geral, lote: pedidoInicial?.lote || '', observacoes: pedidoInicial?.observacoes || '' } : {
      lote:           pedidoInicial?.lote        || '',
      trecho:         '',
      estaca_inicial: '',
      estaca_final:   '',
      pista:          '',
      data_coleta:    '',
      responsavel:    '',
      observacoes:    pedidoInicial?.observacoes || '',
    }
  )

  // ── Seção 5: Amostras (com herança de dados) ──────────────────────────────
  // Na correção, cada amostra volta sem os campos das Informações Gerais (que são reaplicados no envio)
  const [amostras, setAmostras] = useState(
    dadosAmostraInit?.map(a => {
      const { info_geral: ig, ...resto } = a
      if (!ig) return { ...resto }
      const limpa = { ...resto }
      for (const [k, campo] of Object.entries(CAMPOS_GERAIS)) {
        if (limpa[campo] !== undefined && limpa[campo] === ig[k]) delete limpa[campo]
      }
      return limpa
    }) || [{}]
  )
  const [amIdx, setAmIdx] = useState(0)
  const [certificadoFile, setCertificadoFile] = useState(null)

  const empresaSel   = empresas.find(e => e.id === empresaId)
  const subcatOpcoes = SUBCATEGORIAS[tipoAmostra] || []

  // ── Lote automático da empresa ─────────────────────────────────────────────
  function handleEmpresaChange(id) {
    const emp = empresas.find(e => e.id === id)
    setEmpresaId(id)
    if (emp?.lote && !infoGeral.lote) {
      setInfoGeral(g => ({ ...g, lote: emp.lote }))
    }
  }

  // ── Herança de dados entre amostras ───────────────────────────────────────
  function adicionarAmostra() {
    const ultima = amostras[amostras.length - 1] || {}
    const herdados = {
      camada:          ultima.camada          || '',
      pista:           ultima.pista           || '',
      faixa:           ultima.faixa           || '',
      lado:            ultima.lado            || '',
      proctor:         ultima.proctor         || '',
      gc_minimo:       ultima.gc_minimo       || '',
      lancamento:      ultima.lancamento      || '',
      tipo_concreto:   ultima.tipo_concreto   || '',
      resistencia_fck: ultima.resistencia_fck || '',
      tipo_mistura:    ultima.tipo_mistura    || '',
      ligante:         ultima.ligante         || '',
      data_aplicacao:  ultima.data_aplicacao  || '',
    }
    setAmostras(prev => [...prev, herdados])
    setAmIdx(amostras.length)
  }

  function removerAmostra(idx) {
    if (amostras.length === 1) return
    const novas = amostras.filter((_, i) => i !== idx)
    setAmostras(novas)
    setAmIdx(Math.max(0, idx - 1))
  }

  function atualizarAmostra(dados) {
    setAmostras(prev => {
      const novas = [...prev]
      novas[amIdx] = dados
      return novas
    })
  }

  // ── Validação básica ───────────────────────────────────────────────────────
  function validar() {
    if (!empresaId)                            return 'Selecione a empresa.'
    if (!infoGeral.lote)                       return 'Informe o lote.'
    if (!tipoAmostra)                          return 'Selecione o tipo de amostra.'
    if (subcatOpcoes.length && !subcategoria)  return 'Selecione a subcategoria.'
    if (ensaiosSel.length === 0)               return 'Selecione ao menos um ensaio em "Detalhar Ensaios".'
    if (hist.ativo) {
      if (!hist.data || hist.data > hojeISO())  return 'Lançamento histórico: informe a data da solicitação.'
      if (!hist.solicitante_id)                 return 'Lançamento histórico: selecione o solicitante.'
      if (!hist.laboratorista_id)               return 'Lançamento histórico: selecione o laboratorista.'
      if (!histNumeroOk)                        return 'Lançamento histórico: número do PE inválido (1 a 99999).'
    }
    return null
  }

  // ── Envio ──────────────────────────────────────────────────────────────────
  async function handleEnviar() {
    const erro = validar()
    if (erro) { setToast({ type: 'error', message: erro }); return }

    setEnviando(true)
    try {
      // Certificado do ligante: arquivo privado no Supabase (precisa de internet)
      let certificado = null
      if (certificadoFile) certificado = await uploadCertificado(certificadoFile)

      // Informações Gerais entram em cada amostra com os nomes que o Laboratório
      // e as fichas FR-IMOB-04/05 já leem (estaca_inicial, pista…). O que a amostra
      // preencheu vale mais que a informação geral. `info_geral` guarda o original
      // para reabrir o formulário na correção.
      const geral = {}
      for (const [k, campo] of Object.entries(CAMPOS_GERAIS)) {
        if (String(infoGeral[k] ?? '').trim() !== '') geral[campo] = infoGeral[k]
      }
      const { lote: _l, observacoes: _o, ...infoGeralAmostra } = infoGeral // eslint-disable-line no-unused-vars
      const dadosAmostra = amostras.map(am => {
        const propria = Object.fromEntries(Object.entries(am).filter(([, v]) => v !== '' && v !== null && v !== undefined))
        return {
          ...geral,
          ...propria,
          ...(certificado ? { certificado } : {}),
          info_geral: infoGeralAmostra,
        }
      })

      const idsCatalogo = new Set((ensaios || []).map(e => e.id))
      const payload = {
        empresa_id:       empresaId,
        lote:             infoGeral.lote,
        tipo_solicitacao: tipoSolicitacao,
        observacoes:      infoGeral.observacoes,
        material:         tipoAmostra,
        sub_tipo:         subcategoria,
        ensaios_ids:      ensaiosSel.filter(id => idsCatalogo.has(id)),
        especificacoes,
        dados_amostra:    dadosAmostra,
      }

      let resultado
      if (modoCorrecao && pedidoInicial) {
        resultado = await corrigirPedido(pedidoInicial.id, payload)
      } else {
        resultado = await enviarPedido({
          ...payload,
          historico: hist.ativo ? {
            solicitante_id:   hist.solicitante_id,
            laboratorista_id: hist.laboratorista_id,
            created_at:       dataParaISO(hist.data),
            sequencial:       hist.numero ? Number(hist.numero) : null,
          } : null,
        })
      }

      const pe = resultado?.data?.numero_pe && resultado?.data?.ano
        ? formatarPE(resultado.data.ano, resultado.data.numero_pe)
        : null

      if (resultado.historico) {
        // segue direto para o Laboratório, onde o lançamento continua (O.S., atribuição…)
        setToast({ type: 'success', message: `Lançamento histórico ${pe || ''} criado. Abrindo no Laboratório…` })
        setTimeout(() => navigate(`/laboratorio/${encodeURIComponent(resultado.data.id)}`), 1200)
        return
      }

      setToast({
        type: resultado.offline ? 'warning' : 'success',
        message: resultado.offline
          ? 'Pedido salvo localmente. Será enviado quando houver conexão.'
          : pe
            ? `Pedido ${pe} enviado com sucesso!`
            : 'Pedido enviado com sucesso!',
      })
      setTimeout(onVoltar, 1800)
    } catch (e) {
      setToast({ type: 'error', message: e.message || 'Erro ao enviar pedido.' })
    } finally {
      setEnviando(false)
    }
  }

  // ── Renderiza form da amostra por tipo ────────────────────────────────────
  function renderAmostraForm() {
    const am = amostras[amIdx] || {}
    const props = {
      subcategoria,
      dados: am,
      onChange: atualizarAmostra,
      onCertificadoChange: setCertificadoFile,
    }
    switch (tipoAmostra) {
      case 'solos':    return <CampoSolos    {...props} />
      case 'asfalto':  return <CampoAsfalto  {...props} />
      case 'concreto': return <CampoConcreto {...props} />
      case 'especial': return <CampoEspecial {...props} />
      default: return null
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <button className={styles.btnBack} onClick={onVoltar}>
            <span className={styles.backIcon}>‹</span>
            <span>Voltar</span>
          </button>
          <div className={styles.headerTitle}>
            <h2>{modoCorrecao ? 'Corrigir Pedido' : 'Novo Pedido'}</h2>
            {empresaSel && <span className={styles.headerEmpresa}>{empresaSel.nome}</span>}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            SEÇÃO 1 — Empresa e Tipo de Solicitação
        ═══════════════════════════════════════════════════════════ */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>1</div>
            <h3 className={styles.sectionTitle}>Empresa e Solicitação</h3>
          </div>

          {podeHistorico && (
            <div className={styles.historicoBox}>
              <label className={styles.historicoToggle}>
                <input type="checkbox" checked={hist.ativo} onChange={e => setHist({ ...hist, ativo: e.target.checked })} />
                <span>
                  <strong>📜 Lançamento histórico (somente DEV)</strong>
                  <small>Pedido antigo, já feito em papel. Fica em nome de quem solicitou, com a data e o número reais.
                    As próximas etapas (O.S., execução, aprovação) serão feitas por você em nome das pessoas escolhidas.</small>
                </span>
              </label>
              {hist.ativo && (
                <>
                  <div className={styles.grid2}>
                    <label className={styles.field}>
                      <span className={styles.label}>Data da solicitação <span className={styles.req}>*</span></span>
                      <input type="date" className={styles.input} value={hist.data} max={hojeISO()}
                        onChange={e => setHist({ ...hist, data: e.target.value })} />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>Nº do PE (papel)</span>
                      <input className={styles.input} inputMode="numeric" value={hist.numero} placeholder="Ex.: 0350"
                        onChange={e => setHist({ ...hist, numero: e.target.value.replace(/\D/g, '').slice(0, 5) })} />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>Solicitante <span className={styles.req}>*</span></span>
                      <select className={styles.input} value={hist.solicitante_id}
                        onChange={e => setHist({ ...hist, solicitante_id: e.target.value })}>
                        <option value="">Selecione…</option>
                        {usuarios.map(u => <option key={u.id} value={u.id}>{rotuloUsuario(u)}</option>)}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span className={styles.label}>Laboratorista responsável <span className={styles.req}>*</span></span>
                      <select className={styles.input} value={hist.laboratorista_id}
                        onChange={e => setHist({ ...hist, laboratorista_id: e.target.value })}>
                        <option value="">Selecione…</option>
                        {laboratoristasHistorico(usuarios).map(u => <option key={u.id} value={u.id}>{rotuloUsuario(u)}</option>)}
                      </select>
                    </label>
                  </div>
                  <span className={styles.historicoAjuda}>
                    {!histNumeroOk
                      ? 'Número inválido (1 a 99999).'
                      : hist.numero
                        ? `Será o ${formatarPE(hist.data ? hist.data.slice(0, 4) : 'AAAA', hist.numero)}. Se for maior que o último número usado, os próximos pedidos do Campo continuam a partir dele.`
                        : 'Sem número: o sistema usa o próximo número automático.'}
                  </span>
                </>
              )}
            </div>
          )}

          <div className={styles.grid2}>
            <label className={styles.field}>
              <span className={styles.label}>Empresa <span className={styles.req}>*</span></span>
              <select
                className={styles.input}
                value={empresaId}
                onChange={e => handleEmpresaChange(e.target.value)}
              >
                <option value="">Selecione a empresa…</option>
                {empresas.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.nome}</option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Lote <span className={styles.req}>*</span></span>
              <input
                className={styles.input}
                value={infoGeral.lote}
                onChange={e => setInfoGeral(g => ({ ...g, lote: e.target.value }))}
                placeholder={empresaSel?.lote ? `Padrão: ${empresaSel.lote}` : 'Ex: Lote 3'}
              />
            </label>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Tipo de Solicitação <span className={styles.req}>*</span></label>
            <div className={styles.radioGroup}>
              {TIPOS_SOLICITACAO.map(t => (
                <label key={t.value} className={`${styles.radioCard} ${tipoSolicitacao === t.value ? styles.radioAtivo : ''}`}>
                  <input
                    type="radio"
                    name="tipoSolicitacao"
                    value={t.value}
                    checked={tipoSolicitacao === t.value}
                    onChange={() => setTipoSolicitacao(t.value)}
                  />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
          </div>

          {tipoSolicitacao === 'especial' && (
            <div className={styles.fieldGroup}>
              <div className={styles.infoBox}>
                <span className={styles.infoIcon}>📋</span>
                <span>Para ensaios especiais, a equipe do laboratório se deslocará ao campo. Informe detalhes do local e data desejada nas observações.</span>
              </div>
            </div>
          )}
        </section>

        {/* ══════════════════════════════════════════════════════════
            SEÇÃO 2 — Especificação (FR-IMOB-04)
            Aparece sempre, independente do tipo de amostra
        ═══════════════════════════════════════════════════════════ */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>2</div>
            <h3 className={styles.sectionTitle}>Especificação</h3>
            <span className={styles.sectionSub}>Conforme FR-IMOB-04</span>
          </div>
          <EnsaiosSelector
            modo="especificacao"
            tipoAmostra={tipoAmostra}
            selecionados={especificacoes}
            onChange={setEspecificacoes}
          />
        </section>

        {/* ══════════════════════════════════════════════════════════
            SEÇÃO 3 — Tipo de Amostra e Subcategoria
        ═══════════════════════════════════════════════════════════ */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>3</div>
            <h3 className={styles.sectionTitle}>Tipo de Amostra</h3>
          </div>

          <div className={styles.tipoGrid}>
            {TIPOS_AMOSTRA.map(t => (
              <button
                key={t.value}
                type="button"
                className={`${styles.tipoCard} ${tipoAmostra === t.value ? styles.tipoAtivo : ''}`}
                onClick={() => { setTipoAmostra(t.value); setSubcategoria('') }}
              >
                {t.icone} {t.label}
              </button>
            ))}
          </div>

          {tipoAmostra && subcatOpcoes.length > 0 && (
            <div className={styles.fieldGroup} style={{ marginTop: '1rem' }}>
              <label className={styles.fieldLabel}>Subcategoria <span className={styles.req}>*</span></label>
              <div className={styles.subcatGrid}>
                {subcatOpcoes.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    className={`${styles.subcatCard} ${subcategoria === s.value ? styles.subcatAtivo : ''}`}
                    onClick={() => setSubcategoria(s.value)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ══════════════════════════════════════════════════════════
            SEÇÃO 4 — Informações Gerais (preenchidas uma vez)
        ═══════════════════════════════════════════════════════════ */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>4</div>
            <h3 className={styles.sectionTitle}>Informações Gerais</h3>
            <span className={styles.sectionSub}>Válidas para todas as amostras</span>
          </div>

          <div className={styles.grid2}>
            <label className={styles.field}>
              <span className={styles.label}>Trecho / Segmento</span>
              <input
                className={styles.input}
                value={infoGeral.trecho}
                onChange={e => setInfoGeral(g => ({ ...g, trecho: e.target.value }))}
                placeholder="Ex: Km 12+500 ao Km 15+000"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Estaca Inicial</span>
              <input
                className={styles.input}
                value={infoGeral.estaca_inicial}
                onChange={e => setInfoGeral(g => ({ ...g, estaca_inicial: e.target.value }))}
                placeholder="Ex: 250+00"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Estaca Final</span>
              <input
                className={styles.input}
                value={infoGeral.estaca_final}
                onChange={e => setInfoGeral(g => ({ ...g, estaca_final: e.target.value }))}
                placeholder="Ex: 300+00"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Pista</span>
              <input
                className={styles.input}
                value={infoGeral.pista}
                onChange={e => setInfoGeral(g => ({ ...g, pista: e.target.value }))}
                placeholder="Ex: Norte, Sul…"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Data da Coleta</span>
              <input
                type="date"
                className={styles.input}
                value={infoGeral.data_coleta}
                onChange={e => setInfoGeral(g => ({ ...g, data_coleta: e.target.value }))}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Responsável pela Coleta</span>
              <input
                className={styles.input}
                value={infoGeral.responsavel}
                onChange={e => setInfoGeral(g => ({ ...g, responsavel: e.target.value }))}
                placeholder="Nome do responsável"
              />
            </label>
          </div>

          <label className={styles.field} style={{ marginTop: '0.5rem' }}>
            <span className={styles.label}>Observações</span>
            <textarea
              className={`${styles.input} ${styles.textarea}`}
              value={infoGeral.observacoes}
              onChange={e => setInfoGeral(g => ({ ...g, observacoes: e.target.value }))}
              rows={3}
              placeholder="Informações adicionais, local de retirada, condições da coleta…"
            />
          </label>
        </section>

        {/* ══════════════════════════════════════════════════════════
            SEÇÃO 5 — Cadastro de Amostras
        ═══════════════════════════════════════════════════════════ */}
        {tipoAmostra && (
          <section className={styles.section}>

            <div className={styles.sectionHeader}>
              <div className={styles.sectionNum}>5</div>
              <h3 className={styles.sectionTitle}>Amostras</h3>
              <span className={styles.sectionSub}>
                {amostras.length} amostra{amostras.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Tabs das amostras */}
            <div className={styles.amostrasBar}>
              <div className={styles.amTabs}>
                {amostras.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`${styles.amTab} ${amIdx === i ? styles.amTabAtivo : ''}`}
                    onClick={() => setAmIdx(i)}
                  >
                    Amostra {i + 1}
                  </button>
                ))}
              </div>
              <div className={styles.amActions}>
                <button type="button" className={styles.btnAddAmostra} onClick={adicionarAmostra}>
                  + Nova amostra
                </button>
                {amostras.length > 1 && (
                  <button type="button" className={styles.btnRemAmostra} onClick={() => removerAmostra(amIdx)}>
                    Remover
                  </button>
                )}
              </div>
            </div>

            {amostras.length > 1 && (
              <div className={styles.herancaNote}>
                <span className={styles.herancaIcon}>♻️</span>
                <span>Os campos comuns foram herdados da amostra anterior. Ajuste apenas o que for diferente.</span>
              </div>
            )}

            <div className={styles.amostrasContent}>
              {renderAmostraForm()}
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════════════════════════
            SEÇÃO 6 — Detalhar Ensaios (por tipo de material)
            Aparece após escolha do tipo de amostra, antes de enviar
        ═══════════════════════════════════════════════════════════ */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>6</div>
            <h3 className={styles.sectionTitle}>Detalhar Ensaios</h3>
            <span className={styles.sectionSub}>Por tipo de material</span>
          </div>
          <EnsaiosSelector
            modo="detalhar"
            tipoAmostra={tipoAmostra}
            selecionados={ensaiosSel}
            onChange={setEnsaiosSel}
            catalogo={ensaios}
          />
        </section>

        {/* ── Botão Enviar ── */}
        <div className={styles.formFooter}>
          <button
            type="button"
            className={styles.btnEnviar}
            onClick={handleEnviar}
            disabled={enviando}
          >
            {enviando
              ? <span className={styles.spinner}></span>
              : '📤'}
            {enviando
              ? 'Enviando…'
              : modoCorrecao ? 'Reenviar Pedido' : 'Enviar Pedido'}
          </button>
        </div>

        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      </div>
    </div>
  )
}
