import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { arquivoSalvar, arquivoObter, arquivosListar, arquivoRemover } from '../../lib/offlineDB'

// ─────────────────────────────────────────────────────────────────────────────
// Campo de foto das fichas (quadros "Inserir foto", p.ex. FR-IMOB-27 Adesividade)
//
// 1. O usuário tira/escolhe a foto → reduzida no aparelho (lado maior 1600 px, JPEG)
// 2. Guardada no aparelho (IndexedDB, chave "fotoficha:<ensaio>:<célula>:<hora>") → funciona sem internet
// 3. Enviada ao Storage (bucket privado "fotos"), na pasta do próprio usuário (regra do bucket):
//      <usuarios.id>/fichas/<ensaios_os.id>/<célula>-<hora>.jpg
// 4. estado.fotos[célula] = { local, caminho, em } — sem caminho = ainda não enviada
//
// A ficha só pode ser enviada para revisão / aprovada com todas as fotos no servidor.
// Trocar ou remover uma foto não apaga o arquivo antigo do Storage (pode estar num rascunho já salvo).
// ─────────────────────────────────────────────────────────────────────────────

const BUCKET = 'fotos'
const LADO_MAXIMO = 1600
const QUALIDADE = 0.82
const prefixoLocal = ensaioOsId => `fotoficha:${ensaioOsId}:`

/** Reduz a foto (câmeras de celular geram 4–12 MB) para um JPEG leve, na orientação correta. */
export async function reduzirImagem(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Não foi possível abrir a imagem. Use uma foto JPG ou PNG.'))
      i.src = url
    })
    const k = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * k))
    const h = Math.max(1, Math.round(img.naturalHeight * k))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', QUALIDADE))
    return blob || file
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function enviarAoStorage(usuarioId, ensaioOsId, celula, blob) {
  const nome = celula.replace(/[^A-Za-z0-9]/g, '_')
  const caminho = `${usuarioId}/fichas/${ensaioOsId}/${nome}-${Date.now()}.jpg`
  const { error } = await supabase.storage.from(BUCKET)
    .upload(caminho, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error('Falha ao enviar a foto: ' + error.message)
  return caminho
}

// ── URLs para exibir (cópia do aparelho ou link temporário do Storage) ───────

const urlsLocais = new Map()          // chave local → objectURL
const urlsAssinadas = new Map()       // caminho → { url, expira }

export async function urlDaFoto(foto) {
  if (!foto) return null
  if (foto.local) {
    if (urlsLocais.has(foto.local)) return urlsLocais.get(foto.local)
    const blob = await arquivoObter(foto.local).catch(() => null)
    if (blob) {
      const u = URL.createObjectURL(blob)
      urlsLocais.set(foto.local, u)
      return u
    }
  }
  if (foto.caminho) {
    const c = urlsAssinadas.get(foto.caminho)
    if (c && c.expira > Date.now()) return c.url
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(foto.caminho, 3600)
    if (error || !data?.signedUrl) return null
    urlsAssinadas.set(foto.caminho, { url: data.signedUrl, expira: Date.now() + 50 * 60 * 1000 })
    return data.signedUrl
  }
  return null
}

/** URL da foto para um <img>: { url, carregando, indisponivel } */
export function useUrlFoto(foto) {
  const chave = foto ? `${foto.local || ''}|${foto.caminho || ''}` : ''
  const [r, setR] = useState({ chave: '', url: null })
  useEffect(() => {
    if (!chave) return undefined
    let ativo = true
    urlDaFoto(foto).then(url => { if (ativo) setR({ chave, url }) }).catch(() => { if (ativo) setR({ chave, url: null }) })
    return () => { ativo = false }
  }, [chave]) // eslint-disable-line react-hooks/exhaustive-deps
  const pronto = r.chave === chave
  return { url: pronto ? r.url : null, carregando: !!chave && !pronto, indisponivel: !!chave && pronto && !r.url }
}

/** Apaga as cópias locais das fotos de um ensaio (depois de enviado para revisão). */
export async function apagarFotosLocais(ensaioOsId) {
  const chaves = await arquivosListar(prefixoLocal(ensaioOsId))
  for (const c of chaves) await arquivoRemover(c)
}

export function contarPendentes(estado) {
  return Object.values(estado?.fotos || {}).filter(f => f && f.local && !f.caminho).length
}

/**
 * Fotos de uma ficha em edição.
 *   const fotos = useFotosFicha({ ensaioOsId, usuarioId, estado, onEstado })
 *   <FichaEnsaio … fotos={fotos} />
 * Envia cada foto assim que é tirada (ou quando a internet volta).
 */
export function useFotosFicha({ ensaioOsId, usuarioId, estado, onEstado }) {
  const atual = useRef(estado)
  atual.current = estado
  const enviando = useRef(new Set())
  const [erro, setErro] = useState(null)
  const [ocupadas, setOcupadas] = useState(0)

  const gravar = useCallback((celula, valor) => {
    const fotos = { ...(atual.current?.fotos || {}) }
    if (valor) fotos[celula] = valor
    else delete fotos[celula]
    const novo = { ...atual.current, fotos }
    atual.current = novo
    onEstado?.(novo)
  }, [onEstado])

  const enviarUma = useCallback(async celula => {
    const f = atual.current?.fotos?.[celula]
    if (!f?.local || f.caminho || enviando.current.has(f.local) || !usuarioId || !ensaioOsId) return
    enviando.current.add(f.local)
    setOcupadas(n => n + 1)
    try {
      const blob = await arquivoObter(f.local)
      if (!blob) throw new Error('A foto não está mais neste aparelho. Tire a foto de novo.')
      const caminho = await enviarAoStorage(usuarioId, ensaioOsId, celula, blob)
      // só grava se a foto não foi trocada enquanto enviava
      if (atual.current?.fotos?.[celula]?.local === f.local) gravar(celula, { ...atual.current.fotos[celula], caminho })
      setErro(null)
    } catch (e) {
      setErro(/fetch|network/i.test(e.message || '') ? 'Sem conexão: a foto será enviada quando a internet voltar.' : e.message)
    } finally {
      enviando.current.delete(f.local)
      setOcupadas(n => n - 1)
    }
  }, [usuarioId, ensaioOsId, gravar])

  /** Envia as fotos que ainda estão só no aparelho. Retorna quantas continuam pendentes. */
  const enviarPendentes = useCallback(async () => {
    if (navigator.onLine) {
      await Promise.all(Object.keys(atual.current?.fotos || {}).map(enviarUma))
    }
    return contarPendentes(atual.current)
  }, [enviarUma])

  const adicionar = useCallback(async (celula, file) => {
    setErro(null)
    try {
      const blob = await reduzirImagem(file)
      const chave = `${prefixoLocal(ensaioOsId)}${celula}:${Date.now()}`
      await arquivoSalvar(chave, blob)
      gravar(celula, { local: chave, em: new Date().toISOString() })
      if (navigator.onLine) enviarUma(celula)
    } catch (e) {
      setErro(e.message)
    }
  }, [ensaioOsId, gravar, enviarUma])

  const remover = useCallback(celula => gravar(celula, null), [gravar])

  useEffect(() => {
    const aoVoltar = () => { enviarPendentes() }
    window.addEventListener('online', aoVoltar)
    return () => window.removeEventListener('online', aoVoltar)
  }, [enviarPendentes])

  // fotos tiradas sem internet (ou antes de fechar o app): envia ao abrir a ficha
  const carregado = !!estado
  useEffect(() => {
    if (carregado && navigator.onLine) enviarPendentes()
  }, [carregado, ensaioOsId, usuarioId]) // eslint-disable-line react-hooks/exhaustive-deps

  const pendentes = contarPendentes(estado)
  /** Estado mais recente (já com os caminhos das fotos recém-enviadas, antes de a tela redesenhar). */
  const estadoAtual = useCallback(() => atual.current, [])
  return useMemo(() => ({
    adicionar, remover, enviarPendentes, estadoAtual, pendentes, enviando: ocupadas > 0, erro,
  }), [adicionar, remover, enviarPendentes, estadoAtual, pendentes, ocupadas, erro])
}
