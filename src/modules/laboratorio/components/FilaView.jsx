import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLab } from '../useLaboratorio'
import { SUBVISOES_MINHAS, VISOES, STATUS_PEDIDO } from '../constants'
import { situacao, ordenar } from '../classificacao'
import { numeroPE, nomeEmpresa, rotuloMaterial, rotuloSubtipo } from '../utils'
import { TIPOS_AMOSTRA } from '../../campo/constants'
import PedidoCard from './PedidoCard'
import styles from './FilaView.module.css'
import ui from './ui.module.css'

const FILTROS_VAZIOS = { busca: '', empresa: '', material: '', de: '', ate: '', status: '' }

export default function FilaView() {
  const lab = useLab()
  const { pedidos, ensaiosOsPorPedido, empresasPorId, usuariosPorId, loading, erro, atualizadoEm, meuIdPara } = lab
  const [params, setParams] = useSearchParams()
  // Vindo de um link do Painel (status/de/ate): cai em "Todas" e já mostra o que veio pronto.
  const temFiltroDeLink = !!(params.get('status') || params.get('de') || params.get('ate'))
  const visao = VISOES[params.get('v')] ? params.get('v') : (temFiltroDeLink ? 'todas' : 'fila')
  const sub = SUBVISOES_MINHAS.some(s => s.id === params.get('s')) ? params.get('s') : 'analise'
  const [filtros, setFiltros] = useState(() => ({
    ...FILTROS_VAZIOS,
    status: params.get('status') || '',
    de: params.get('de') || '',
    ate: params.get('ate') || '',
  }))
  const [filtrosAbertos, setFiltrosAbertos] = useState(temFiltroDeLink)

  function irPara(v, s) {
    const p = new URLSearchParams()
    p.set('v', v)
    if (v === 'minhas') p.set('s', s || sub)
    setParams(p, { replace: true })
  }

  // ── Classificação ─────────────────────────────────────────────────────────
  const itens = useMemo(() => pedidos.map(p => ({
    pedido: p,
    ensaiosOs: ensaiosOsPorPedido[p.id] || [],
    sit: situacao(p, ensaiosOsPorPedido[p.id] || [], meuIdPara(p)),
  })), [pedidos, ensaiosOsPorPedido, meuIdPara])

  const contagem = useMemo(() => {
    const c = { fila: 0, minhas: 0, todas: itens.length }
    SUBVISOES_MINHAS.forEach(s => { c[s.id] = 0 })
    for (const it of itens) {
      if (it.sit.naFila) c.fila++
      if (it.sit.meu && it.sit.sub) {
        c[it.sit.sub]++
        if (it.sit.sub !== 'concluidas') c.minhas++
      }
    }
    return c
  }, [itens])

  const empresasLista = useMemo(() =>
    [...new Set(pedidos.map(p => nomeEmpresa(p, empresasPorId)).filter(n => n && n !== '—'))].sort(),
  [pedidos, empresasPorId])

  // ── Filtragem ─────────────────────────────────────────────────────────────
  const visiveis = useMemo(() => {
    let l = itens
    if (visao === 'fila') l = l.filter(it => it.sit.naFila)
    else if (visao === 'minhas') l = l.filter(it => it.sit.meu && it.sit.sub === sub)

    const f = filtros
    const termo = f.busca.trim().toLowerCase()
    if (termo) {
      l = l.filter(({ pedido: p }) => [
        numeroPE(p), p.numero_os, nomeEmpresa(p, empresasPorId), p.lote,
        rotuloMaterial(p.material), rotuloSubtipo(p.material, p.sub_tipo),
        usuariosPorId[p.solicitante_id]?.nome, usuariosPorId[p.laboratorista_id]?.nome,
      ].filter(Boolean).join(' ').toLowerCase().includes(termo))
    }
    if (f.empresa)  l = l.filter(({ pedido: p }) => nomeEmpresa(p, empresasPorId) === f.empresa)
    if (f.material) l = l.filter(({ pedido: p }) => p.material === f.material)
    // Vem do Painel como lista separada por vírgula (ex.: "em_andamento,aguardando_revisao")
    if (f.status)   { const lista = f.status.split(','); l = l.filter(({ pedido: p }) => lista.includes(p.status)) }
    if (f.de)       l = l.filter(({ pedido: p }) => (p.created_at || '').slice(0, 10) >= f.de)
    if (f.ate)      l = l.filter(({ pedido: p }) => (p.created_at || '').slice(0, 10) <= f.ate)

    return ordenar(l, visao, sub)
  }, [itens, visao, sub, filtros, empresasPorId, usuariosPorId])

  const qtdFiltros = Object.values(filtros).filter(Boolean).length

  return (
    <div className={styles.wrapper}>
      {/* Cabeçalho */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.titulo}>🔬 Laboratório</h2>
          <p className={styles.subtitulo}>
            {atualizadoEm ? `Atualizado às ${atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Carregando…'}
          </p>
        </div>
        <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={() => lab.recarregar()} disabled={loading}>
          ↻ Atualizar
        </button>
      </div>

      {/* Visões principais */}
      <div className={styles.visoes} role="tablist">
        {Object.entries(VISOES).map(([id, v]) => (
          <button
            key={id}
            role="tab"
            aria-selected={visao === id}
            className={`${styles.visao} ${visao === id ? styles.visaoAtiva : ''}`}
            onClick={() => irPara(id)}
          >
            {v.label}
            <span className={styles.contador}>{contagem[id]}</span>
          </button>
        ))}
      </div>

      {/* Sub-filtros de "Minhas O.S." */}
      {visao === 'minhas' && (
        <div className={styles.chips}>
          {SUBVISOES_MINHAS.map(s => (
            <button
              key={s.id}
              className={`${styles.chip} ${sub === s.id ? styles.chipAtivo : ''} ${s.id === 'revisao' && contagem.revisao > 0 ? styles.chipDestaque : ''}`}
              onClick={() => irPara('minhas', s.id)}
            >
              {s.label} <strong>{contagem[s.id]}</strong>
            </button>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className={styles.filtrosBar}>
        <input
          className={`${ui.input} ${styles.busca}`}
          placeholder="Buscar por PE, O.S., empresa, lote, solicitante…"
          value={filtros.busca}
          onChange={e => setFiltros({ ...filtros, busca: e.target.value })}
        />
        <button
          className={`${ui.btn} ${ui.btnSecundario} ${styles.btnFiltros}`}
          onClick={() => setFiltrosAbertos(a => !a)}
        >
          Filtros{qtdFiltros - (filtros.busca ? 1 : 0) > 0 ? ` (${qtdFiltros - (filtros.busca ? 1 : 0)})` : ''}
        </button>
      </div>

      {filtrosAbertos && (
        <div className={styles.filtros}>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Empresa</span>
            <select className={ui.input} value={filtros.empresa} onChange={e => setFiltros({ ...filtros, empresa: e.target.value })}>
              <option value="">Todas</option>
              {empresasLista.map(n => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label className={ui.campo}>
            <span className={ui.rotulo}>Material</span>
            <select className={ui.input} value={filtros.material} onChange={e => setFiltros({ ...filtros, material: e.target.value })}>
              <option value="">Todos</option>
              {TIPOS_AMOSTRA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          {visao === 'todas' && (
            <label className={ui.campo}>
              <span className={ui.rotulo}>Status</span>
              <select className={ui.input} value={filtros.status} onChange={e => setFiltros({ ...filtros, status: e.target.value })}>
                <option value="">Todos</option>
                {Object.entries(STATUS_PEDIDO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
          )}
          <label className={ui.campo}>
            <span className={ui.rotulo}>Pedido de</span>
            <input type="date" className={ui.input} value={filtros.de} onChange={e => setFiltros({ ...filtros, de: e.target.value })} />
          </label>
          <label className={ui.campo}>
            <span className={ui.rotulo}>até</span>
            <input type="date" className={ui.input} value={filtros.ate} onChange={e => setFiltros({ ...filtros, ate: e.target.value })} />
          </label>
          <div className={styles.filtrosAcoes}>
            <button className={ui.btnLink} onClick={() => setFiltros(FILTROS_VAZIOS)}>Limpar filtros</button>
          </div>
        </div>
      )}

      {/* Lista */}
      {erro && <div className={`${ui.aviso} ${ui.avisoErro}`}>⚠️ {erro}</div>}

      {loading && pedidos.length === 0 ? (
        <div className={styles.carregando}><div className="spinner" /></div>
      ) : visiveis.length === 0 ? (
        <div className={styles.vazio}>
          <div className={styles.vazioIcone}>{visao === 'fila' ? '✅' : '📭'}</div>
          <strong>{textoVazio(visao, sub, qtdFiltros)}</strong>
        </div>
      ) : (
        <div className={styles.lista}>
          {visao === 'fila' && (
            <p className={styles.dica}>
              Ordem de chegada (mais antigo primeiro). Abrir um pedido não o reserva: você passa a ser o
              responsável ao editar, devolver ou gerar a O.S.
            </p>
          )}
          {visiveis.map(it => (
            <PedidoCard
              key={it.pedido.id}
              pedido={it.pedido}
              ensaiosOs={it.ensaiosOs}
              sit={it.sit}
              mostrarResponsavel={visao === 'todas'}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function textoVazio(visao, sub, qtdFiltros) {
  if (qtdFiltros > 0) return 'Nenhum pedido encontrado com esses filtros.'
  if (visao === 'fila') return 'Nenhum pedido aguardando laboratório.'
  if (visao === 'todas') return 'Nenhum pedido em aberto.'
  return {
    analise: 'Nenhum pedido em análise com você.',
    campo: 'Nenhum pedido aguardando correção do campo.',
    andamento: 'Nenhuma O.S. em andamento.',
    revisao: 'Nenhum ensaio aguardando sua revisão.',
    finalizar: 'Nenhuma O.S. pronta para finalizar.',
    concluidas: 'Nenhuma O.S. concluída nos últimos 90 dias.',
  }[sub]
}
