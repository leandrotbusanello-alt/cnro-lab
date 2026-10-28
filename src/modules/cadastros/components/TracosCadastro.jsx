import { Fragment, useMemo, useState } from 'react'
import { statusTraco, dataBR, TIPOS_TRACO, tipoTraco, nomeConcreteira } from '../../../lib/cadastros'
import ui from '../../laboratorio/components/ui.module.css'
import styles from '../CadastrosPage.module.css'

// ─────────────────────────────────────────────────────────────────────────────
// Aba "Traços aprovados" (28/10/2026): botões CBUQ · TSD · Concreto, filtro por empresa e lista
// compacta (uma linha por traço; clicar abre o detalhe). CBUQ e TSD têm validade (6 meses);
// concreto não tem validade.
// ─────────────────────────────────────────────────────────────────────────────

const FILTROS_ASFALTO = [
  { id: 'ativos', rotulo: 'Ativos' },
  { id: 'vence', rotulo: 'Vencem em 30 dias' },
  { id: 'vencido', rotulo: 'Vencidos' },
  { id: 'sem_validade', rotulo: 'Sem validade' },
  { id: 'inativos', rotulo: 'Inativos' },
]
const FILTROS_CONCRETO = [
  { id: 'ativos', rotulo: 'Ativos' },
  { id: 'inativos', rotulo: 'Inativos' },
]
const TOM = { vigente: 'ok', vence: 'pendente', vencido: 'erro', sem_validade: 'neutro' }
const fmt = v => (v === null || v === undefined || v === '' ? '—' : String(v).replace('.', ','))

export function contarAlertasTracos(tracos) {
  return (tracos || []).filter(t => t.ativo !== false && tipoTraco(t) !== 'concreto' && ['vence', 'vencido'].includes(statusTraco(t).codigo)).length
}

export default function TracosCadastro({ tracos, empresas, concreteiras, tipo, onTipo, termo, onNovo, onEditar, onRevalidar, onHistorico, onDocumento }) {
  const [filtro, setFiltro] = useState('ativos')
  const [empresa, setEmpresa] = useState('')
  const [aberto, setAberto] = useState(null)
  const concreto = tipo === 'concreto'
  const filtros = concreto ? FILTROS_CONCRETO : FILTROS_ASFALTO
  const empresasPorId = useMemo(() => Object.fromEntries((empresas || []).map(e => [e.id, e])), [empresas])
  const centraisPorId = useMemo(() => Object.fromEntries((concreteiras || []).map(c => [c.id, c])), [concreteiras])

  const doTipo = (tracos || []).filter(t => tipoTraco(t) === tipo)
  const daEmpresa = doTipo.filter(t => !empresa || (empresa === '__sem__' ? !t.empresa_id : t.empresa_id === empresa))
  const contagem = Object.fromEntries(filtros.map(f => [f.id, daEmpresa.filter(t => passa(t, f.id)).length]))
  const porTipo = Object.fromEntries(TIPOS_TRACO.map(x => [x.id, (tracos || []).filter(t => tipoTraco(t) === x.id && t.ativo !== false).length]))
  const filtroOk = filtros.some(f => f.id === filtro) ? filtro : 'ativos'
  const lista = daEmpresa
    .filter(t => passa(t, filtroOk))
    .filter(t => !termo || t.nome_traco.toLowerCase().includes(termo))
    .sort((a, b) => (empresasPorId[a.empresa_id]?.nome || '~').localeCompare(empresasPorId[b.empresa_id]?.nome || '~', 'pt-BR')
      || a.nome_traco.localeCompare(b.nome_traco, 'pt-BR'))

  return (
    <>
      <div className={styles.tiposTraco} role="tablist" aria-label="Tipo de traço">
        {TIPOS_TRACO.map(x => (
          <button key={x.id} type="button" role="tab" aria-selected={tipo === x.id}
            className={`${styles.tipoTraco} ${tipo === x.id ? styles.tipoTracoAtivo : ''}`} onClick={() => { onTipo(x.id); setAberto(null) }}>
            {x.rotulo} <span>{porTipo[x.id]}</span>
          </button>
        ))}
      </div>

      <div className={styles.barraTracos}>
        <select className={ui.input} value={empresa} onChange={e => setEmpresa(e.target.value)} aria-label="Empresa">
          <option value="">Todas as empresas</option>
          <option value="__sem__">Sem empresa definida</option>
          {(empresas || []).filter(e => e.ativo !== false).map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <div className={styles.filtros}>
          {filtros.map(f => (
            <button key={f.id} type="button" className={`${styles.filtro} ${filtroOk === f.id ? styles.filtroAtivo : ''}`} onClick={() => setFiltro(f.id)}>
              {f.rotulo} <span>{contagem[f.id]}</span>
            </button>
          ))}
        </div>
        <button className={`${ui.btn} ${ui.btnPrimario}`} onClick={() => onNovo(tipo)}>
          + Cadastrar traço {TIPOS_TRACO.find(x => x.id === tipo)?.rotulo}
        </button>
      </div>

      {!lista.length ? <p className={ui.vazio}>Nenhum traço neste filtro.</p> : (
        <div className={styles.tabelaWrap}>
          <table className={`${styles.tabela} ${styles.tabelaCompacta}`}>
            <thead>
              <tr>
                <th>Traço</th>
                <th>Empresa</th>
                {concreto ? <><th>Concreteira/Central</th><th>fck</th><th>Slump</th></> : <><th>Faixa</th><th>Teor</th><th>Validade</th></>}
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map(t => {
                const st = statusTraco(t)
                const ab = aberto === t.id
                return (
                  <Fragment key={t.id}>
                    <tr className={`${styles.linhaTraco} ${t.ativo === false ? styles.inativo : ''} ${ab ? styles.linhaAberta : ''}`}
                      onClick={() => setAberto(ab ? null : t.id)} title="Clique para ver o detalhe">
                      <td className={styles.colNome}><span className={styles.seta}>{ab ? '▾' : '▸'}</span>{t.nome_traco}</td>
                      <td>{empresasPorId[t.empresa_id]?.nome || <em className={styles.mudo}>Todas</em>}</td>
                      {concreto ? (
                        <>
                          <td>{nomeConcreteira(centraisPorId[t.concreteira_id]) || '—'}</td>
                          <td className={styles.num}>{t.fck_mpa != null ? `${fmt(t.fck_mpa)} MPa` : '—'}</td>
                          <td className={styles.num}>{t.slump_mm != null ? `${fmt(t.slump_mm)}${t.slump_tolerancia_mm != null ? ` ± ${fmt(t.slump_tolerancia_mm)}` : ''} mm` : '—'}</td>
                        </>
                      ) : (
                        <>
                          <td>{t.faixa_granulometrica || '—'}</td>
                          <td className={styles.num}>{t.teor_betume_pct != null ? `${fmt(t.teor_betume_pct)}%` : '—'}</td>
                          <td><span className={`${ui.badge} ${ui[TOM[st.codigo]]}`}>{t.ativo === false ? 'Inativo' : st.rotulo}</span></td>
                        </>
                      )}
                      <td className={styles.colAcao}>
                        <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={e => { e.stopPropagation(); onEditar(t) }}>✏️ Editar</button>
                      </td>
                    </tr>
                    {ab && (
                      <tr className={styles.detalheLinha}>
                        <td colSpan={concreto ? 6 : 6}>
                          <Detalhe t={t} concreto={concreto} centraisPorId={centraisPorId}
                            onRevalidar={onRevalidar} onHistorico={onHistorico} onDocumento={onDocumento} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function passa(t, filtro) {
  if (filtro === 'inativos') return t.ativo === false
  if (t.ativo === false) return false
  if (filtro === 'ativos') return true
  return statusTraco(t).codigo === filtro
}

function Detalhe({ t, concreto, centraisPorId, onRevalidar, onHistorico, onDocumento }) {
  return (
    <div className={styles.detalheTraco}>
      <div className={styles.detalhes}>
        {concreto ? (
          <>
            <span>🏭 {nomeConcreteira(centraisPorId[t.concreteira_id]) || 'Concreteira não definida'}</span>
            <span>fck: {t.fck_mpa != null ? `${fmt(t.fck_mpa)} MPa` : '—'}</span>
            <span>Slump: {t.slump_mm != null ? `${fmt(t.slump_mm)} mm` : '—'}{t.slump_tolerancia_mm != null ? ` ± ${fmt(t.slump_tolerancia_mm)} mm` : ''}</span>
            {t.tipo_cimento && <span>Cimento: {t.tipo_cimento}</span>}
            {t.relacao_ac != null && <span>a/c: {fmt(t.relacao_ac)}</span>}
            {t.consumo_cimento_kg_m3 != null && <span>Consumo de cimento: {fmt(t.consumo_cimento_kg_m3)} kg/m³</span>}
          </>
        ) : (
          <>
            {(t.tipo_mistura || t.faixa_granulometrica) && <span>🧪 {[t.tipo_mistura, t.faixa_granulometrica].filter(Boolean).join(' · ')}</span>}
            {t.teor_betume_pct != null && <span>Teor de ligante: {fmt(t.teor_betume_pct)}%</span>}
            <span>✔ Aprovado em {dataBR(t.aprovado_em)}{t.aprovado_por ? ` por ${t.aprovado_por}` : ''}</span>
            <span>📅 Válido até {dataBR(t.valido_ate)}</span>
            <span>⚖️ Granulometria: {Array.isArray(t.faixa_trabalho) && t.faixa_trabalho.length ? `${t.faixa_trabalho.length} peneiras` : 'não preenchida'}</span>
          </>
        )}
        {t.observacoes && <span>📝 {t.observacoes}</span>}
      </div>
      <div className={styles.acoes}>
        {!concreto && <button className={`${ui.btn} ${ui.btnAcao} ${ui.btnPequeno}`} onClick={() => onRevalidar(t)}>↻ Revalidar</button>}
        {!concreto && <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={() => onHistorico(t)}>🕘 Histórico</button>}
        {t.documento && <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={() => onDocumento(t.documento)}>📎 Documento</button>}
      </div>
    </div>
  )
}
