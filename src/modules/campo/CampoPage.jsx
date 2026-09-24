import { useState } from 'react'
import MeusPedidos from './components/MeusPedidos'
import NovoPedidoForm from './components/NovoPedidoForm'
import styles from './CampoPage.module.css'

export default function CampoPage() {
  const [view, setView] = useState('lista') // 'lista' | 'novo' | 'corrigir'
  const [pedidoParaCorrigir, setPedidoParaCorrigir] = useState(null)

  function handleCorrigir(pedido) {
    setPedidoParaCorrigir(pedido)
    setView('corrigir')
  }

  function handleVoltar() {
    setPedidoParaCorrigir(null)
    setView('lista')
  }

  if (view === 'novo') {
    return <NovoPedidoForm onVoltar={handleVoltar} />
  }

  if (view === 'corrigir' && pedidoParaCorrigir) {
    return <NovoPedidoForm pedidoInicial={pedidoParaCorrigir} onVoltar={handleVoltar} modoCorrecao />
  }

  return (
    <MeusPedidos
      onNovoPedido={() => setView('novo')}
      onCorrigir={handleCorrigir}
    />
  )
}
