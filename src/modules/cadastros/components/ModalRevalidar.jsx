import { useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { validadePadrao, dataBR } from '../../../lib/cadastros'
import { hojeISO } from '../../laboratorio/utils'
import { salvarCadastro, enviarDocumentoTraco } from '../cadastrosRepo'
import ui from '../../laboratorio/components/ui.module.css'

/**
 * Revalidação: nova data de aprovação, coordenador e validade (o mesmo traço).
 * O histórico guarda a validade anterior. Se o traço mudou de verdade
 * (teor, faixa), cadastre um traço novo e desative este.
 */
export default function ModalRevalidar({ traco, onFechar, onSalvo }) {
  const [aprovadoEm, setAprovadoEm] = useState(hojeISO())
  const [coordenador, setCoordenador] = useState(traco.aprovado_por || '')
  const [validoAte, setValidoAte] = useState(validadePadrao(hojeISO()))
  const [arquivo, setArquivo] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  async function salvar() {
    setErro(null)
    if (!aprovadoEm || !validoAte) { setErro('Informe a data da revalidação e a nova validade.'); return }
    if (validoAte < aprovadoEm) { setErro('A validade não pode ser anterior à revalidação.'); return }
    setSalvando(true)
    try {
      const dados = { id: traco.id, aprovado_em: aprovadoEm, aprovado_por: coordenador, valido_ate: validoAte, ativo: true }
      if (arquivo) dados.documento = await enviarDocumentoTraco(traco.id, arquivo)
      onSalvo(await salvarCadastro('tracos', dados))
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo="Revalidar traço"
      subtitulo={traco.nome_traco}
      onFechar={onFechar}
      rodape={(
        <>
          <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className={`${ui.btn} ${ui.btnAcao}`} onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : '↻ Revalidar'}</button>
        </>
      )}
    >
      <div className={ui.pilha}>
        <div className={`${ui.aviso} ${ui.avisoInfo}`}>
          Validade atual: <strong>{dataBR(traco.valido_ate)}</strong>{traco.aprovado_por ? ` (aprovado por ${traco.aprovado_por})` : ''}.
          A validade anterior fica no histórico.
        </div>
        <div className={ui.grade2}>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Data da revalidação</span>
            <input type="date" className={ui.input} value={aprovadoEm} max={hojeISO()}
              onChange={e => { setAprovadoEm(e.target.value); setValidoAte(validadePadrao(e.target.value)) }} />
          </label>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Coordenador que validou</span>
            <input className={ui.input} value={coordenador} onChange={e => setCoordenador(e.target.value)} />
          </label>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Nova validade</span>
            <input type="date" className={ui.input} value={validoAte} min={aprovadoEm} onChange={e => setValidoAte(e.target.value)} />
            <span className={ui.ajuda}>Padrão: 6 meses.</span>
          </label>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Novo documento (opcional)</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className={ui.input} onChange={e => setArquivo(e.target.files?.[0] || null)} />
          </label>
        </div>
        {erro && <div className={`${ui.aviso} ${ui.avisoErro}`}>{erro}</div>}
      </div>
    </Modal>
  )
}
