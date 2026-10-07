import { useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { validadePadrao } from '../../../lib/cadastros'
import { salvarCadastro, enviarDocumentoTraco } from '../cadastrosRepo'
import ui from '../../laboratorio/components/ui.module.css'
import styles from '../CadastrosPage.module.css'

/** Cadastro / edição de traço aprovado */
export default function ModalTraco({ traco, empresas, onFechar, onSalvo }) {
  const novo = !traco
  const [f, setF] = useState(() => ({
    nome_traco: traco?.nome_traco || '',
    empresa_id: traco?.empresa_id || '',
    tipo_mistura: traco?.tipo_mistura || 'C.A.U.Q.',
    faixa_granulometrica: traco?.faixa_granulometrica || '',
    teor_betume_pct: traco?.teor_betume_pct ?? '',
    aprovado_em: traco?.aprovado_em || '',
    aprovado_por: traco?.aprovado_por || '',
    valido_ate: traco?.valido_ate || '',
    observacoes: traco?.observacoes || '',
    ativo: traco?.ativo !== false,
  }))
  const [arquivo, setArquivo] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))

  function mudarAprovacao(v) {
    // validade padrão: 6 meses depois da aprovação (pode ser alterada)
    setF(x => ({ ...x, aprovado_em: v, valido_ate: !x.valido_ate || x.valido_ate === validadePadrao(x.aprovado_em) ? validadePadrao(v) : x.valido_ate }))
  }

  async function salvar() {
    setErro(null)
    if (!f.nome_traco.trim()) { setErro('Informe o nome do traço.'); return }
    if (f.valido_ate && f.aprovado_em && f.valido_ate < f.aprovado_em) { setErro('A validade não pode ser anterior à aprovação.'); return }
    setSalvando(true)
    try {
      const dados = {
        ...f,
        id: traco?.id,
        empresa_id: f.empresa_id || null,
        teor_betume_pct: f.teor_betume_pct === '' ? null : Number(String(f.teor_betume_pct).replace(',', '.')),
        aprovado_em: f.aprovado_em || null,
        valido_ate: f.valido_ate || null,
      }
      let salvo = await salvarCadastro('tracos', dados)
      if (arquivo) {
        const caminho = await enviarDocumentoTraco(salvo.id, arquivo)
        salvo = await salvarCadastro('tracos', { id: salvo.id, documento: caminho })
      }
      onSalvo(salvo)
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const faixa = Array.isArray(traco?.faixa_trabalho) ? traco.faixa_trabalho : []

  return (
    <Modal
      titulo={novo ? 'Novo traço aprovado' : 'Editar traço'}
      subtitulo={novo ? 'Validado pelos coordenadores · validade padrão de 6 meses' : traco.nome_traco}
      largura="lg"
      onFechar={onFechar}
      rodape={(
        <>
          <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className={`${ui.btn} ${ui.btnPrimario}`} onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : '💾 Salvar'}</button>
        </>
      )}
    >
      <div className={ui.pilha}>
        <label className={ui.campo}>
          <span className={ui.rotulo}>Nome do traço <span className={ui.obrigatorio}>*</span></span>
          <input className={ui.input} value={f.nome_traco} onChange={e => set('nome_traco', e.target.value)}
            placeholder='Ex.: CONSÓRCIO BR163 - GUAXE · FAIXA "C" DNIT 031/2024 CAP 60-85' />
        </label>
        <div className={ui.grade2}>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Empresa</span>
            <select className={ui.input} value={f.empresa_id} onChange={e => set('empresa_id', e.target.value)}>
              <option value="">Sem empresa (aparece para todas)</option>
              {empresas.filter(e => e.ativo !== false || e.id === f.empresa_id).map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </label>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Tipo de mistura</span>
            <input className={ui.input} value={f.tipo_mistura} onChange={e => set('tipo_mistura', e.target.value)} />
          </label>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Faixa granulométrica</span>
            <input className={ui.input} value={f.faixa_granulometrica} onChange={e => set('faixa_granulometrica', e.target.value)} placeholder="Ex.: Faixa C" />
          </label>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Teor de ligante (%)</span>
            <input className={ui.input} inputMode="decimal" value={f.teor_betume_pct} onChange={e => set('teor_betume_pct', e.target.value)} />
          </label>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Data da aprovação</span>
            <input type="date" className={ui.input} value={f.aprovado_em} onChange={e => mudarAprovacao(e.target.value)} />
          </label>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Coordenador que validou</span>
            <input className={ui.input} value={f.aprovado_por} onChange={e => set('aprovado_por', e.target.value)} />
          </label>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Válido até</span>
            <input type="date" className={ui.input} value={f.valido_ate} min={f.aprovado_em || undefined} onChange={e => set('valido_ate', e.target.value)} />
            <span className={ui.ajuda}>Padrão: 6 meses após a aprovação.</span>
          </label>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Documento do traço (PDF)</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className={ui.input} onChange={e => setArquivo(e.target.files?.[0] || null)} />
            <span className={ui.ajuda}>{traco?.documento ? 'Já há um documento — escolha outro para substituir.' : 'Opcional. Fica visível só para a equipe do laboratório.'}</span>
          </label>
        </div>
        <label className={ui.campo}>
          <span className={ui.rotulo}>Observações</span>
          <textarea className={`${ui.input} ${ui.textarea}`} value={f.observacoes} onChange={e => set('observacoes', e.target.value)} />
        </label>
        <label className={ui.campo} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={f.ativo} onChange={e => set('ativo', e.target.checked)} />
          <span>Ativo (aparece nas listas do Campo)</span>
        </label>

        {faixa.length > 0 && (
          <div>
            <span className={ui.rotulo}>Faixa de trabalho (% passante)</span>
            <table className={styles.faixa}>
              <thead><tr><th>Peneira (mm)</th>{faixa.map(l => <th key={l.peneira_mm}>{String(l.peneira_mm).replace('.', ',')}</th>)}</tr></thead>
              <tbody>
                <tr><th>Mín.</th>{faixa.map(l => <td key={l.peneira_mm}>{String(l.min).replace('.', ',')}</td>)}</tr>
                <tr><th>Máx.</th>{faixa.map(l => <td key={l.peneira_mm}>{String(l.max).replace('.', ',')}</td>)}</tr>
              </tbody>
            </table>
          </div>
        )}

        {erro && <div className={`${ui.aviso} ${ui.avisoErro}`}>{erro}</div>}
      </div>
    </Modal>
  )
}
