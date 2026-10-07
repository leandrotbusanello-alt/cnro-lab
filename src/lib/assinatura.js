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

/** Blob (PNG/JPG) → Blob PNG recortado. Se não der para recortar, devolve o original. */
export async function recortarAssinatura(blob, { margem = 6, limiar = 235 } = {}) {
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
    let x0 = w, y0 = h, x1 = -1, y1 = -1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const a = data[i + 3]
        // pixel de tinta: visível e não (quase) branco
        if (a > 24 && !(data[i] > limiar && data[i + 1] > limiar && data[i + 2] > limiar)) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      }
    }
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
