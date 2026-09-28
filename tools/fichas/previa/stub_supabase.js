// Substitui src/lib/supabase.js na prévia (sem rede, sem sessão).
// Consultas de leitura respondem com o banco simulado de estados/banco_quadros.json (gerado por
// tools/fichas/quadros/testar_quadros.mjs --gravar-estados), para testar a tela dos quadros de controle.
const bancos = import.meta.glob('./estados/banco_quadros.json', { eager: true, import: 'default' })
const BANCO = Object.values(bancos)[0] || {}

class Consulta {
  constructor(tabela) { this.linhas = [...(BANCO[tabela] || [])]; this.faixa = null }
  select() { return this }
  eq(c, v) { this.linhas = this.linhas.filter(l => l[c] === v); return this }
  neq(c, v) { this.linhas = this.linhas.filter(l => l[c] !== v); return this }
  in(c, vs) { const s = new Set(vs); this.linhas = this.linhas.filter(l => s.has(l[c])); return this }
  order() { return this }
  range(a, b) { this.faixa = [a, b]; return this }
  limit(n) { this.faixa = [0, n - 1]; return this }
  then(ok, falha) {
    const data = this.faixa ? this.linhas.slice(this.faixa[0], this.faixa[1] + 1) : this.linhas
    return Promise.resolve({ data, error: null }).then(ok, falha)
  }
}
const vazio = () => ({ data: null, error: null })
export const supabase = {
  from: t => new Consulta(t),
  storage: { from: () => ({ createSignedUrl: async () => vazio(), upload: async () => vazio() }) },
  auth: { getSession: async () => ({ data: { session: null } }) },
}
