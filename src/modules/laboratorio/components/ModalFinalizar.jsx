import { useEffect, useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { useLab } from '../useLaboratorio'
import { numeroOS, ehOSProvisoria, hojeISO } from '../utils'
import { ehHistorico, dataParaISO, isoParaData, maiorData } from '../../../lib/historico'
import { StatusEnsaio } from './StatusBadge'
import styles from './ModalFinalizar.module.css'
import ui from './ui.module.css'

/** Finalizar a O.S.: conferência, visibilidade por ensaio e assinatura do laboratorista */
export default function ModalFinalizar({ pedido, ensaiosOs, ocupado, rodar, onFechar, onConfirmar }) {
  const lab = useLab()
  const [assinatura, setAssinatura] = useState(null)
  const [confirmo, setConfirmo] = useState(false)
  // lançamento histórico: assina o laboratorista do pedido, na data informada
  const historico = ehHistorico(pedido)
  const eu = lab.laboratoristaDe(pedido)
  const dataMin = maiorData(pedido.data_validacao, ...ensaiosOs.map(e => isoParaData(e.aprovado_em)))
  const [dataFinal, setDataFinal] = useState(dataMin || '')

  useEffect(() => {
    let ativo = true
    lab.urlAssinatura(eu).then(u => { if (ativo) setAssinatura(u) })
    return () => { ativo = false }
  }, [eu?.id, eu?.assinatura_url]) // eslint-disable-line react-hooks/exhaustive-deps

  const pendentes = ensaiosOs.filter(e => e.status !== 'aprovado')
  const dataOk = !historico || (!!dataFinal && dataFinal <= hojeISO() && (!pedido.data_validacao || dataFinal >= pedido.data_validacao))
  const pode = pendentes.length === 0 && ensaiosOs.length > 0 && confirmo && dataOk

  return (
    <Modal
      titulo="Finalizar O.S."
      subtitulo={numeroOS(pedido)}
      largura="lg"
      onFechar={onFechar}
      rodape={(
        <>
          <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={onFechar} disabled={ocupado}>Cancelar</button>
          <button className={`${ui.btn} ${ui.btnAcao}`} disabled={!pode || ocupado}
            onClick={() => onConfirmar(historico ? { dataFinalizacao: dataParaISO(dataFinal) } : {})}>
            {ocupado ? 'Finalizando…' : '✍️ Assinar e finalizar'}
          </button>
        </>
      )}
    >
      <div className={ui.pilha}>
        {pendentes.length > 0 && (
          <div className={`${ui.aviso} ${ui.avisoErro}`}>
            {pendentes.length} ensaio(s) ainda não aprovado(s). A O.S. só pode ser finalizada com todos os ensaios aprovados.
          </div>
        )}
        {ehOSProvisoria(pedido) && (
          <div className={`${ui.aviso} ${ui.avisoAlerta}`}>
            📶 A O.S. ainda tem número provisório. A finalização será enviada depois que a O.S. for sincronizada.
          </div>
        )}

        <div>
          <div className={ui.secaoTitulo}>Ensaios e visibilidade para o campo</div>
          <div className={styles.lista}>
            {ensaiosOs.map(eo => (
              <div key={eo.id} className={styles.item}>
                <div className={styles.nome}>
                  <strong>{eo.nome_ensaio}</strong>
                  <span>{lab.usuariosPorId[eo.assistente_id]?.nome || 'Sem executor'}</span>
                </div>
                <StatusEnsaio status={eo.status} />
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={!!eo.visivel_campo}
                    disabled={ocupado}
                    onChange={e => rodar(() => lab.acoes.alterarVisibilidade(pedido, eo, e.target.checked),
                      e.target.checked ? 'Resultado liberado ao campo.' : 'Resultado ocultado do campo.')}
                  />
                  Visível ao campo
                </label>
              </div>
            ))}
          </div>
        </div>

        {historico && (
          <label className={ui.campo}>
            <span className={ui.rotulo}>📜 Data da finalização (lançamento histórico) <span className={ui.obrigatorio}>*</span></span>
            <input type="date" className={ui.input} value={dataFinal} min={pedido.data_validacao || undefined} max={hojeISO()}
              onChange={e => setDataFinal(e.target.value)} />
            {!dataOk && <span className={ui.ajuda} style={{ color: '#b91c1c' }}>Informe uma data entre a data da O.S. e hoje.</span>}
          </label>
        )}

        <div className={styles.assinaturaBox}>
          <div className={ui.secaoTitulo}>Assinatura do laboratorista{historico ? ` · ${eu?.nome || ''}` : ''}</div>
          {assinatura ? (
            <div className={styles.assinatura}>
              <img src={assinatura} alt={`Assinatura de ${eu?.nome || ''}`} />
              <span>{eu?.nome}</span>
            </div>
          ) : (
            <div className={`${ui.aviso} ${ui.avisoAlerta}`}>
              {historico ? `${eu?.nome || 'O laboratorista'} não tem assinatura cadastrada.` : 'Você ainda não tem assinatura cadastrada.'} A
              O.S. será finalizada e o histórico registrará que foi sem assinatura.
              Peça ao Gestor para cadastrar a assinatura (PNG com fundo transparente).
            </div>
          )}
        </div>

        <div className={`${ui.aviso} ${ui.avisoAlerta}`}>
          🔒 Após finalizar, a O.S. fica bloqueada para edição. Somente o Gestor pode reabrir.
        </div>

        <label className={styles.confirmo}>
          <input type="checkbox" checked={confirmo} onChange={e => setConfirmo(e.target.checked)} />
          Revisei todos os resultados e confirmo a finalização desta O.S.
        </label>
      </div>
    </Modal>
  )
}
