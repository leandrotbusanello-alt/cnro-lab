import { lazy } from 'react'

const CHAVE = 'cnro_recarga_chunk'

/**
 * React.lazy que se recupera de uma versão nova publicada com o app aberto:
 * os arquivos antigos deixam de existir e o import falha. Nesse caso recarrega
 * a página uma vez para pegar a versão atual (sem entrar em loop).
 */
export function lazyComRecarga(importar) {
  return lazy(() => importar()
    .then(m => {
      try { sessionStorage.removeItem(CHAVE) } catch { /* armazenamento indisponível */ }
      return m
    })
    .catch(e => {
      let jaRecarregou = true
      try { jaRecarregou = sessionStorage.getItem(CHAVE) === '1' } catch { /* idem */ }
      if (!jaRecarregou && navigator.onLine) {
        try { sessionStorage.setItem(CHAVE, '1') } catch { /* idem */ }
        window.location.reload()
        return new Promise(() => {})   // aguarda a recarga
      }
      throw e
    }))
}
