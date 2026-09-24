import logo from '../../../../assets/logo-nova-rota.png'
import { Valor, Caixa, CabecalhoFicha, RodapeFicha } from './CamposFicha'
import { CABECALHO, TIPOS_SOLICITACAO, LOCALIZACOES_POR_BLOCO, BLOCOS_LOCALIZACAO } from './catalogoFichas'
import s from './fichas.module.css'

/** FR-IMOB-05 — Solicitação de Ensaios/Estudos (layout da planilha Rev00) */
export default function FichaSolicitacao({ v, set, editavel, responsaveis }) {
  const locs = v.localizacoes || []

  function setLoc(indice, campo, valor) {
    const lista = [...locs]
    while (lista.length <= indice) lista.push({ km: '', pista: '', trilho: '' })
    lista[indice] = { ...lista[indice], [campo]: valor }
    set('localizacoes', lista)
  }

  return (
    <div className={`${s.folha} ${s.sol}`}>
      <CabecalhoFicha titulo="Solicitação de Ensaios/Estudos" codigo="FR-IMOB-05" logo={logo} cab={CABECALHO} />

      {/* ── Dados do Solicitante ── */}
      <table className={`${s.grade} ${s.dadosSol}`}>
        <colgroup>
          <col style={{ width: '19.8%' }} /><col style={{ width: '44.7%' }} />
          <col style={{ width: '11.6%' }} /><col style={{ width: '23.9%' }} />
        </colgroup>
        <tbody>
          <tr><td colSpan={4} className={`${s.barra} ${s.barraSol}`}>Dados do Solicitante</td></tr>
          <tr>
            <th className={s.centro}>Obra</th>
            <td><Valor valor={v.obra} onChange={x => set('obra', x)} editavel={editavel} className={s.azul} /></td>
            <th className={s.centro}>Lote</th>
            <td><Valor valor={v.lote} onChange={x => set('lote', x)} editavel={editavel} className={s.azul} /></td>
          </tr>
          <tr>
            <th className={s.centro}>Solicitante</th>
            <td colSpan={3}><Valor valor={v.solicitante} onChange={x => set('solicitante', x)} editavel={editavel} className={s.vermelho} /></td>
          </tr>
          <tr>
            <th className={s.centro}>Contato</th>
            <td colSpan={3}><Valor valor={v.contato} onChange={x => set('contato', x)} editavel={editavel} className={s.vermelho} placeholder="(65) 0000 0000" /></td>
          </tr>
          <tr>
            <td colSpan={4} className={`${s.barra} ${s.barraSol}`}>
              Solicitação <span className={s.barraNormal}>(selecione detalhe demanda especificando locais dos ensaios/investigação)</span>
            </td>
          </tr>
          <tr><th colSpan={4} className={s.subtitulo}>Selecione:</th></tr>
          {TIPOS_SOLICITACAO.map(t => (
            <tr key={t.campo} className={s.linhaTipo}>
              <td colSpan={4}>
                <span className={s.itemTipo}>
                  <Caixa marcado={!!v[t.campo]} onChange={x => set(t.campo, x)} editavel={editavel} rotulo={t.rotulo} />
                  {t.rotulo}
                </span>
              </td>
            </tr>
          ))}
          <tr><th colSpan={4} className={`${s.subtitulo} ${s.semBordaInferior}`}>Detalhar demanda especificando locais dos ensaios/investigação:</th></tr>
        </tbody>
      </table>

      {/* ── Localizações: 3 blocos × 15 linhas ── */}
      <div className={s.blocosLoc}>
        {Array.from({ length: BLOCOS_LOCALIZACAO }).map((_, b) => (
          <table key={b} className={s.tabelaLoc}>
            <colgroup>
              <col style={{ width: '30%' }} /><col style={{ width: '30%' }} /><col style={{ width: '40%' }} />
            </colgroup>
            <thead>
              <tr><th>Km</th><th>Pista N/S</th><th>Trilho de roda</th></tr>
            </thead>
            <tbody>
              {Array.from({ length: LOCALIZACOES_POR_BLOCO }).map((__, r) => {
                const i = b * LOCALIZACOES_POR_BLOCO + r
                const l = locs[i] || {}
                return (
                  <tr key={r}>
                    {['km', 'pista', 'trilho'].map(c => (
                      <td key={c}>
                        <Valor valor={l[c]} onChange={x => setLoc(i, c, x)} editavel={editavel} className={s.azul} />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        ))}
      </div>

      {/* ── Observação ── */}
      <div className={`${s.observacao} ${s.observacaoSol}`}>
        <b>Observação: </b>
        {editavel
          ? <Valor tipo="textarea" valor={v.observacao} onChange={x => set('observacao', x)} editavel className={s.azulObs} />
          : <span className={s.azulObs}>{v.observacao}</span>}
      </div>

      <RodapeFicha responsaveis={responsaveis} />
    </div>
  )
}
