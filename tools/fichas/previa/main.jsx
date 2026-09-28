import { createRoot } from 'react-dom/client'
import { indexarModelo, calcularFicha, linhasResultado } from '../../../src/modules/fichas/motor/ficha.js'
import FichaEnsaio from '../../../src/modules/fichas/components/FichaEnsaio.jsx'
import ImpressaoFicha from '../../../src/modules/fichas/components/ImpressaoFicha.jsx'
import { estadoAleatorio } from './estadoAleatorio.js'

const modelos = import.meta.glob('../saida/*.modelo.json', { eager: true, import: 'default' })
const estados = import.meta.glob('./estados/*.json', { eager: true, import: 'default' })
const q = new URLSearchParams(location.search)
const ficha = q.get('ficha')
const nomeEstado = q.get('estado') || 'vazio'
const modo = q.get('modo') || 'impressao'
const raiz = createRoot(document.getElementById('root'))

// assinatura de exemplo (retângulo com texto) para ver a posição na impressão
const ASSIN = q.get('assinar') ? {
  url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80"><text x="10" y="55" font-size="40" font-family="cursive" fill="#123">Assinatura</text></svg>'),
  nome: 'Fulano de Tal', em: '2026-09-28T12:00:00Z',
} : null

if (!ficha) {
  const nomes = Object.keys(modelos).map(k => k.split('/').pop().replace('.modelo.json', '')).sort()
  raiz.render(<div className="indice">{nomes.map(n => (
    <a key={n} href={`?ficha=${n}&estado=vazio`}>{n}</a>
  ))}</div>)
} else {
  const reg = modelos[`../saida/${ficha}.modelo.json`]
  if (!reg) throw new Error(`modelo não encontrado: ${ficha}`)
  const indice = indexarModelo(reg.modelo)
  let estado = { entradas: {}, escolhas: {}, verificacoes: {} }
  if (nomeEstado === 'aleatorio') estado = estadoAleatorio(indice, +(q.get('semente') || 12345))
  else if (nomeEstado !== 'vazio') {
    const e = estados[`./estados/${nomeEstado}.json`]
    if (!e) throw new Error(`estado não encontrado: estados/${nomeEstado}.json`)
    estado = { entradas: {}, escolhas: {}, verificacoes: {}, ...(e.estado || e) }
  }
  const pedido = (estados[`./estados/${nomeEstado}.json`] || {}).pedido || { os: 'OS-0000/2026', material: 'Material de teste', registro: 'REG-001', procedencia: 'Procedência de teste', complemento: '—' }
  const motor = calcularFicha(indice, estado, pedido)
  window.__resultados = linhasResultado(reg.mapa_resultados || [], motor)
  window.__valores = Object.fromEntries([...motor.valores].map(([a, v]) => [a, v && v.err ? v.err : v]))
  const assinaturas = ASSIN ? { executor: ASSIN, calculista: ASSIN } : {}
  function App() {
    return (
      <>
        {modo !== 'impressao' && <div className="barra">{ficha} · estado: {nomeEstado} · <a href="?">todas</a></div>}
        {modo === 'impressao'
          ? <ImpressaoFicha indice={indice} motor={motor} estado={estado} assinaturas={assinaturas} titulo={ficha} onFechar={() => {}} />
          : <FichaEnsaio indice={indice} motor={motor} estado={estado} modo="leitura" assinaturas={assinaturas} />}
      </>
    )
  }
  raiz.render(<App />)
  setTimeout(() => { window.__pronto = true }, 300)
}
