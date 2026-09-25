import BlocoBase, { Grade, SubTitulo } from './BlocoBase'
import StatTile from './StatTile'

export default function BlocoLaboratorio({ perfil, dados }) {
  const { pedidos, ensaios } = dados.geral
  const minhas = dados.porUsuario.minhasOS(perfil.id)
  const solicitadosGeral = dados.periodo.solicitados.length
  const finalizadosGeral = dados.periodo.finalizados.length
  const concluidasMinhas = dados.periodo.finalizadosPorLaboratorista(perfil.id)

  return (
    <>
      <BlocoBase icone="🔬" titulo="Geral do laboratório">
        <SubTitulo>Pedidos</SubTitulo>
        <Grade>
          <StatTile valor={pedidos.aguardandoLab} rotulo="Aguardando laboratório" tom="pendente"
            href="/laboratorio?v=todas&status=aguardando_lab,em_analise" />
          <StatTile valor={pedidos.emAndamento} rotulo="Em andamento" tom="info"
            href="/laboratorio?v=todas&status=em_andamento,aguardando_revisao" />
          <StatTile valor={pedidos.devolvidos} rotulo="Devolvidos para correção" tom="erro" destaque={pedidos.devolvidos > 0}
            href="/laboratorio?v=todas&status=devolvido_campo" />
          <StatTile valor={solicitadosGeral} rotulo="Solicitados no período" tom="neutro"
            href="/laboratorio?v=todas" />
          <StatTile valor={finalizadosGeral} rotulo="Finalizados no período" tom="ok"
            href="/laboratorio?v=todas&status=concluido" />
        </Grade>
        <SubTitulo>Ensaios</SubTitulo>
        <Grade>
          <StatTile valor={ensaios.aguardandoLab} rotulo="Aguardando laboratório" tom="pendente" />
          <StatTile valor={ensaios.emAndamento} rotulo="Em andamento" tom="info" />
          <StatTile valor={ensaios.emRevisao} rotulo="Em revisão" tom="alerta" />
          <StatTile valor={ensaios.devolvidos} rotulo="Devolvidos para correção" tom="erro" />
        </Grade>
      </BlocoBase>

      <BlocoBase icone="🗂️" titulo="Minhas O.S.">
        <Grade>
          <StatTile valor={minhas.analise} rotulo="Em análise" tom="pendente" href="/laboratorio?v=minhas&s=analise" />
          <StatTile valor={minhas.campo} rotulo="Com o campo" tom="erro" href="/laboratorio?v=minhas&s=campo" />
          <StatTile valor={minhas.andamento} rotulo="Em andamento" tom="info" href="/laboratorio?v=minhas&s=andamento" />
          <StatTile valor={minhas.revisao} rotulo="Para revisar" tom="alerta" destaque={minhas.revisao > 0} href="/laboratorio?v=minhas&s=revisao" />
          <StatTile valor={minhas.finalizar} rotulo="Para finalizar" tom="ok" destaque={minhas.finalizar > 0} href="/laboratorio?v=minhas&s=finalizar" />
          <StatTile valor={concluidasMinhas} rotulo="Concluídas no período" tom="ok" href="/laboratorio?v=minhas&s=concluidas" />
        </Grade>
      </BlocoBase>
    </>
  )
}
