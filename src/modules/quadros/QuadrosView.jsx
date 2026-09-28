import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLab } from '../laboratorio/useLaboratorio'
import { PERFIS_LABORATORISTAS } from '../laboratorio/constants'
import { indexarModelo, calcularFicha } from '../fichas/motor/ficha.js'
import FichaGrade from '../fichas/components/FichaGrade'
import ImpressaoFicha from '../fichas/components/ImpressaoFicha'
import fs from '../fichas/components/Ficha.module.css'
import ui from '../laboratorio/components/ui.module.css'
import { LISTA_QUADROS, QUADROS } from './definicoes'
import { montarQuadro, expandirModelo } from './motorQuadros'
import { carregarDadosQuadro, carregarModeloQuadro } from './quadrosRepo'
import s from './QuadrosView.module.css'

/**
 * Quadros de controle (FR-IMOB-39 a 43) — Laboratório.
 * O quadro é montado com os resultados APROVADOS; nada é digitado aqui.
 * Levantamento e decisões: claude/CNRO_Lab_Quadros_Controle_Escopo.md.
 */
function inicioDoMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function hoje() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const FILTROS_INICIAIS = () => ({ inicio: inicioDoMes(), fim: hoje(), empresaId: '', lote: '', tipo: '', procedencia: '', obra: '', fck: '' })

export default function QuadrosView() {
  const lab = useLab()
  const perfilSigla = String(lab.perfil?.perfil || '').toUpperCase()
  const pode = PERFIS_LABORATORISTAS.includes(perfilSigla)

  const [codigo, setCodigo] = useState(LISTA_QUADROS[0].codigo)
  const [filtros, setFiltros] = useState(FILTROS_INICIAIS)
  const [cache, setCache] = useState({})          // codigo → { dados, modelo }
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(null)
  const [imprimir, setImprimir] = useState(false)
  const def = QUADROS[codigo]
  const atual = cache[codigo]

  async function carregar(forcar = false) {
    if (!forcar && cache[codigo]) return
    if (!navigator.onLine) { setErro('Os quadros de controle precisam de internet (leem os resultados no servidor).'); return }
    setCarregando(true); setErro(null)
    try {
      const [dados, modelo] = await Promise.all([carregarDadosQuadro(def), cache[codigo]?.modelo || carregarModeloQuadro(codigo)])
      setCache(c => ({ ...c, [codigo]: { dados, modelo } }))
    } catch (e) {
      setErro(e?.message || String(e))
    } finally {
      setCarregando(false)
    }
  }
  useEffect(() => { if (pode) carregar() }, [codigo, pode])   // eslint-disable-line react-hooks/exhaustive-deps

  const quadro = useMemo(() => {
    if (!atual) return null
    const { dados, modelo } = atual
    const r = montarQuadro(def, { ...dados, empresasPorId: lab.empresasPorId }, filtros, modelo.quadro)
    const expandido = expandirModelo(modelo.modelo, modelo.quadro, r.n)
    const indice = indexarModelo({ ...expandido, titulo: `${codigo} ${def.titulo}` })
    const estado = { entradas: r.entradas, escolhas: {}, verificacoes: {} }
    return { ...r, indice, estado, motor: calcularFicha(indice, estado, {}) }
  }, [atual, filtros, def, codigo, lab.empresasPorId])

  if (!pode) {
    return <div className={`${ui.aviso} ${ui.avisoInfo}`}>Os quadros de controle são do laboratorista e do gestor.</div>
  }

  const mudar = (k, v) => setFiltros(f => ({ ...f, [k]: v }))
  const op = quadro?.opcoes || {}
  const nomeEmpresa = id => lab.empresasPorId?.[id]?.nome || id

  return (
    <div className={s.wrapper}>
      <div className={s.header}>
        <div>
          <Link to="/laboratorio" className={ui.btnLink}>← Laboratório</Link>
          <h2 className={s.titulo}>📊 Quadros de controle</h2>
          <p className={s.subtitulo}>Montados com os resultados aprovados — nada é digitado aqui.</p>
        </div>
        <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={() => carregar(true)} disabled={carregando}>
          ↻ Atualizar
        </button>
      </div>

      <div className={s.quadros} role="tablist" aria-label="Quadro">
        {LISTA_QUADROS.map(q => (
          <button key={q.codigo} role="tab" aria-selected={q.codigo === codigo}
            className={`${s.quadro} ${q.codigo === codigo ? s.quadroAtivo : ''}`}
            onClick={() => { setCodigo(q.codigo); setFiltros(f => ({ ...f, tipo: '', procedencia: '', obra: '', fck: '' })) }}>
            <span className={s.quadroCodigo}>{q.codigo}</span>
            <span>{q.titulo}</span>
          </button>
        ))}
      </div>

      <div className={s.filtros}>
        <label className={ui.campo}><span className={ui.rotulo}>De</span>
          <input type="date" className={ui.input} value={filtros.inicio} onChange={e => mudar('inicio', e.target.value)} /></label>
        <label className={ui.campo}><span className={ui.rotulo}>Até</span>
          <input type="date" className={ui.input} value={filtros.fim} onChange={e => mudar('fim', e.target.value)} /></label>
        <Selecao rotulo={def.rotuloTipo} valor={filtros.tipo} opcoes={op.tipos} onChange={v => mudar('tipo', v)} />
        {def.concreto && <Selecao rotulo="fck (MPa)" valor={filtros.fck} opcoes={op.fcks?.map(String)} onChange={v => mudar('fck', v)} />}
        {def.concreto && <Selecao rotulo="Obra" valor={filtros.obra} opcoes={op.obras} onChange={v => mudar('obra', v)} />}
        {!def.concreto && <Selecao rotulo="Procedência" valor={filtros.procedencia} opcoes={op.procedencias} onChange={v => mudar('procedencia', v)} />}
        <Selecao rotulo="Empresa" valor={filtros.empresaId} opcoes={op.empresas} rotuloOpcao={nomeEmpresa} onChange={v => mudar('empresaId', v)} />
        <Selecao rotulo="Lote" valor={filtros.lote} opcoes={op.lotes} onChange={v => mudar('lote', v)} />
      </div>

      {erro && <div className={`${ui.aviso} ${ui.avisoErro || ui.avisoInfo}`} role="alert">{erro}</div>}
      {carregando && <div className={s.status}>Carregando resultados aprovados…</div>}

      {quadro && (
        <>
          <div className={s.resumo}>
            <span><strong>{quadro.linhas.length}</strong> {def.concreto ? 'série(s)' : 'amostra(s)'} no período</span>
            {!def.concreto && <span><strong>{quadro.total}</strong> na análise global (desde o início, mesmos filtros)</span>}
            <span className={s.nota}>Colunas sem ficha online saem vazias.</span>
            <button className={`${ui.btn} ${ui.btnPrimario} ${ui.btnPequeno} ${s.imprimir}`} onClick={() => setImprimir(true)}>🖨 Imprimir / PDF</button>
          </div>
          {quadro.avisos.map(a => <div key={a} className={`${ui.aviso} ${ui.avisoInfo}`}>{a}</div>)}
          <div className={fs.papel}>
            <FichaGrade indice={quadro.indice} folha={quadro.indice.folhas[0]} motor={quadro.motor} estado={quadro.estado} modo="leitura" assinaturas={{}} />
          </div>
        </>
      )}

      {imprimir && quadro && (
        <ImpressaoFicha indice={quadro.indice} motor={quadro.motor} estado={quadro.estado} assinaturas={{}}
          titulo={`${codigo} — ${def.titulo}`} onFechar={() => setImprimir(false)} />
      )}
    </div>
  )
}

function Selecao({ rotulo, valor, opcoes = [], onChange, rotuloOpcao = x => x }) {
  return (
    <label className={ui.campo}>
      <span className={ui.rotulo}>{rotulo}</span>
      <select className={ui.input} value={valor} onChange={e => onChange(e.target.value)}>
        <option value="">Todos</option>
        {opcoes.map(o => <option key={o} value={o}>{rotuloOpcao(o)}</option>)}
      </select>
    </label>
  )
}
