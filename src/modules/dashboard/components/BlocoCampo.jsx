import { useEffect, useState } from 'react'
import { getPedidosPendentes } from '../../../lib/offlineDB'
import BlocoBase, { Grade } from './BlocoBase'
import StatTile from './StatTile'

export default function BlocoCampo({ perfil, dados }) {
  const [aguardandoEnvio, setAguardandoEnvio] = useState(0)

  useEffect(() => {
    let cancelado = false
    getPedidosPendentes().then(l => { if (!cancelado) setAguardandoEnvio(l.length) }).catch(() => {})
  }, [dados])

  const c = dados.porUsuario.campo(perfil.id)
  const solicitados = dados.periodo.solicitadosPorSolicitante(perfil.id)
  const finalizados = dados.periodo.finalizadosPorSolicitante(perfil.id)

  return (
    <BlocoBase icone="📱" titulo="Campo">
      <Grade>
        {aguardandoEnvio > 0 && (
          <StatTile valor={aguardandoEnvio} rotulo="Aguardando envio (neste aparelho)" tom="pendente" destaque
            href="/campo?status=pendente_sync" />
        )}
        <StatTile valor={c.aguardandoLab} rotulo="Aguardando laboratório" tom="pendente"
          href="/campo?status=aguardando_lab,em_analise" />
        <StatTile valor={c.emAndamento} rotulo="Em andamento" tom="info"
          href="/campo?status=em_andamento,aguardando_revisao" />
        <StatTile valor={c.devolvidos} rotulo="Devolvidos para correção" tom="erro" destaque={c.devolvidos > 0}
          href="/campo?status=devolvido_campo" />
        <StatTile valor={solicitados} rotulo="Solicitados no período" tom="neutro" />
        <StatTile valor={finalizados} rotulo="Finalizados no período" tom="ok"
          href="/campo?status=concluido" />
      </Grade>
    </BlocoBase>
  )
}
