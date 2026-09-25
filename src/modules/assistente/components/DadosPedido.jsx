import AmostrasView from '../../laboratorio/components/AmostrasView'
import {
  numeroOS, numeroPE, nomeEmpresa, rotuloMaterial, rotuloSubtipo, dataHora,
} from '../../laboratorio/utils'
import ui from '../../laboratorio/components/ui.module.css'
import styles from './ExecucaoEnsaio.module.css'

/** Tudo o que o assistente precisa saber do material para executar o ensaio. */
export default function DadosPedido({ pedido, eo, ctx, aberto }) {
  const empresa = ctx.empresasPorId[pedido.empresa_id]
  const cat = ctx.ensaiosPorId[eo.ensaio_id]
  const ficha = ctx.fichasPorId[eo.ficha_ensaio_id]
  const itens = [
    ['O.S.', numeroOS(pedido) || '—'],
    ['Pedido', numeroPE(pedido)],
    ['Empresa / procedência', nomeEmpresa(pedido, ctx.empresasPorId)],
    ['Lote', pedido.lote || empresa?.lote || '—'],
    ['Rodovia', empresa?.rodovia || '—'],
    ['Material', rotuloMaterial(pedido.material)],
    ['Tipo', rotuloSubtipo(pedido.material, pedido.sub_tipo) || '—'],
    ['Solicitante', ctx.usuariosPorId[pedido.solicitante_id]?.nome || '—'],
    ['Pedido feito em', dataHora(pedido.created_at)],
    ['Laboratorista', ctx.usuariosPorId[pedido.laboratorista_id]?.nome || '—'],
    ['Ensaio', `${eo.nome_ensaio || cat?.nome || '—'}${cat?.norma ? ` · ${cat.norma}` : ''}`],
    ['Ficha', ficha ? `${ficha.codigo} — ${ficha.nome}` : 'Não definida'],
    ['Atribuído em', dataHora(eo.data_atribuicao)],
  ]

  return (
    <details className={styles.dados} open={aberto}>
      <summary>Dados do pedido e das amostras</summary>
      <div className={ui.pilha}>
        <div className={ui.kv}>
          {itens.map(([k, v]) => (
            <div key={k} className={ui.kvItem}>
              <span className={ui.kvChave}>{k}</span>
              <span className={ui.kvValor}>{v}</span>
            </div>
          ))}
        </div>
        {pedido.observacoes && (
          <div className={`${ui.aviso} ${ui.avisoInfo}`}><strong>Observações do campo:</strong>&nbsp;{pedido.observacoes}</div>
        )}
        <AmostrasView pedido={pedido} />
      </div>
    </details>
  )
}
