import BlocoBase, { Grade, SubTitulo } from './BlocoBase'
import StatTile from './StatTile'
import styles from './TabelaPorTipo.module.css'

/**
 * Bloco Gestor/DEV. "Comentários recentes" fica para a Entrega 2 (ainda não
 * construída — ver claude/CNRO_Lab_Painel_Interno_Escopo.md, seção 3).
 */
export default function BlocoGestor({ dados }) {
  const { pedidos, ensaios } = dados.geral
  const p = dados.periodo

  return (
    <BlocoBase icone="⚙️" titulo="Gestor / DEV">
      <SubTitulo>Pedidos</SubTitulo>
      <Grade>
        <StatTile valor={pedidos.aguardandoLab} rotulo="Aguardando laboratório" tom="pendente" href="/laboratorio?v=todas&status=aguardando_lab,em_analise" />
        <StatTile valor={pedidos.emAndamento} rotulo="Em andamento" tom="info" href="/laboratorio?v=todas&status=em_andamento,aguardando_revisao" />
        <StatTile valor={pedidos.devolvidos} rotulo="Devolvidos para correção" tom="erro" href="/laboratorio?v=todas&status=devolvido_campo" />
        <StatTile valor={p.solicitadosTotal} rotulo="Solicitados no período" tom="neutro" href="/laboratorio?v=todas" />
        <StatTile valor={p.finalizadosTotal} rotulo="Finalizados no período" tom="ok" href="/laboratorio?v=todas&status=concluido" />
        <StatTile valor={p.canceladosTotal} rotulo="Cancelados no período" tom="neutro" />
      </Grade>

      <SubTitulo>Ensaios</SubTitulo>
      <Grade>
        <StatTile valor={ensaios.aguardandoLab} rotulo="Aguardando laboratório" tom="pendente" />
        <StatTile valor={ensaios.emAndamento} rotulo="Em andamento" tom="info" />
        <StatTile valor={ensaios.emRevisao} rotulo="Em revisão" tom="alerta" />
        <StatTile valor={p.aprovadosTotal} rotulo="Aprovados no período" tom="ok" />
      </Grade>

      <SubTitulo>Ensaios por tipo, no período</SubTitulo>
      {p.porTipo.length === 0 ? (
        <p className={styles.vazio}>Nenhum ensaio solicitado ou aprovado neste período.</p>
      ) : (
        <div className={styles.tabelaWrap}>
          <table className={styles.tabela}>
            <thead>
              <tr><th>Ensaio</th><th>Solicitados</th><th>Aprovados</th></tr>
            </thead>
            <tbody>
              {p.porTipo.map(l => (
                <tr key={l.nome}>
                  <td>{l.nome}</td>
                  <td>{l.solicitados}</td>
                  <td>{l.aprovados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </BlocoBase>
  )
}
