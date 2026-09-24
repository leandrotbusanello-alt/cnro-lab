import { useMemo, useState } from 'react'
import { useLab } from '../useLaboratorio'
import { TIPOS_AMOSTRA, SUBCATEGORIAS } from '../../campo/constants'
import CampoSolos from '../../campo/components/subcategorias/CampoSolos'
import CampoAsfalto from '../../campo/components/subcategorias/CampoAsfalto'
import CampoConcreto from '../../campo/components/subcategorias/CampoConcreto'
import CampoEspecial from '../../campo/components/subcategorias/CampoEspecial'
import EnsaiosPicker from './EnsaiosPicker'
import { normalizarAmostras, deepEqual } from '../utils'
import styles from './EditarPedido.module.css'
import amStyles from './AmostrasView.module.css'
import ui from './ui.module.css'

/**
 * Edição do pedido pelo laboratorista (antes de gerar a O.S.).
 * Só grava o que mudou. Se nada mudou, apenas fecha (o pedido não é assumido).
 */
export default function EditarPedido({ pedido, onSalvar, onCancelar, ocupado }) {
  const { empresas, ensaios } = useLab()

  const empresaInicial = pedido.empresa_id
    || empresas.find(e => e.nome === pedido.empresa)?.id
    || ''

  const original = useMemo(() => ({
    empresa_id: empresaInicial,
    lote: pedido.lote || '',
    observacoes: pedido.observacoes || '',
    material: pedido.material || '',
    sub_tipo: pedido.sub_tipo || '',
    ensaios_ids: pedido.ensaios_ids || [],
    dados_amostra: normalizarAmostras(pedido.dados_amostra).length
      ? normalizarAmostras(pedido.dados_amostra) : [{}],
  }), [pedido, empresaInicial])

  const [form, setForm] = useState(() => ({ ...original }))
  const [amIdx, setAmIdx] = useState(0)
  const [erro, setErro] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const subcats = SUBCATEGORIAS[form.material] || []

  function alterarEmpresa(id) {
    const emp = empresas.find(e => e.id === id)
    setForm(f => ({ ...f, empresa_id: id, lote: f.lote || emp?.lote || '' }))
  }

  function alterarAmostra(dados) {
    setForm(f => {
      const lista = [...f.dados_amostra]
      lista[amIdx] = dados
      return { ...f, dados_amostra: lista }
    })
  }

  function adicionarAmostra() {
    setForm(f => ({ ...f, dados_amostra: [...f.dados_amostra, { ...f.dados_amostra[f.dados_amostra.length - 1] }] }))
    setAmIdx(form.dados_amostra.length)
  }

  function removerAmostra() {
    if (form.dados_amostra.length <= 1) return
    if (!window.confirm(`Remover a amostra ${amIdx + 1}?`)) return
    setForm(f => ({ ...f, dados_amostra: f.dados_amostra.filter((_, i) => i !== amIdx) }))
    setAmIdx(i => Math.max(0, i - 1))
  }

  function salvar() {
    setErro(null)
    if (form.ensaios_ids.length === 0) { setErro('Selecione ao menos um ensaio.'); return }
    if (!form.material) { setErro('Selecione o material.'); return }
    if (subcats.length > 0 && !form.sub_tipo) { setErro('Selecione a subcategoria.'); return }

    const patch = {}
    const campos = []
    const rotulos = {
      empresa_id: 'Empresa', lote: 'Lote', observacoes: 'Observações', material: 'Material',
      sub_tipo: 'Subcategoria', ensaios_ids: 'Ensaios', dados_amostra: 'Amostras',
    }
    for (const k of Object.keys(rotulos)) {
      const novo = typeof form[k] === 'string' ? form[k].trim() : form[k]
      if (!deepEqual(novo, original[k])) {
        patch[k] = novo === '' ? null : novo
        campos.push(rotulos[k])
      }
    }
    if (campos.length === 0) { onCancelar(); return }
    onSalvar(patch, campos)
  }

  const amostra = form.dados_amostra[amIdx] || {}

  function formularioAmostra() {
    const props = { subcategoria: form.sub_tipo, dados: amostra, onChange: alterarAmostra }
    switch (form.material) {
      case 'solos':    return <CampoSolos {...props} />
      case 'asfalto':  return <CampoAsfalto {...props} />
      case 'concreto': return <CampoConcreto dados={amostra} onChange={alterarAmostra} />
      case 'especial': return <CampoEspecial {...props} />
      default:         return <p className={ui.vazio}>Selecione o material para editar as amostras.</p>
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={`${ui.aviso} ${ui.avisoInfo}`}>
        ✏️ Editando o pedido. Ao salvar alguma alteração, você passa a ser o responsável por ele.
      </div>

      <section className={ui.secao}>
        <div className={ui.secaoTitulo}>Dados do pedido</div>
        <div className={ui.grade2}>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Empresa</span>
            <select className={ui.input} value={form.empresa_id} onChange={e => alterarEmpresa(e.target.value)}>
              <option value="">{pedido.empresa ? `${pedido.empresa} (atual)` : 'Selecione…'}</option>
              {empresas.filter(e => e.ativo !== false || e.id === form.empresa_id).map(e => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>
          </label>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Lote <span className={ui.obrigatorio}>*</span></span>
            <input className={ui.input} value={form.lote} onChange={e => set('lote', e.target.value)} placeholder="Ex.: 03" />
            <span className={ui.ajuda}>Obrigatório para gerar a O.S.</span>
          </label>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Material</span>
            <select className={ui.input} value={form.material}
              onChange={e => setForm(f => ({ ...f, material: e.target.value, sub_tipo: '' }))}>
              <option value="">Selecione…</option>
              {TIPOS_AMOSTRA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              {form.material && !TIPOS_AMOSTRA.some(t => t.value === form.material) && (
                <option value={form.material}>{form.material}</option>
              )}
            </select>
          </label>
          {subcats.length > 0 && (
            <label className={ui.campo}>
              <span className={ui.rotulo}>Subcategoria</span>
              <select className={ui.input} value={form.sub_tipo} onChange={e => set('sub_tipo', e.target.value)}>
                <option value="">Selecione…</option>
                {subcats.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          )}
        </div>
        <label className={`${ui.campo} ${styles.mt}`}>
          <span className={ui.rotulo}>Observações</span>
          <textarea className={`${ui.input} ${ui.textarea}`} value={form.observacoes}
            onChange={e => set('observacoes', e.target.value)} />
        </label>
      </section>

      <section className={ui.secao}>
        <div className={ui.secaoTitulo}>Ensaios solicitados</div>
        <EnsaiosPicker ensaios={ensaios} selecionados={form.ensaios_ids} onChange={v => set('ensaios_ids', v)} />
      </section>

      <section className={ui.secao}>
        <div className={ui.secaoTitulo}>Amostras</div>
        <div className={amStyles.abas}>
          {form.dados_amostra.map((_, i) => (
            <button key={i} type="button"
              className={`${amStyles.aba} ${i === amIdx ? amStyles.abaAtiva : ''}`}
              onClick={() => setAmIdx(i)}>
              Amostra {i + 1}
            </button>
          ))}
          <button type="button" className={`${amStyles.aba} ${amStyles.adicionar}`} onClick={adicionarAmostra}>+ Amostra</button>
          {form.dados_amostra.length > 1 && (
            <button type="button" className={`${amStyles.aba} ${amStyles.remover}`} onClick={removerAmostra}>Remover</button>
          )}
        </div>
        {formularioAmostra()}
      </section>

      {erro && <div className={`${ui.aviso} ${ui.avisoErro}`}>{erro}</div>}

      <div className={styles.rodape}>
        <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={onCancelar} disabled={ocupado}>Cancelar</button>
        <button className={`${ui.btn} ${ui.btnPrimario}`} onClick={salvar} disabled={ocupado}>
          {ocupado ? 'Salvando…' : '💾 Salvar alterações'}
        </button>
      </div>
    </div>
  )
}
