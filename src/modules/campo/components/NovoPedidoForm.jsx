import { useState } from 'react'
import { useCampo } from '../useCampo'
import { TIPOS_AMOSTRA, SUBCATEGORIAS } from '../constants'
import EnsaiosSelector from './EnsaiosSelector'
import CampoSolos    from './subcategorias/CampoSolos'
import CampoAsfalto  from './subcategorias/CampoAsfalto'
import CampoConcreto from './subcategorias/CampoConcreto'
import CampoEspecial from './subcategorias/CampoEspecial'
import Toast from '../../../components/ui/Toast'
import styles from './NovoPedidoForm.module.css'

const STEPS = ['Dados Gerais', 'Material', 'Ensaios', 'Amostra']

export default function NovoPedidoForm({ onVoltar, pedidoInicial = null, modoCorrecao = false }) {
  const { empresas, ensaios, enviarPedido, corrigirPedido } = useCampo()
  const [step, setStep]           = useState(0)
  const [toast, setToast]         = useState(null)
  const [enviando, setEnviando]   = useState(false)

  const [geral, setGeral] = useState({
    empresa_id: pedidoInicial?.empresa_id || '',
    lote:        pedidoInicial?.lote       || '',
    observacoes: pedidoInicial?.observacoes || '',
  })
  const [tipoAmostra,   setTipoAmostra]   = useState(pedidoInicial?.material      || '')
  const [subcategoria,  setSubcategoria]  = useState(pedidoInicial?.sub_tipo      || '')
  const [ensaiosSel,    setEnsaiosSel]    = useState(pedidoInicial?.ensaios_ids   || [])
  const [amostras, setAmostras] = useState(pedidoInicial?.dados_amostra || [{}])
  const [amIdx, setAmIdx] = useState(0)

  // Lote da empresa selecionada (preenche automaticamente se disponível)
  const empresaSel = empresas.find(e => e.id === geral.empresa_id)

  const subcatOpcoes = SUBCATEGORIAS[tipoAmostra] || []

  // ── Navegação ──────────────────────────────────────────────────────────────
  function canNext() {
    if (step === 0) return geral.empresa_id && geral.lote
    if (step === 1) return tipoAmostra && (subcatOpcoes.length === 0 || subcategoria)
    if (step === 2) return ensaiosSel.length > 0
    return true
  }

  // ── Envio ──────────────────────────────────────────────────────────────────
  async function handleEnviar() {
    setEnviando(true)
    try {
      let resultado

      if (modoCorrecao && pedidoInicial) {
        // Bug 4 fix: corrigir = UPDATE no pedido original, não INSERT
        resultado = await corrigirPedido(pedidoInicial.id, {
          empresa_id:    geral.empresa_id,
          lote:          geral.lote,
          observacoes:   geral.observacoes,
          material:      tipoAmostra,
          sub_tipo:      subcategoria,
          ensaios_ids:   ensaiosSel,
          dados_amostra: amostras,   // Bug 2 fix: nome correto no banco
        })
      } else {
        resultado = await enviarPedido({
          empresa_id:    geral.empresa_id,
          lote:          geral.lote,          // Bug 1 fix: lote obrigatório
          observacoes:   geral.observacoes,
          material:      tipoAmostra,          // Bug 2 fix: só material, sem tipo_amostra duplicado
          sub_tipo:      subcategoria,
          ensaios_ids:   ensaiosSel,
          dados_amostra: amostras,             // Bug 2 fix: nome correto no banco
          // solicitante_id é adicionado no hook (perfil.id)
        })
      }

      // Bug 3: exibir numero_pe se retornado
      const pe = resultado?.data?.numero_pe && resultado?.data?.ano
        ? `PE-${resultado.data.ano}-${String(resultado.data.numero_pe).padStart(4, '0')}`
        : null

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

  // ── Render ─────────────────────────────────────────────────────────────────
  function renderAmostraForm() {
    const am = amostras[amIdx] || {}
    const upd = (d) => {
      const novas = [...amostras]
      novas[amIdx] = d
      setAmostras(novas)
    }

    switch (tipoAmostra) {
      case 'solos':    return <CampoSolos    subcategoria={subcategoria} dados={am} onChange={upd} />
      case 'asfalto':  return <CampoAsfalto  subcategoria={subcategoria} dados={am} onChange={upd} />
      case 'concreto': return <CampoConcreto dados={am} onChange={upd} />
      case 'especial': return <CampoEspecial subcategoria={subcategoria} dados={am} onChange={upd} />
      default: return null
    }
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.btnBack} onClick={onVoltar}>← Voltar</button>
        <h2 className={styles.title}>{modoCorrecao ? 'Corrigir Pedido' : 'Novo Pedido'}</h2>
      </div>

      {/* Stepper */}
      <div className={styles.stepper}>
        {STEPS.map((s, i) => (
          <div key={s} className={`${styles.stepItem} ${i === step ? styles.stepActive : ''} ${i < step ? styles.stepDone : ''}`}>
            <div className={styles.stepDot}>{i < step ? '✓' : i + 1}</div>
            <span className={styles.stepLabel}>{s}</span>
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className={styles.body}>
        {step === 0 && (
          <div className={styles.stepContent}>
            <h3 className={styles.sectionTitle}>Dados Gerais</h3>

            <label className={styles.field}>
              <span className={styles.label}>Empresa *</span>
              <select
                className={styles.input}
                value={geral.empresa_id}
                onChange={e => {
                  const emp = empresas.find(x => x.id === e.target.value)
                  setGeral({ ...geral, empresa_id: e.target.value, lote: emp?.lote || '' })
                }}
              >
                <option value="">Selecione a empresa…</option>
                {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nome}{emp.rodovia ? ` · ${emp.rodovia}` : ''}</option>)}
              </select>
            </label>

            {/* Bug 1 fix: campo lote obrigatório */}
            <label className={styles.field}>
              <span className={styles.label}>Lote *</span>
              <input
                className={styles.input}
                value={geral.lote}
                onChange={e => setGeral({ ...geral, lote: e.target.value })}
                placeholder={empresaSel?.lote ? `Padrão: ${empresaSel.lote}` : 'Ex: Lote 3'}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Observações</span>
              <textarea
                className={`${styles.input} ${styles.textarea}`}
                value={geral.observacoes}
                onChange={e => setGeral({ ...geral, observacoes: e.target.value })}
                rows={3}
                placeholder="Informações adicionais…"
              />
            </label>
          </div>
        )}

        {step === 1 && (
          <div className={styles.stepContent}>
            <h3 className={styles.sectionTitle}>Tipo de Material</h3>
            <div className={styles.tipoGrid}>
              {TIPOS_AMOSTRA.map(t => (
                <button
                  key={t.value}
                  className={`${styles.tipoCard} ${tipoAmostra === t.value ? styles.tipoAtivo : ''}`}
                  onClick={() => { setTipoAmostra(t.value); setSubcategoria('') }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {subcatOpcoes.length > 0 && (
              <>
                <h3 className={`${styles.sectionTitle} ${styles.mt}`}>Subcategoria</h3>
                <div className={styles.subcatGrid}>
                  {subcatOpcoes.map(s => (
                    <button
                      key={s.value}
                      className={`${styles.subcatCard} ${subcategoria === s.value ? styles.subcatAtivo : ''}`}
                      onClick={() => setSubcategoria(s.value)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className={styles.stepContent}>
            <h3 className={styles.sectionTitle}>Ensaios Solicitados</h3>
            <EnsaiosSelector
              ensaios={ensaios}
              tipoAmostra={tipoAmostra}
              selecionados={ensaiosSel}
              onChange={setEnsaiosSel}
            />
          </div>
        )}

        {step === 3 && (
          <div className={styles.stepContent}>
            {/* Amostra tabs */}
            <div className={styles.amostrasBar}>
              {amostras.map((_, i) => (
                <button
                  key={i}
                  className={`${styles.amTab} ${amIdx === i ? styles.amTabAtivo : ''}`}
                  onClick={() => setAmIdx(i)}
                >
                  Amostra {i + 1}
                </button>
              ))}
              <button
                className={styles.amTabAdd}
                onClick={() => {
                  setAmostras(prev => [...prev, { ...prev[prev.length - 1] }])
                  setAmIdx(amostras.length)
                }}
              >
                + Amostra
              </button>
              {amostras.length > 1 && (
                <button
                  className={styles.amTabRem}
                  onClick={() => {
                    setAmostras(prev => prev.filter((_, i) => i !== amIdx))
                    setAmIdx(Math.max(0, amIdx - 1))
                  }}
                >
                  Remover
                </button>
              )}
            </div>

            <h3 className={styles.sectionTitle}>Dados da Amostra {amIdx + 1}</h3>
            {renderAmostraForm()}
          </div>
        )}
      </div>

      {/* Footer navigation */}
      <div className={styles.footer}>
        {step > 0 && (
          <button className={styles.btnSecondary} onClick={() => setStep(s => s - 1)}>← Anterior</button>
        )}
        {step < STEPS.length - 1 ? (
          <button className={styles.btnPrimary} onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
            Próximo →
          </button>
        ) : (
          <button className={styles.btnEnviar} onClick={handleEnviar} disabled={enviando}>
            {enviando ? 'Enviando…' : modoCorrecao ? '📤 Reenviar Pedido' : '📤 Enviar Pedido'}
          </button>
        )}
      </div>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}
