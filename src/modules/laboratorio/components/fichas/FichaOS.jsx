import logo from '../../../../assets/logo-nova-rota.png'
import { Valor, Caixa, CabecalhoFicha, RodapeFicha } from './CamposFicha'
import {
  CABECALHO, ESPECIFICACOES, ENSAIOS_ASFALTO, ENSAIOS_SOLOS, ENSAIOS_CONCRETO, calcularIndicador,
} from './catalogoFichas'
import s from './fichas.module.css'

/** FR-IMOB-04 — Ordem de Serviço (layout da planilha Rev00) */
export default function FichaOS({ v, set, editavel, responsaveis }) {
  const indicador = calcularIndicador(v)
  const linhasDetalhe = Math.max(ENSAIOS_ASFALTO.length, ENSAIOS_SOLOS.length, ENSAIOS_CONCRETO.length)

  const campoData = (campo, vazio = '') => (
    <Valor tipo="date" valor={v[campo]} onChange={x => set(campo, x)} editavel={editavel} className={s.azul} vazio={vazio} />
  )

  return (
    <div className={`${s.folha} ${s.os}`}>
      <CabecalhoFicha titulo="Ordem de Serviço" codigo="FR-IMOB-04" logo={logo} cab={CABECALHO} />

      {/* ── Datas ── */}
      <table className={s.grade}>
        <colgroup>
          <col style={{ width: '25.5%' }} /><col style={{ width: '26.5%' }} />
          <col style={{ width: '17%' }} /><col style={{ width: '31%' }} />
        </colgroup>
        <tbody>
          <tr><td colSpan={4} className={s.barra}>Datas</td></tr>
          <tr>
            <th>Número da ordem de serviço:</th>
            <td><span className={`${s.valor} ${s.azul}`} style={{ textAlign: 'center' }}>{v.numero_os}</span></td>
            <th>Inicio dos ensaios:</th>
            <td>{campoData('inicio_ensaios')}</td>
          </tr>
          <tr>
            <th>Data da solicitação:</th>
            <td>{campoData('data_solicitacao')}</td>
            <th>Fim dos ensaios:</th>
            <td>{campoData('fim_ensaios')}</td>
          </tr>
          <tr>
            <th>Previsão de entrega:</th>
            <td>{campoData('previsao_entrega')}</td>
            <th>Analise dos ensaios:</th>
            <td>{campoData('analise_ensaios')}</td>
          </tr>
          <tr>
            <th>Repactuação data entrega:</th>
            <td>{campoData('repactuacao_data', '-')}</td>
            <th>Entrega da solicitação:</th>
            <td>{campoData('entrega_solicitacao')}</td>
          </tr>
          <tr>
            <th>Motivo repactuação:</th>
            <td>
              <Valor valor={v.motivo_repactuacao} onChange={x => set('motivo_repactuacao', x)} editavel={editavel} className={s.azul} vazio="-" />
            </td>
            <th>Indicador:</th>
            <td><span className={`${s.valor} ${s.negrito}`}>{indicador}</span></td>
          </tr>

          {/* ── Dados do Solicitante ── */}
          <tr><td colSpan={4} className={s.barra}>Dados do Solicitante</td></tr>
          <tr>
            <th>Obra:</th>
            <td><Valor valor={v.obra} onChange={x => set('obra', x)} editavel={editavel} className={s.azul} /></td>
            <th>Lote:</th>
            <td><Valor valor={v.lote} onChange={x => set('lote', x)} editavel={editavel} className={s.azul} /></td>
          </tr>
          <tr>
            <th>Solicitante:</th>
            <td colSpan={3}><Valor valor={v.solicitante} onChange={x => set('solicitante', x)} editavel={editavel} className={s.vermelho} /></td>
          </tr>
          <tr>
            <th>Contato:</th>
            <td colSpan={3}><Valor valor={v.contato} onChange={x => set('contato', x)} editavel={editavel} className={s.vermelho} placeholder="(65) 0000 0000" /></td>
          </tr>

          {/* ── Ensaios / Estudos ── */}
          <tr><td colSpan={4} className={s.barra}>Ensaios / Estudos</td></tr>
          <tr><th colSpan={4} className={s.subtitulo}>Especificação:</th></tr>
        </tbody>
      </table>

      <table className={`${s.grade} ${s.lista}`}>
        <colgroup><col style={{ width: '5.5%' }} /><col style={{ width: '3%' }} /><col /></colgroup>
        <tbody>
          {ESPECIFICACOES.map(item => (
            <tr key={item.campo}>
              <td className={s.semBordaLateral} />
              <td className={s.celCaixa}>
                <Caixa marcado={!!v[item.campo]} onChange={x => set(item.campo, x)} editavel={editavel} rotulo={item.rotulo} />
              </td>
              <td className={s.rotuloItem}>{item.rotulo}</td>
            </tr>
          ))}
          <tr><th colSpan={3} className={s.subtitulo}>Detalhar ensaios:</th></tr>
        </tbody>
      </table>

      {/* ── Detalhar ensaios (Asfalto | Solos e Agregados | Concreto) ── */}
      <table className={`${s.grade} ${s.detalhe}`}>
        <colgroup>
          <col style={{ width: '7%' }} /><col style={{ width: '23.3%' }} />
          <col style={{ width: '4.5%' }} /><col style={{ width: '34.2%' }} />
          <col style={{ width: '5.5%' }} /><col style={{ width: '25.5%' }} />
        </colgroup>
        <tbody>
          <tr className={s.cabDetalhe}>
            <th colSpan={2}>Asfalto</th>
            <th colSpan={2}>Solos e Agregados</th>
            <th colSpan={2}>Concreto</th>
          </tr>
          {Array.from({ length: linhasDetalhe }).map((_, i) => (
            <tr key={i}>
              <CelulaEnsaio item={ENSAIOS_ASFALTO[i]} v={v} set={set} editavel={editavel} />
              <CelulaEnsaio item={ENSAIOS_SOLOS[i]} v={v} set={set} editavel={editavel} />
              <CelulaEnsaio item={ENSAIOS_CONCRETO[i]} v={v} set={set} editavel={editavel} />
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Observação ── */}
      <div className={s.observacao}>
        <b>Observação: </b>
        {editavel
          ? <Valor tipo="textarea" valor={v.observacao} onChange={x => set('observacao', x)} editavel className={s.azulObs} />
          : <span className={s.azulObs}>{v.observacao}</span>}
      </div>

      <RodapeFicha responsaveis={responsaveis} />
    </div>
  )
}

function CelulaEnsaio({ item, v, set, editavel }) {
  if (!item) return <td colSpan={2} />
  return (
    <>
      <td className={s.celCaixa}>
        <Caixa marcado={!!v[item.campo]} onChange={x => set(item.campo, x)} editavel={editavel} rotulo={item.rotulo} />
      </td>
      <td className={s.rotuloItem}>{item.rotulo}</td>
    </>
  )
}
