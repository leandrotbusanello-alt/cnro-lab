// ─────────────────────────────────────────────────────────────────────────────
// Assinatura: corta as margens em branco/transparentes da imagem, para que ela
// ocupe o espaço da assinatura na ficha (apontamento de 06/10/2026).
// Usado no envio (Gestor) e na exibição (assinaturas já cadastradas).
// ─────────────────────────────────────────────────────────────────────────────

function carregarImagem(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * Blob (PNG/JPG) → Blob PNG recortado. Se não der para recortar, devolve o original.
 * Fundo detectado pelos cantos da imagem (branco, quase branco, cinza claro de escaneamento ou
 * transparente); "tinta" é o que se distancia do fundo. Pontos soltos (sujeira do scan) não contam:
 * a linha/coluna precisa ter alguns pixels de tinta (apontamento de 08/10/2026 — assinatura pequena).
 */
export async function recortarAssinatura(blob, { margem = 6, distancia = 60 } = {}) {
  if (!blob || typeof document === 'undefined') return blob
  const url = URL.createObjectURL(blob)
  try {
    const img = await carregarImagem(url)
    const w = img.naturalWidth, h = img.naturalHeight
    if (!w || !h) return blob
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0)
    const { data } = ctx.getImageData(0, 0, w, h)
    // fundo = média dos 4 cantos (5×5 px)
    let fr = 0, fg = 0, fb = 0, fa = 0, n = 0
    for (const [cx, cy] of [[0, 0], [w - 5, 0], [0, h - 5], [w - 5, h - 5]]) {
      for (let y = Math.max(0, cy); y < Math.min(h, cy + 5); y++) {
        for (let x = Math.max(0, cx); x < Math.min(w, cx + 5); x++) {
          const i = (y * w + x) * 4
          fr += data[i]; fg += data[i + 1]; fb += data[i + 2]; fa += data[i + 3]; n++
        }
      }
    }
    fr /= n; fg /= n; fb /= n; fa /= n
    const fundoTransparente = fa < 128
    const tinta = i => {
      const a = data[i + 3]
      if (a <= 24) return false
      if (fundoTransparente) return true
      const d = Math.abs(data[i] - fr) + Math.abs(data[i + 1] - fg) + Math.abs(data[i + 2] - fb)
      return d > distancia
    }
    // tinta em cada pixel (uma vez só)
    const marca = new Uint8Array(w * h)
    for (let k = 0; k < w * h; k++) marca[k] = tinta(k * 4) ? 1 : 0
    // limites em passadas alternadas: linhas (dentro das colunas atuais), depois colunas (dentro das linhas atuais).
    // Sujeira isolada longe da assinatura cai fora numa das passadas.
    const minimo = 2      // pixels de tinta para a linha/coluna contar
    let x0 = 0, x1 = w - 1, y0 = 0, y1 = h - 1
    for (let passada = 0; passada < 3 && x1 >= x0 && y1 >= y0; passada++) {
      const porLinha = new Uint32Array(h)
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) porLinha[y] += marca[y * w + x]
      while (y0 <= y1 && porLinha[y0] < minimo) y0++
      while (y1 >= y0 && porLinha[y1] < minimo) y1--
      if (y1 < y0) break
      const porColuna = new Uint32Array(w)
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) porColuna[x] += marca[y * w + x]
      while (x0 <= x1 && porColuna[x0] < minimo) x0++
      while (x1 >= x0 && porColuna[x1] < minimo) x1--
    }
    if (x1 < x0 || y1 < y0) x1 = -1
    if (x1 < 0) return blob
    x0 = Math.max(0, x0 - margem); y0 = Math.max(0, y0 - margem)
    x1 = Math.min(w - 1, x1 + margem); y1 = Math.min(h - 1, y1 + margem)
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1
    if (cw >= w * 0.98 && ch >= h * 0.98) return blob   // já sem sobra
    const out = document.createElement('canvas')
    out.width = cw; out.height = ch
    out.getContext('2d').drawImage(canvas, x0, y0, cw, ch, 0, 0, cw, ch)
    return await new Promise(resolve => out.toBlob(b => resolve(b || blob), 'image/png'))
  } catch {
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}
