import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { colStr } from '../motor/formulas.js'
import { formatar } from '../motor/formatacao.js'
import CampoCelula from './CampoCelula'
import s from './Ficha.module.css'

// ─────────────────────────────────────────────────────────────────────────────
// Ficha na grade original da planilha (mesclas, larguras, bordas, fontes, logo).
// Usada para preencher, revisar, visualizar e imprimir.
// ─────────────────────────────────────────────────────────────────────────────

const BORDA = {
  thin: '1px solid', hair: '1px solid', medium: '2px solid', thick: '3px solid',
  dashed: '1px dashed', dotted: '1px dotted', double: '3px double', mediumDashed: '2px dashed',
  dashDot: '1px dashed', mediumDashDot: '2px dashed', dashDotDot: '1px dotted', slantDashDot: '2px dashed',
}
const FONTE_PADRAO = "Tahoma, 'Segoe UI', Verdana, sans-serif"

function estiloTd(d) {
  const st = {}
  if (d.bg) st.background = d.bg
  if (d.bd) {
    for (const [k, lado] of [['t', 'Top'], ['r', 'Right'], ['b', 'Bottom'], ['l', 'Left']]) {
      if (d.bd[k]) st[`border${lado}`] = `${BORDA[d.bd[k][0]] || '1px solid'} ${d.bd[k][1]}`
    }
  }
  const f = d.f || {}
  st.fontFamily = f.n ? `'${f.n}', ${FONTE_PADRAO}` : FONTE_PADRAO
  st.fontSize = `${f.s || 10}pt`
  if (f.b) st.fontWeight = 700
  if (f.i) st.fontStyle = 'italic'
  if (f.u) st.textDecoration = 'underline'
  if (f.c) st.color = f.c
  st.verticalAlign = d.vt === 'center' || d.vt === 'justify' || d.vt === 'distributed' ? 'middle' : d.vt === 'top' ? 'top' : 'bottom'
  return st
}

function alinhamento(d) {
  if (d.h === 'center' || d.h === 'centerContinuous') return 'center'
  if (d.h === 'right') return 'right'
  if (d.h === 'left') return 'left'
  if (d.h === 'justify' || d.h === 'distributed') return 'justify'
  return null
}

/**
 * Estrutura da tabela (calculada uma vez por folha).
 * soImpressao: só as colunas da área de impressão do Excel (sem as colunas "só de tela").
 */
function montarEstrutura(folha, soImpressao) {
  const { modelo, c1, r1, cobertas } = folha
  const nCols = soImpressao ? folha.colsImpressao : modelo.cols.length
  const linhas = []
  modelo.rows.forEach((altura, ri) => {
    const r = r1 + ri
    const celulas = []
    modelo.cols.slice(0, nCols).forEach((largura, ci) => {
      const c = c1 + ci
      const a = colStr(c) + r
      if (cobertas.has(a)) return
      const d = modelo.cells[a] || {}
      const rs = d.rs || 1, cs = Math.min(d.cs || 1, nCols - ci)
      let h = 0
      for (let k = 0; k < rs; k++) h += modelo.rows[ri + k] || 0
      const vizinha = modelo.cells[colStr(c + cs) + r]
      const recortar = !d.w && vizinha && (vizinha.v !== undefined || vizinha.fx || vizinha.rt || vizinha.role)
      celulas.push({
        a, d, rs, cs, h: Math.max(0, h - 1), oculta: largura === 0, soTela: ci >= folha.colsImpressao,
        estilo: estiloTd(d), alinhamento: alinhamento(d), recortar,
        papel: d.role?.tipo || null,
      })
    })
    linhas.push({ r, altura, celulas })
  })
  return linhas
}

function Trechos({ rt }) {
  return rt.map((t, i) => {
    const st = {}
    if (t.b) st.fontWeight = 700
    if (t.i) st.fontStyle = 'italic'
    if (t.s) st.fontSize = `${t.s}pt`
    if (t.c) st.color = t.c
    const txt = t.va === 'subscript' ? <sub>{t.t}</sub> : t.va === 'superscript' ? <sup>{t.t}</sup> : t.t
    return <span key={i} style={st}>{txt}</span>
  })
}

function MarcaAssinatura({ assinatura, linhasTexto }) {
  if (!assinatura) return null
  return (
    <div className={s.marcaAssinatura} style={{ bottom: `${linhasTexto * 13 + 2}px` }}>
      {assinatura.url
        ? <img src={assinatura.url} alt={`Assinatura de ${assinatura.nome}`} />
        : <span className={s.assinaturaNome}>{assinatura.nome}</span>}
    </div>
  )
}

/**
 * Props
 *   indice, motor, estado        ficha (ver motor/ficha.js)
 *   folha       qual aba desenhar (indice.folhas[i]); padrão: a principal (frente)
 *   modo        'preencher' | 'revisao' | 'leitura'
 *   destacar    realça os campos por tipo (não usar na impressão)
 *   bloqueado   ficha assinada: campos travados
 *   assinaturas { executor: {nome, url, em} | null, calculista: … }
 *   escala      número fixo (impressão); sem ele, ajusta à largura disponível
 *   idBase      prefixo dos ids dos campos (navegação com Enter)
 *   onEntrada(endereco, valor) · onEscolha(grupo, opcao) · onVerificacao(endereco, marcado)
 *   onCliqueAssinatura(quem, elemento)
 * Endereços passados para fora (estado, motor, callbacks) são os completos: 'B7' ou 'VERSO!B7'.
 */
export default function FichaGrade({
  indice, folha: folhaProp, motor, estado, modo = 'leitura', destacar = false, bloqueado = false, assinaturas = {},
  escala: escalaFixa, idBase = 'ficha', soImpressao = false, onEntrada, onEscolha, onVerificacao, onCliqueAssinatura,
}) {
  const folha = folhaProp || indice.folhas?.[0] || indice
  const pre = folha.prefixo || ''
  const estrutura = useMemo(() => montarEstrutura(folha, soImpressao), [folha, soImpressao])
  const largura = soImpressao ? folha.larguraImpressao : folha.largura
  const caixa = useRef(null)
  const [escalaAuto, setEscalaAuto] = useState(1)

  useLayoutEffect(() => {
    if (escalaFixa || !caixa.current) return undefined
    const el = caixa.current
    const medir = () => {
      const w = el.clientWidth
      if (w > 0) setEscalaAuto(Math.min(1.15, Math.max(0.5, w / largura)))
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [escalaFixa, largura])

  const escala = escalaFixa || escalaAuto
  const podeEntrada = !bloqueado && (modo === 'preencher' || modo === 'revisao')
  const podeRevisao = !bloqueado && modo === 'revisao'
  const ordem = folha.ordemDigitacao

  function navegar(a, passo) {
    const lista = modo === 'revisao' ? [...ordem, ...(folha.revisao || indice.papeis.revisao)] : ordem
    const i = lista.indexOf(a)
    const prox = lista[i + passo]
    if (prox) document.getElementById(`${idBase}-${prox}`)?.focus()
    else document.activeElement?.blur?.()
  }

  function conteudo(cel) {
    const { d, papel } = cel
    const a = pre + cel.a
    if (papel === 'entrada' || papel === 'revisao') {
      const editavel = papel === 'entrada' ? podeEntrada : podeRevisao
      const campo = (
        <CampoCelula
          id={`${idBase}-${a}`}
          className={d.role.ml ? s.areaCelula : s.campoCelula}
          style={{ height: cel.h, textAlign: cel.alinhamento || (d.role.dado === 'numero' ? 'right' : 'left') }}
          valor={estado?.entradas?.[a]}
          dado={d.role.dado}
          nf={d.nf}
          multilinha={!!d.role.ml}
          editavel={editavel}
          rotulo={d.role.rot || d.role.rl || a}
          onConfirmar={v => onEntrada?.(a, v)}
          onNavegar={p => navegar(a, p)}
        />
      )
      if (!d.role.prefixo) return campo
      // rótulo e campo na mesma célula ("Data do ensaio: ____")
      return (
        <div className={s.comPrefixo} style={{ height: cel.h }}>
          <span className={s.prefixo}>{d.role.prefixo}</span>
          {campo}
        </div>
      )
    }
    let texto = null
    let numero = false
    if (papel === 'escolha') {
      const marcado = estado?.escolhas?.[d.role.grupo] === d.role.opcao
      texto = d.role.marca ? (marcado ? d.role.marca : '') : `${marcado ? '☒' : '☐'} ${d.role.texto}`
    } else if (papel === 'verificacao') {
      const marcado = !!estado?.verificacoes?.[a]
      return (
        <div className={s.cc} style={{ height: cel.h, justifyContent: jc(cel), textAlign: 'center' }}>
          <span><span className={s.verificacao}>{marcado ? '☒' : '☐'}</span>{d.role.texto ? ` ${d.role.texto}` : ''}</span>
        </div>
      )
    } else if (d.rt) {
      return <div className={`${s.cc} ${d.w ? s.quebra : ''}`} style={{ height: cel.h, justifyContent: jc(cel), textAlign: cel.alinhamento || undefined }}><span><Trechos rt={d.rt} /></span></div>
    } else if (d.fx || papel === 'pedido') {
      const v = motor.valores.get(a)
      numero = typeof v === 'number'
      texto = formatar(v === undefined ? null : v, d.nf)
      if (papel === 'pedido' && d.role.prefixo) {
        return (
          <div className={`${s.cc} ${cel.recortar ? s.recortar : ''}`} style={{ height: cel.h, justifyContent: jc(cel) }}>
            <span><span className={s.prefixo}>{d.role.prefixo}</span> <span className={s.valorPedido}>{texto}</span></span>
          </div>
        )
      }
    } else if (d.v !== undefined) {
      numero = typeof d.v === 'number'
      texto = formatar(d.v, d.nf)
    }
    return (
      <div
        className={`${s.cc} ${d.w ? s.quebra : ''} ${cel.recortar ? s.recortar : ''}`}
        style={{ height: cel.h, justifyContent: jc(cel), textAlign: cel.alinhamento || (numero ? 'right' : undefined) }}
      >
        <span>{texto}</span>
      </div>
    )
  }

  function classes(cel) {
    const out = []
    if (cel.oculta) out.push(s.oculta)
    if (cel.soTela && destacar) out.push(s.soTela)
    const p = cel.papel
    if (destacar) {
      if (p === 'entrada') out.push(podeEntrada ? s.dEntrada : s.dEntradaFixa)
      if (p === 'pedido') out.push(s.dPedido)
      if (p === 'revisao' && modo === 'revisao') out.push(podeRevisao ? s.dRevisao : s.dEntradaFixa)
      if (p === 'escolha' || p === 'verificacao') out.push(podeEntrada ? s.dEntrada : s.dEntradaFixa)
      if (p === 'assinatura') out.push(s.dAssinatura)
    }
    if ((p === 'escolha' || p === 'verificacao') && podeEntrada) out.push(s.clicavel)
    if (p === 'assinatura' && modo !== 'leitura') out.push(s.clicavel)
    return out.join(' ')
  }

  function aoClicar(cel, e) {
    if (cel.papel === 'escolha' && podeEntrada) {
      const { grupo, opcao } = cel.d.role
      onEscolha?.(grupo, estado?.escolhas?.[grupo] === opcao ? null : opcao)
    } else if (cel.papel === 'verificacao' && podeEntrada) {
      const a = pre + cel.a
      onVerificacao?.(a, !estado?.verificacoes?.[a])
    } else if (cel.papel === 'assinatura' && modo !== 'leitura') {
      onCliqueAssinatura?.(cel.d.role.quem, e.currentTarget)
    }
  }

  function aoTeclar(cel, e) {
    if ((e.key === 'Enter' || e.key === ' ') && (cel.papel === 'escolha' || cel.papel === 'verificacao' || cel.papel === 'assinatura')) {
      e.preventDefault()
      aoClicar(cel, e)
    }
  }

  return (
    <div ref={caixa} className={s.caixaGrade} style={escalaFixa ? { width: largura * escala } : undefined}>
      <div className={s.escalaGrade} style={{ width: largura * escala, height: folha.altura * escala }}>
        {/* Impressão (escala fixa): zoom em vez de transform. Com transform, a folha continua ocupando o
            tamanho original na paginação e o navegador quebra a ficha em duas páginas. */}
        <div
          className={s.folhaGrade}
          style={escalaFixa
            ? { width: largura, height: folha.altura, zoom: escala }
            : { width: largura, height: folha.altura, transform: `scale(${escala})` }}
        >
          <table className={s.grade} style={{ width: largura }}>
            <colgroup>{folha.modelo.cols.slice(0, soImpressao ? folha.colsImpressao : undefined).map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <tbody>
              {estrutura.map(linha => (
                <tr key={linha.r} style={{ height: linha.altura }}>
                  {linha.celulas.map(cel => {
                    const interativa = ((cel.papel === 'escolha' || cel.papel === 'verificacao') && podeEntrada) || (cel.papel === 'assinatura' && modo !== 'leitura')
                    return (
                      <td
                        key={cel.a}
                        rowSpan={cel.rs > 1 ? cel.rs : undefined}
                        colSpan={cel.cs > 1 ? cel.cs : undefined}
                        className={classes(cel)}
                        style={cel.estilo}
                        title={cel.d.fx && modo !== 'leitura' ? `=${cel.d.fx}` : undefined}
                        onClick={interativa ? e => aoClicar(cel, e) : undefined}
                        onKeyDown={interativa ? e => aoTeclar(cel, e) : undefined}
                        tabIndex={interativa ? 0 : undefined}
                        role={interativa ? (cel.papel === 'verificacao' ? 'checkbox' : 'button') : undefined}
                        aria-checked={cel.papel === 'verificacao' ? !!estado?.verificacoes?.[pre + cel.a] : undefined}
                      >
                        {conteudo(cel)}
                        {cel.papel === 'assinatura' && (
                          <MarcaAssinatura
                            assinatura={assinaturas[cel.d.role.quem]}
                            linhasTexto={String(cel.d.v || '').split('\n').length}
                          />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {folha.modelo.imgs.map((im, i) => (
            <img key={i} className={s.imagem} alt="" src={im.src} style={{ left: im.x, top: im.y, width: im.w, height: im.h }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function jc(cel) {
  const v = cel.estilo.verticalAlign
  return v === 'middle' ? 'center' : v === 'top' ? 'flex-start' : 'flex-end'
}
