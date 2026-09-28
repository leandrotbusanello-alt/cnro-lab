const guardados = new Map()
window.__uploads = []
export const supabase = {
  storage: {
    from: () => ({
      async upload(caminho, blob) {
        await new Promise(r => setTimeout(r, 300))
        if (window.__falharUpload) return { error: { message: 'Failed to fetch' } }
        guardados.set(caminho, blob); window.__uploads.push({ caminho, tamanho: blob.size, tipo: blob.type })
        return { data: { path: caminho }, error: null }
      },
      async createSignedUrl(caminho) {
        const b = guardados.get(caminho)
        return b ? { data: { signedUrl: URL.createObjectURL(b) }, error: null } : { data: null, error: { message: 'x' } }
      },
    }),
  },
}
