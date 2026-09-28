import { useId, useMemo } from 'react'
import { formatar } from '../motor/formatacao.js'
import { ajustarTendencia, caminho, escalaDoEixo, expandirIntervalo, nomeDaSerie, pontosDaSerie, pt, tracejado } from '../motor/grafico.js'

// ─────────────────────────────────────────────────────────────────────────────
// Gráfico da ficha (dispersão XY), desenhado em SVG a partir dos valores calculados.
// Mesma posição e tamanho do gráfico no Excel; acompanha a digitação em tempo real.
// ─────────────────────────────────────────────────────────────────────────────

const FONTE_PADRAO = "Calibri, Carlito, Arial, 'Segoe UI', sans-serif"
const PADRAO_AREA = { x: 0.1, y: 0.1, w: 0.82, h: 0.72 }

function fonteSvg(f = {}, base = {}) {
  const n = f.n || base.n
  return {
    fontFamily: n ? `'${n}', ${FONTE_PADRAO}` : FONTE_PADRAO,
    fontSize: pt(f.s || base.s || 10),
    fontWeight: (f.b ?? base.b) ? 700 : 400,
    fill: f.c || base.c || '#000000',
  }
}

/** Traço de uma linha do gráfico: null = sem linha; {} = padrão. */
function traco(l, padrao) {
  if (l === null) return null
  const cor = l?.cor || padrao?.cor
  if (!cor) return null
  const larg = pt(l?.larg ?? padrao?.larg ?? 0.75)
  return {
    stroke: cor, strokeWidth: larg, strokeOpacity: l?.op ?? padrao?.op ?? 1,
    strokeDasharray: tracejado(l?.tracejado, larg),
  }
}

function Marcador({ m, x, y }) {
  if (!m || m.tipo === 'none') return null
  const r = pt(m.tam || 5) / 2
  const fill = m.cor || '#000'
  const st = { fill, stroke: m.borda || fill, strokeWidth: 0.75 }
  switch (m.tipo) {
    case 'square': return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} {...st} />
    case 'diamond': return <path d={`M${x},${y - r * 1.2}L${x + r * 1.2},${y}L${x},${y + r * 1.2}L${x - r * 1.2},${y}Z`} {...st} />
    case 'triangle': return <path d={`M${x},${y - r * 1.15}L${x + r * 1.15},${y + r * 0.85}L${x - r * 1.15},${y + r * 0.85}Z`} {...st} />
    case 'x': return <path d={`M${x - r},${y - r}L${x + r},${y + r}M${x + r},${y - r}L${x - r},${y + r}`} stroke={m.borda || fill} strokeWidth={1.25} />
    case 'plus': return <path d={`M${x - r},${y}L${x + r},${y}M${x},${y - r}L${x},${y + r}`} stroke={m.borda || fill} strokeWidth={1.25} />
    case 'star': return <path d={`M${x - r},${y - r}L${x + r},${y + r}M${x + r},${y - r}L${x - r},${y + r}M${x},${y - r}L${x},${y + r}`} stroke={m.borda || fill} strokeWidth={1.25} />
    case 'dash': return <rect x={x - r} y={y - r * 0.25} width={2 * r} height={r * 0.5} {...st} />
    case 'dot': return <circle cx={x} cy={y} r={r * 0.5} {...st} />
    default: return <circle cx={x} cy={y} r={r} {...st} />
  }
}

/** Amostra da série na legenda (linha + marcador). */
function Amostra({ serie, x, y }) {
  const t = traco(serie.linha, { cor: serie.cor, larg: 2.25 })
  return (
    <g>
      {t && <line x1={x} y1={y} x2={x + 22} y2={y} {...t} />}
      <Marcador m={serie.marcador} x={x + 11} y={y} />
    </g>
  )
}

/** Equação com expoente sobrescrito ("y = 40,5x^0,212" → 40,5x⁰'²¹²). */
function Equacao({ texto }) {
  const partes = texto.split(/\^(-?[\d,]+)/)
  return partes.map((p, i) => (i % 2
    ? <tspan key={i} baselineShift="super" fontSize="70%">{p}</tspan>
    : <tspan key={i}>{p}</tspan>))
}

/** Linha de tendência de uma série + rótulo com equação/R². */
function Tendencia({ t, pts, sx, X, Y, P, W, H, fBase }) {
  const aj = ajustarTendencia(t, pts)
  if (!aj) return null
  const xs = pts.map(p => p.x)
  let x0 = Math.min(...xs) - (t.tras || 0), x1 = Math.max(...xs) + (t.frente || 0)
  if (sx.log) x0 = Math.max(x0, sx.min * 1e-6)
  const amostra = []
  for (let k = 0; k <= 80; k++) {
    const x = sx.log ? x0 * Math.pow(x1 / x0, k / 80) : x0 + (x1 - x0) * (k / 80)
    const y = aj.f(x)
    if (Number.isFinite(y)) amostra.push([X(x), Y(y)])
  }
  const tr = traco(t.linha, { cor: '#000000', larg: 1 })
  const linhas = [t.eq && aj.texto, t.r2 && `R² = ${String(+aj.r2.toPrecision(4)).replace('.', ',')}`].filter(Boolean)
  let rotulo = null
  if (linhas.length && amostra.length) {
    const f = fonteSvg(t.fonte, { ...fBase, c: '#595959' })
    const alt = f.fontSize * 1.25
    const larg = Math.max(...linhas.map(l => l.length)) * f.fontSize * 0.5 + 8
    const caixaAlt = alt * linhas.length + 6
    // posição: com layout manual, deslocada (frações do gráfico) a partir do canto inferior esquerdo da área
    // de plotagem (confere com o Excel/LibreOffice); sem layout, junto ao fim da linha
    const fim = amostra[amostra.length - 1]
    let x = t.rotulo ? P.x + (t.rotulo.x || 0) * W : fim[0] - larg
    let y = t.rotulo ? P.y + P.h - caixaAlt + (t.rotulo.y || 0) * H : fim[1] + 8
    x = Math.min(Math.max(x, P.x + 2), P.x + P.w - larg - 2)
    y = Math.min(Math.max(y, P.y + 2), P.y + P.h - alt * linhas.length - 6)
    rotulo = (
      <g>
        <rect x={x} y={y} width={larg} height={caixaAlt} fill="#FFFFFF" stroke="#D9D9D9" strokeWidth={0.75} />
        {linhas.map((l, i) => (
          <text key={i} x={x + 4} y={y + 3 + alt * (i + 0.8)} {...f}><Equacao texto={l} /></text>
        ))}
      </g>
    )
  }
  return (
    <>
      {tr && <path d={caminho(amostra)} fill="none" {...tr} />}
      {rotulo}
    </>
  )
}

/**
 * Props: g (definição do gráfico), motor, prefixo ('' ou 'VERSO!'), cells (indice.cells)
 *        responsivo: ocupa a largura disponível (visão em lista) em vez do tamanho fixo em px.
 */
export default function Grafico({ g, motor, prefixo = '', cells, responsivo = false }) {
  const clip = useId().replace(/:/g, '')
  const W = g.w, H = g.h
  const ex = g.eixos?.x || {}, ey = g.eixos?.y || {}
  const a = g.area || PADRAO_AREA
  const P = { x: a.x * W, y: a.y * H, w: a.w * W, h: a.h * H }

  const series = useMemo(() => g.series.map((s, i) => ({
    ...s,
    nomeTexto: nomeDaSerie(s, motor, cells, prefixo, i),
    trechos: pontosDaSerie(s, motor, prefixo, { logX: !!ex.log, logY: !!ey.log, vazios: g.vazios }),
  })), [g, motor, cells, prefixo, ex.log, ey.log])

  // eixo X pelos valores de X da tabela (peneiras), mesmo sem Y ainda: o gráfico não "pula" enquanto se digita
  const todosX = useMemo(() => g.series.flatMap(s => (s.x ? expandirIntervalo(s.x) : [])
    .map(a => motor?.valores?.get(prefixo + a)).filter(v => typeof v === 'number')), [g, motor, prefixo])
    .concat(series.flatMap(s => s.trechos.flat().map(p => p.x)))
  const todosY = series.flatMap(s => s.trechos.flat().map(p => p.y))
  const sx = escalaDoEixo(ex, todosX, Math.max(2, Math.round(P.w / 90)))
  const sy = escalaDoEixo(ey, todosY, Math.max(2, Math.round(P.h / 40)))
  const X = v => P.x + sx.para(v) * P.w
  const Y = v => P.y + (1 - sy.para(v)) * P.h

  const fBase = g.fonte || {}
  const fX = fonteSvg(ex.fonte, fBase), fY = fonteSvg(ey.fonte, fBase)
  const tamMarca = 5
  const linhaX = traco(ex.linha, { cor: '#000000', larg: 0.75 })
  const linhaY = traco(ey.linha, { cor: '#000000', larg: 0.75 })
  const gradeX = traco(ex.grade), gradeY = traco(ey.grade)
  const gradeXm = traco(ex.gradeMenor), gradeYm = traco(ey.gradeMenor)
  const dentro = (v, s) => v >= s.min * (1 - 1e-9) - (s.log ? 0 : 1e-9) && v <= s.max * (1 + 1e-9) + (s.log ? 0 : 1e-9)

  const marcasPara = (tipo, ehY) => {
    if (tipo === 'none') return [0, 0]
    const fora = tipo === 'out' || tipo === 'cross' || !tipo ? tamMarca : 0
    const dent = tipo === 'in' || tipo === 'cross' ? tamMarca : 0
    return ehY ? [fora, dent] : [fora, dent]
  }
  const [mxFora, mxDentro] = marcasPara(ex.marcas)
  const [myFora, myDentro] = marcasPara(ey.marcas, true)

  // legenda
  const leg = g.legenda
  const visiveis = leg ? series.filter((_, i) => !(leg.ocultos || []).includes(i)) : []
  const fLeg = fonteSvg(leg?.fonte, fBase)
  let itensLegenda = []
  if (leg && visiveis.length) {
    const larguraItem = s => 22 + 6 + s.nomeTexto.length * fLeg.fontSize * 0.55 + 14
    if (leg.pos === 'r' || leg.pos === 'l') {
      const la = leg.area || { x: leg.pos === 'r' ? 0.85 : 0.01, y: 0.4, w: 0.14, h: 0.2 }
      const altura = fLeg.fontSize * 1.5
      const y0 = la.y * H + (la.h * H - altura * visiveis.length) / 2 + altura / 2
      itensLegenda = visiveis.map((s, i) => ({ s, x: la.x * W + 4, y: y0 + i * altura }))
    } else {
      const la = leg.area || { x: 0.1, y: leg.pos === 't' ? 0.02 : 0.9, w: 0.8, h: 0.06 }
      // como no Excel: colunas iguais (largura do maior item), o conjunto centralizado na área da legenda
      const col = Math.min(Math.max(...visiveis.map(larguraItem)), (la.w * W) / visiveis.length)
      const x0 = la.x * W + Math.max(0, (la.w * W - col * visiveis.length) / 2)
      const y = la.y * H + (la.h * H) / 2
      itensLegenda = visiveis.map((s, i) => ({ s, x: x0 + i * col, y }))
    }
  }

  const titulo = g.titulo
  const fT = fonteSvg(titulo, { ...fBase, s: 14, b: 1 })
  const fTx = ex.titulo && fonteSvg(ex.titulo, fBase)
  const fTy = ey.titulo && fonteSvg(ey.titulo, fBase)
  const bordaGrafico = traco(g.borda === undefined ? {} : g.borda, { cor: '#D9D9D9', larg: 0.75 })
  const bordaArea = traco(g.areaBorda ?? null)

  // largura dos rótulos do eixo Y, para posicionar o título do eixo
  const rotulosY = ey.oculto || ey.semRotulos ? [] : sy.marcas.map(v => formatar(v, ey.nf || 'General'))
  const largRotY = Math.max(0, ...rotulosY.map(t => t.length * fY.fontSize * 0.55))

  const svgProps = responsivo
    ? { viewBox: `0 0 ${W} ${H}`, width: '100%', style: { display: 'block', height: 'auto', minWidth: 560 } }
    : { width: W, height: H, viewBox: `0 0 ${W} ${H}` }

  return (
    <svg {...svgProps} role="img" aria-label={titulo?.texto || 'Gráfico'} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id={`area-${clip}`}><rect x={P.x - 4} y={P.y - 4} width={P.w + 8} height={P.h + 8} /></clipPath>
      </defs>
      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill={g.fundo || '#FFFFFF'} {...(bordaGrafico || {})} />
      {g.areaFundo && <rect x={P.x} y={P.y} width={P.w} height={P.h} fill={g.areaFundo} />}

      {/* grades */}
      {gradeXm && sx.menores.filter(v => dentro(v, sx)).map(v => <line key={`xm${v}`} x1={X(v)} x2={X(v)} y1={P.y} y2={P.y + P.h} {...gradeXm} />)}
      {gradeYm && sy.menores.filter(v => dentro(v, sy)).map(v => <line key={`ym${v}`} y1={Y(v)} y2={Y(v)} x1={P.x} x2={P.x + P.w} {...gradeYm} />)}
      {gradeX && sx.marcas.map(v => <line key={`xg${v}`} x1={X(v)} x2={X(v)} y1={P.y} y2={P.y + P.h} {...gradeX} />)}
      {gradeY && sy.marcas.map(v => <line key={`yg${v}`} y1={Y(v)} y2={Y(v)} x1={P.x} x2={P.x + P.w} {...gradeY} />)}
      {bordaArea && <rect x={P.x} y={P.y} width={P.w} height={P.h} fill="none" {...bordaArea} />}

      {/* eixo X (embaixo) */}
      {!ex.oculto && (
        <g>
          {linhaX && <line x1={P.x} x2={P.x + P.w} y1={P.y + P.h} y2={P.y + P.h} {...linhaX} />}
          {(mxFora || mxDentro) > 0 && sx.marcas.map(v => (
            <line key={`xt${v}`} x1={X(v)} x2={X(v)} y1={P.y + P.h - mxDentro} y2={P.y + P.h + mxFora} stroke={linhaX?.stroke || '#000'} strokeWidth={0.75} />
          ))}
          {!ex.semRotulos && sx.marcas.map(v => (
            <text key={`xl${v}`} x={X(v)} y={P.y + P.h + mxFora + 3 + fX.fontSize * 0.85} textAnchor="middle" {...fX}>
              {formatar(v, ex.nf || 'General')}
            </text>
          ))}
          {ex.titulo && (
            <text x={P.x + P.w / 2} y={P.y + P.h + mxFora + 6 + fX.fontSize * 1.1 + fTx.fontSize} textAnchor="middle" {...fTx}>{ex.titulo.texto}</text>
          )}
        </g>
      )}

      {/* eixo Y (à esquerda) */}
      {!ey.oculto && (
        <g>
          {linhaY && <line x1={P.x} x2={P.x} y1={P.y} y2={P.y + P.h} {...linhaY} />}
          {(myFora || myDentro) > 0 && sy.marcas.map(v => (
            <line key={`yt${v}`} x1={P.x - myFora} x2={P.x + myDentro} y1={Y(v)} y2={Y(v)} stroke={linhaY?.stroke || '#000'} strokeWidth={0.75} />
          ))}
          {rotulosY.map((t, i) => (
            <text key={`yl${i}`} x={P.x - myFora - 3} y={Y(sy.marcas[i]) + fY.fontSize * 0.35} textAnchor="end" {...fY}>{t}</text>
          ))}
          {ey.titulo && (() => {
            const cx = Math.max(fTy.fontSize * 0.8, P.x - myFora - 8 - largRotY - fTy.fontSize * 0.4)
            const cy = P.y + P.h / 2
            return <text x={cx} y={cy} textAnchor="middle" transform={`rotate(-90 ${cx} ${cy})`} {...fTy}>{ey.titulo.texto}</text>
          })()}
        </g>
      )}

      {/* séries */}
      <g clipPath={`url(#area-${clip})`}>
        {series.map((s, i) => {
          const t = traco(s.linha, { cor: s.cor, larg: 2.25 })
          return (
            <g key={i}>
              {t && s.trechos.map((tr, k) => (
                <path key={k} d={caminho(tr.map(p => [X(p.x), Y(p.y)]), s.suave)} fill="none" strokeLinejoin="round" strokeLinecap="round" {...t} />
              ))}
              {s.marcador && s.trechos.flat().map((p, k) => <Marcador key={`m${k}`} m={s.marcador} x={X(p.x)} y={Y(p.y)} />)}
              {(s.tendencias || []).map((t, k) => (
                <Tendencia key={`t${k}`} t={t} pts={s.trechos.flat()} sx={sx} X={X} Y={Y} P={P} W={W} H={H} fBase={fBase} />
              ))}
            </g>
          )
        })}
      </g>

      {titulo?.texto && (
        <text x={W / 2} y={(titulo.y ?? 0.02) * H + fT.fontSize} textAnchor="middle" {...fT}>{titulo.texto}</text>
      )}

      {itensLegenda.map(({ s, x, y }, i) => (
        <g key={`lg${i}`}>
          <Amostra serie={s} x={x} y={y} />
          <text x={x + 28} y={y + fLeg.fontSize * 0.35} {...fLeg}>{s.nomeTexto}</text>
        </g>
      ))}
    </svg>
  )
}
