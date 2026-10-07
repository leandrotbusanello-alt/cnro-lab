import BlocoBase, { Grade } from './BlocoBase'
import StatTile from './StatTile'

export default function BlocoAssistente({ perfil, dados }) {
  const meu = dados.porUsuario.assistente(perfil.id)
  const aprovados = dados.periodo.aprovadosPorAssistente(perfil.id)
  const aprovadosAux = dados.periodo.aprovadosComoAuxiliar?.(perfil.id) || 0
  const { ensaios } = dados.geral

  return (
    <>
      <BlocoBase icone="🧪" titulo="Assistente">
        <Grade>
          <StatTile valor={meu.aFazer} rotulo="A fazer" tom="pendente" href="/assistente?status=pendente" />
          <StatTile valor={meu.emAndamento} rotulo="Em andamento" tom="info" href="/assistente?status=em_andamento" />
          <StatTile valor={meu.devolvidos} rotulo="Devolvidos para correção" tom="erro" destaque={meu.devolvidos > 0} href="/assistente?status=devolvido" />
          {meu.comoAuxiliar > 0 && <StatTile valor={meu.comoAuxiliar} rotulo="Como auxiliar (em aberto)" tom="neutro" href="/assistente" />}
          <StatTile valor={aprovados} rotulo={aprovadosAux > 0 ? `Aprovados no período (${aprovadosAux} como auxiliar)` : 'Aprovados no período'} tom="ok" href="/assistente/enviados?status=aprovado" />
        </Grade>
      </BlocoBase>

      <BlocoBase icone="🔬" titulo="Laboratório (geral)" secundario>
        <Grade>
          <StatTile valor={ensaios.aguardandoLab} rotulo="Aguardando laboratório" tom="pendente" />
          <StatTile valor={ensaios.emAndamento} rotulo="Ensaios em andamento" tom="info" />
          <StatTile valor={ensaios.emRevisao} rotulo="Em revisão" tom="alerta" />
        </Grade>
      </BlocoBase>
    </>
  )
}
