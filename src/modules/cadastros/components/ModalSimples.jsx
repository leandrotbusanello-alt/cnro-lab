import { useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { TIPOS_CADASTRO } from '../../../lib/cadastros'
import { salvarCadastro } from '../cadastrosRepo'
import ui from '../../laboratorio/components/ui.module.css'

/** Jazida, pedreira ou fornecedor de ligante */
export default function ModalSimples({ tipo, item, onFechar, onSalvo }) {
  const cfg = TIPOS_CADASTRO[tipo]
  const [f, setF] = useState({
    nome: item?.nome || '', municipio: item?.municipio || '', coordenadas: item?.coordenadas || '', ativo: item?.ativo !== false,
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))

  async function salvar() {
    setErro(null)
    if (!f.nome.trim()) { setErro('Informe o nome.'); return }
    setSalvando(true)
    try {
      const dados = { id: item?.id, nome: f.nome, ativo: f.ativo }
      if (tipo !== 'fornecedores') dados.municipio = f.municipio
      if (tipo === 'jazidas') dados.coordenadas = f.coordenadas
      onSalvo(await salvarCadastro(tipo, dados))
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo={item ? `Editar ${cfg.singular}` : `Cadastrar ${cfg.singular}`}
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
          <span className={ui.rotulo}>Nome <span className={ui.obrigatorio}>*</span></span>
          <input className={ui.input} value={f.nome} onChange={e => set('nome', e.target.value)} autoFocus />
        </label>
        {tipo !== 'fornecedores' && (
          <label className={ui.campo}>
            <span className={ui.rotulo}>Município</span>
            <input className={ui.input} value={f.municipio} onChange={e => set('municipio', e.target.value)} />
          </label>
        )}
        {tipo === 'jazidas' && (
          <label className={ui.campo}>
            <span className={ui.rotulo}>Coordenadas (opcional)</span>
            <input className={ui.input} value={f.coordenadas} onChange={e => set('coordenadas', e.target.value)} placeholder="Ex.: -15.6014, -56.0979" />
          </label>
        )}
        <label className={ui.campo} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={f.ativo} onChange={e => set('ativo', e.target.checked)} />
          <span>Ativo (aparece nas listas do Campo)</span>
        </label>
        {erro && <div className={`${ui.aviso} ${ui.avisoErro}`}>{erro}</div>}
      </div>
    </Modal>
  )
}
