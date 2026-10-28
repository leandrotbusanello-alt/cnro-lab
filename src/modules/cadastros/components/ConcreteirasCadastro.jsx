import { useMemo, useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { nomeConcreteira } from '../../../lib/cadastros'
import { salvarCadastro } from '../cadastrosRepo'
import ui from '../../laboratorio/components/ui.module.css'
import styles from '../CadastrosPage.module.css'

// ─────────────────────────────────────────────────────────────────────────────
// Concreteiras/Centrais (migração 35 — 28/10/2026). A central fica amarrada às construtoras
// que ela atende: no pedido de concreto, o Campo só vê as centrais da empresa do pedido.
// Assim a análise nunca mistura centrais de cidades diferentes (ex.: ConcreNop Cuiabá × Sinop).
// ─────────────────────────────────────────────────────────────────────────────

export default function ConcreteirasCadastro({ concreteiras, empresas, termo, onSalvo }) {
  const [modal, setModal] = useState(null)       // { item } | null
  const [empresa, setEmpresa] = useState('')
  const empresasPorId = useMemo(() => Object.fromEntries((empresas || []).map(e => [e.id, e])), [empresas])
  const lista = (concreteiras || [])
    .filter(c => !termo || nomeConcreteira(c).toLowerCase().includes(termo))
    .filter(c => !empresa || (c.empresas_ids || []).includes(empresa))
    .sort((a, b) => nomeConcreteira(a).localeCompare(nomeConcreteira(b), 'pt-BR'))

  return (
    <>
      <div className={styles.barraTracos}>
        <select className={ui.input} value={empresa} onChange={e => setEmpresa(e.target.value)} aria-label="Empresa">
          <option value="">Todas as empresas</option>
          {(empresas || []).filter(e => e.ativo !== false).map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <span />
        <button className={`${ui.btn} ${ui.btnPrimario}`} onClick={() => setModal({ item: null })}>+ Cadastrar concreteira/central</button>
      </div>
      {!lista.length ? <p className={ui.vazio}>Nenhuma concreteira/central cadastrada{empresa ? ' para esta empresa' : ''}.</p> : (
        <div className={styles.tabelaWrap}>
          <table className={`${styles.tabela} ${styles.tabelaCompacta}`}>
            <thead><tr><th>Concreteira</th><th>Central / cidade</th><th>Construtoras atendidas</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {lista.map(c => (
                <tr key={c.id} className={c.ativo === false ? styles.inativo : ''}>
                  <td className={styles.colNome}>{c.concreteira}</td>
                  <td>{c.central || '—'}</td>
                  <td>{(c.empresas_ids || []).length ? c.empresas_ids.map(id => empresasPorId[id]?.nome || '?').join(' · ') : <em className={styles.mudo}>Todas</em>}</td>
                  <td>{c.ativo === false ? 'Inativa' : 'Ativa'}</td>
                  <td className={styles.colAcao}>
                    <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={() => setModal({ item: c })}>✏️ Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && (
        <ModalConcreteira item={modal.item} empresas={empresas} onFechar={() => setModal(null)}
          onSalvo={c => { setModal(null); onSalvo(`"${nomeConcreteira(c)}" salva.`) }} />
      )}
    </>
  )
}

function ModalConcreteira({ item, empresas, onFechar, onSalvo }) {
  const [f, setF] = useState(() => ({
    concreteira: item?.concreteira || '',
    central: item?.central || '',
    empresas_ids: item?.empresas_ids || [],
    observacoes: item?.observacoes || '',
    ativo: item?.ativo !== false,
  }))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const marcar = id => set('empresas_ids', f.empresas_ids.includes(id) ? f.empresas_ids.filter(x => x !== id) : [...f.empresas_ids, id])

  async function salvar() {
    setErro(null)
    if (!f.concreteira.trim()) { setErro('Informe o nome da concreteira.'); return }
    if (!f.central.trim()) { setErro('Informe a central (cidade) — é o que separa as centrais da mesma concreteira.'); return }
    setSalvando(true)
    try {
      onSalvo(await salvarCadastro('concreteiras', { ...f, id: item?.id }))
    } catch (e) {
      setErro(/já existe/i.test(e.message) ? 'Já existe essa concreteira com essa central.' : e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo={item ? 'Editar concreteira/central' : 'Nova concreteira/central'}
      subtitulo="A central fica ligada às construtoras que ela atende"
      onFechar={onFechar}
      rodape={(
        <>
          <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className={`${ui.btn} ${ui.btnPrimario}`} onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : '💾 Salvar'}</button>
        </>
      )}
    >
      <div className={ui.pilha}>
        <div className={ui.grade2}>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Concreteira <span className={ui.obrigatorio}>*</span></span>
            <input className={ui.input} value={f.concreteira} onChange={e => set('concreteira', e.target.value)} placeholder="Ex.: ConcreNop" />
          </label>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Central / cidade <span className={ui.obrigatorio}>*</span></span>
            <input className={ui.input} value={f.central} onChange={e => set('central', e.target.value)} placeholder="Ex.: Sinop" />
          </label>
        </div>
        <div className={ui.campo}>
          <span className={ui.rotulo}>Construtoras atendidas</span>
          <span className={ui.ajuda}>No pedido de concreto, a central só aparece para estas empresas. Sem nenhuma marcada, aparece para todas.</span>
          <div className={styles.checks}>
            {(empresas || []).filter(e => e.ativo !== false || f.empresas_ids.includes(e.id)).map(e => (
              <label key={e.id} className={styles.check}>
                <input type="checkbox" checked={f.empresas_ids.includes(e.id)} onChange={() => marcar(e.id)} />
                <span>{e.nome}</span>
              </label>
            ))}
          </div>
        </div>
        <label className={ui.campo}>
          <span className={ui.rotulo}>Observações</span>
          <textarea className={`${ui.input} ${ui.textarea}`} value={f.observacoes} onChange={e => set('observacoes', e.target.value)} />
        </label>
        <label className={ui.campo} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={f.ativo} onChange={e => set('ativo', e.target.checked)} />
          <span>Ativa (aparece nas listas do Campo)</span>
        </label>
        {erro && <div className={`${ui.aviso} ${ui.avisoErro}`}>{erro}</div>}
      </div>
    </Modal>
  )
}
