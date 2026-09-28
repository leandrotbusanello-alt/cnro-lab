// Prévia das fichas com dados de teste (conferência de layout e impressão).
//   npx vite --config tools/fichas/previa/vite.config.mjs      → http://localhost:5199
// Parâmetros: ?ficha=FR-IMOB-37_Rev00&estado=<arquivo em estados/ | aleatorio | vazio>&modo=<impressao | ficha | lista>
// Usa os modelos de tools/fichas/saida (rode antes python3 tools/fichas/converter.py).
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: AQUI,
  plugins: [react()],
  resolve: {
    // a prévia não fala com o Supabase: fotos e sessão ficam de fora
    alias: [{ find: /^(.*\/lib\/|\.\/)supabase(\.js)?$/, replacement: resolve(AQUI, 'stub_supabase.js') }],
  },
  server: { port: 5199, strictPort: true, fs: { allow: [resolve(AQUI, '../../..')] } },
  logLevel: 'warn',
})
