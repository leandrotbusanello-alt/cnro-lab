import { useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { validadePadrao, nomePeneira, TIPOS_TRACO, tipoTraco, nomeConcreteira, concreteirasDaEmpresa } from '../../../lib/cadastros'
import { salvarCadastro, enviarDocumentoTraco } from '../cadastrosRepo'
import TabelaPeneiras, { ler } from './TabelaPeneiras'
import ui from '../../laboratorio/components/ui.module.css'

/** Cadastro / edição de traço aprovado — CBUQ, TSD (com validade) ou Concreto (sem validade) */
export default function ModalTraco({ traco, tipoNovo = 'cbuq', empresas, concreteiras = [], onFechar, onSalvo }) {
  const novo = !traco
  const [f, setF] = useState(() => ({
    tipo: traco ? tipoTraco(traco) : tipoNovo,
    nome_traco: traco?.nome_traco || '',
    concreteira_id: traco?.concreteira_id || '',
    fck_mpa: traco?.fck_mpa ?? '',
    slump_mm: traco?.slump_mm ?? '',
    slump_tolerancia_mm: traco?.slump_tolerancia_mm ?? '',
    tipo_cimento: traco?.tipo_cimento || '',
    relacao_ac: traco?.relacao_ac ?? '',
    consumo_cimento_kg_m3: traco?.consumo_cimento_kg_m3 ?? '',
    empresa_id: traco?.empresa_id || '',
    tipo_mistura: traco?.tipo_mistura || (tipoNovo === 'tsd' ? 'T.S.D.' : tipoNovo === 'concreto' ? '' : 'C.A.U.Q.'),
    faixa_granulometrica: traco?.faixa_granulometrica || '',
    teor_betume_pct: traco?.teor_betume_pct ?? '',
    aprovado_em: traco?.aprovado_em || '',
    aprovado_por: traco?.aprovado_por || '',
    valido_ate: traco?.valido_ate || '',
    observacoes: traco?.observacoes || '',
    ativo: traco?.ativo !== false,
    faixa_trabalho: (Array.isArray(traco?.faixa_trabalho) ? traco.faixa_trabalho : [])
      .map(l => ({ ...l, peneira: l.peneira || nomePeneira(l.peneira_mm) })),
  }))
  const [arquivo, setArquivo] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))

  function mudarAprovacao(v) {
    // validade padrão: 6 meses depois da aprovação (pode ser alterada)
    setF(x => ({ ...x, aprovado_em: v, valido_ate: !x.valido_ate || x.valido_ate === validadePadrao(x.aprovado_em) ? validadePadrao(v) : x.valido_ate }))
  }

  const concreto = f.tipo === 'concreto'
  const numOuNull = v => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')))

  async function salvar() {
    setErro(null)
    if (!f.nome_traco.trim()) { setErro('Informe o nome do traço.'); return }
    if (concreto && numOuNull(f.fck_mpa) === null) { setErro('Informe o fck do traço.'); return }
    if (concreto && !f.concreteira_id) { setErro('Escolha a concreteira/central do traço.'); return }
    if (f.valido_ate && f.aprovado_em && f.valido_ate < f.aprovado_em) { setErro('A validade não pode ser anterior à aprovação.'); return }
    setSalvando(true)
    try {
      const dados = {
        ...f,
        id: traco?.id,
        empresa_id: f.empresa_id || null,
        concreteira_id: concreto ? (f.concreteira_id || null) : null,
        fck_mpa: concreto ? numOuNull(f.fck_mpa) : null,
        slump_mm: concreto ? numOuNull(f.slump_mm) : null,
        slump_tolerancia_mm: concreto ? numOuNull(f.slump_tolerancia_mm) : null,
        tipo_cimento: concreto ? f.tipo_cimento : null,
        relacao_ac: concreto ? numOuNull(f.relacao_ac) : null,
        consumo_cimento_kg_m3: concreto ? numOuNull(f.consumo_cimento_kg_m3) : null,
        teor_betume_pct: f.teor_betume_pct === '' ? null : Number(String(f.teor_betume_pct).replace(',', '.')),
        aprovado_em: f.aprovado_em || null,
        valido_ate: concreto ? null : (f.valido_ate || null),
        faixa_trabalho: concreto ? [] : f.faixa_trabalho
          .map(l => ({ peneira_mm: ler(l.peneira_mm), peneira: (l.peneira || '').trim() || null, min: ler(l.min), max: ler(l.max) }))
          .filter(l => l.peneira_mm != null || l.min != null || l.max != null),
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

  return (
    <Modal
      titulo={novo ? `Novo traço aprovado — ${TIPOS_TRACO.find(x => x.id === f.tipo)?.rotulo}` : 'Editar traço'}
      subtitulo={novo ? (concreto ? 'Traço de concreto · sem validade' : 'Validado pelos coordenadores · validade padrão de 6 meses') : traco.nome_traco}
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
        <div className={ui.campo}>
          <span className={ui.rotulo}>Tipo de traço</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TIPOS_TRACO.map(x => (
              <button key={x.id} type="button" className={`${ui.btn} ${ui.btnPequeno} ${f.tipo === x.id ? ui.btnPrimario : ui.btnSecundario}`}
                onClick={() => set('tipo', x.id)}>{x.rotulo}</button>
            ))}
          </div>
        </div>
        {concreto && (
          <div className={ui.grade2}>
            <label className={ui.campo}>
              <span className={ui.rotulo}>Empresa (construtora)</span>
              <select className={ui.input} value={f.empresa_id} onChange={e => set('empresa_id', e.target.value)}>
                <option value="">Sem empresa (aparece para todas)</option>
                {empresas.filter(e => e.ativo !== false || e.id === f.empresa_id).map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </label>
            <label className={ui.campo}>
              <span className={ui.rotulo}>Concreteira / Central <span className={ui.obrigatorio}>*</span></span>
              <select className={ui.input} value={f.concreteira_id} onChange={e => set('concreteira_id', e.target.value)}>
                <option value="">Selecione…</option>
                {concreteirasDaEmpresa(concreteiras, f.empresa_id || null)
                  .concat(concreteiras.filter(c => c.id === f.concreteira_id && c.ativo === false))
                  .map(c => <option key={c.id} value={c.id}>{nomeConcreteira(c)}{c.ativo === false ? ' (inativa)' : ''}</option>)}
              </select>
              <span className={ui.ajuda}>Só as centrais que atendem a empresa escolhida (Cadastros → Concreteiras/Centrais).</span>
            </label>
            <label className={ui.campo}>
              <span className={ui.rotulo}>fck (MPa) <span className={ui.obrigatorio}>*</span></span>
              <input className={ui.input} inputMode="decimal" value={f.fck_mpa} onChange={e => set('fck_mpa', e.target.value)} placeholder="Ex.: 30" />
            </label>
            <div className={ui.grade2}>
              <label className={ui.campo}>
                <span className={ui.rotulo}>Slump (mm)</span>
                <input className={ui.input} inputMode="decimal" value={f.slump_mm} onChange={e => set('slump_mm', e.target.value)} placeholder="Ex.: 100" />
              </label>
              <label className={ui.campo}>
                <span className={ui.rotulo}>Tolerância (± mm)</span>
                <input className={ui.input} inputMode="decimal" value={f.slump_tolerancia_mm} onChange={e => set('slump_tolerancia_mm', e.target.value)} placeholder="Ex.: 20" />
              </label>
            </div>
            <label className={ui.campo}>
              <span className={ui.rotulo}>Tipo de cimento</span>
              <input className={ui.input} value={f.tipo_cimento} onChange={e => set('tipo_cimento', e.target.value)} placeholder="Ex.: CP II-F-40" />
            </label>
            <div className={ui.grade2}>
              <label className={ui.campo}>
                <span className={ui.rotulo}>Relação a/c</span>
                <input className={ui.input} inputMode="decimal" value={f.relacao_ac} onChange={e => set('relacao_ac', e.target.value)} placeholder="Ex.: 0,55" />
              </label>
              <label className={ui.campo}>
                <span className={ui.rotulo}>Consumo de cimento (kg/m³)</span>
                <input className={ui.input} inputMode="decimal" value={f.consumo_cimento_kg_m3} onChange={e => set('consumo_cimento_kg_m3', e.target.value)} />
              </label>
            </div>
            <label className={ui.campo}>
              <span className={ui.rotulo}>Documento do traço (PDF)</span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className={ui.input} onChange={e => setArquivo(e.target.files?.[0] || null)} />
              <span className={ui.ajuda}>{traco?.documento ? 'Já há um documento — escolha outro para substituir.' : 'Opcional. Fica visível só para a equipe do laboratório.'}</span>
            </label>
          </div>
        )}
        {!concreto && <div className={ui.grade2}>
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
        </div>}
        <label className={ui.campo}>
          <span className={ui.rotulo}>Observações</span>
          <textarea className={`${ui.input} ${ui.textarea}`} value={f.observacoes} onChange={e => set('observacoes', e.target.value)} />
        </label>
        <label className={ui.campo} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={f.ativo} onChange={e => set('ativo', e.target.checked)} />
          <span>Ativo (aparece nas listas do Campo)</span>
        </label>

        {!concreto && <TabelaPeneiras linhas={f.faixa_trabalho} onChange={v => set('faixa_trabalho', v)} />}

        {erro && <div className={`${ui.aviso} ${ui.avisoErro}`}>{erro}</div>}
      </div>
    </Modal>
  )
}
