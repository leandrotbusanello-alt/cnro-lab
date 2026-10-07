import { useEffect, useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { dataBR } from '../../../lib/cadastros'
import { historicoTraco, listarUsuariosNomes } from '../cadastrosRepo'
import ui from '../../laboratorio/components/ui.module.css'
import styles from '../CadastrosPage.module.css'

/** Histórico de validação do traço (aprovação e revalidações) */
export default function ModalHistorico({ traco, onFechar, onDocumento }) {
  const [linhas, setLinhas] = useState(null)
  const [nomes, setNomes] = useState({})
  const [erro, setErro] = useState(null)

  useEffect(() => {
    historicoTraco(traco.id).then(setLinhas).catch(e => setErro(e.message))
    listarUsuariosNomes().then(setNomes).catch(() => {})
  }, [traco.id])

  return (
    <Modal titulo="Histórico de validação" subtitulo={traco.nome_traco} onFechar={onFechar}>
      {erro && <div className={`${ui.aviso} ${ui.avisoErro}`}>{erro}</div>}
      {!linhas && !erro && <div className="spinner" />}
      {linhas && linhas.length === 0 && <p className={ui.vazio}>Ainda sem registro de aprovação.</p>}
      {linhas && linhas.length > 0 && (
        <div className={styles.historico}>
          {linhas.map(l => (
            <div key={l.id} className={styles.histItem}>
              <strong>Aprovado em {dataBR(l.aprovado_em)} · válido até {dataBR(l.valido_ate)}</strong>
              <span>{l.aprovado_por ? `Coordenador: ${l.aprovado_por}` : 'Coordenador não informado'}</span>
              <small>
                {l.observacao} · registrado em {new Date(l.registrado_em).toLocaleString('pt-BR')}
                {nomes[l.registrado_por] ? ` por ${nomes[l.registrado_por]}` : ''}
              </small>
              {l.documento && (
                <button type="button" className={ui.btnLink} onClick={() => onDocumento(l.documento)}>📎 Documento desta validação</button>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
