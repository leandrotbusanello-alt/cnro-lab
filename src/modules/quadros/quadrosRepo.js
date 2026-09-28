import { supabase } from '../../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Dados dos quadros de controle (somente leitura, sempre online)
//   pedidos do material do quadro (todas as datas: a "análise global" usa tudo)
//   → ensaios APROVADOS desses pedidos (dados_resultado)
//   → linhas das tabelas resultado_* dos ensaios (pelo resultado_id)
//   → obra da O.S. (fichas_os.obra), para o agrupamento do concreto (FR-IMOB-43)
// ─────────────────────────────────────────────────────────────────────────────

const LOTE = 150          // ids por consulta .in()
const PAGINA = 1000       // linhas por página

async function paginado(montar) {
  const out = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await montar().range(de, de + PAGINA - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < PAGINA) return out
  }
}

async function emLotes(ids, consulta) {
  const out = []
  for (let i = 0; i < ids.length; i += LOTE) out.push(...await consulta(ids.slice(i, i + LOTE)))
  return out
}

/**
 * @param def  definição do quadro (definicoes.js)
 * @returns { pedidos, ensaios: [{ pedido_id, dados_resultado, resultados: { tabela: [linhas] } }], obraPorFichaOs }
 */
export async function carregarDadosQuadro(def) {
  const pedidos = await paginado(() => supabase.from('pedidos_ensaio')
    .select('id, numero_pe, sequencial, ano, material, sub_tipo, dados_amostra, empresa, empresa_id, lote, created_at, ficha_os_id, status')
    .eq('material', def.material).eq('sub_tipo', def.subTipo)
    .neq('status', 'cancelado')
    .order('created_at', { ascending: true }))

  const ensaios = await emLotes(pedidos.map(p => p.id), async ids => {
    const { data, error } = await supabase.from('ensaios_os')
      .select('id, pedido_id, dados_resultado, resultado_id')
      .in('pedido_id', ids).eq('status', 'aprovado')
    if (error) throw error
    return data || []
  })

  const porResultado = new Map(ensaios.filter(e => e.resultado_id).map(e => [e.resultado_id, e]))
  for (const e of ensaios) e.resultados = {}
  const idsRes = [...porResultado.keys()]
  for (const tabela of def.tabelas || []) {
    const linhas = await emLotes(idsRes, async ids => {
      const { data, error } = await supabase.from(tabela).select('*').in('resultado_id', ids)
      if (error) throw error
      return data || []
    })
    for (const l of linhas) {
      const e = porResultado.get(l.resultado_id)
      if (e) (e.resultados[tabela] ||= []).push(l)
    }
  }

  const obraPorFichaOs = {}
  const idsOs = [...new Set(pedidos.map(p => p.ficha_os_id).filter(Boolean))]
  if (def.concreto && idsOs.length) {
    const os = await emLotes(idsOs, async ids => {
      const { data, error } = await supabase.from('fichas_os').select('id, obra').in('id', ids)
      if (error) throw error
      return data || []
    })
    for (const o of os) obraPorFichaOs[o.id] = o.obra
  }
  return { pedidos, ensaios, obraPorFichaOs, carregadoEm: new Date() }
}

const MODELOS = import.meta.glob('./modelos/*.json', { import: 'default' })

/** Modelo de layout do quadro (gerado por tools/fichas/quadros/gerar_quadros.py), carregado sob demanda. */
export async function carregarModeloQuadro(codigo) {
  const f = MODELOS[`./modelos/${codigo}.json`]
  if (!f) throw new Error(`Modelo do quadro ${codigo} não encontrado.`)
  return f()
}
