import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import FichaGrade from './FichaGrade'
import s from './Ficha.module.css'

const MM_PX = 96 / 25.4

/**
 * Pré-visualização A4 e impressão/PDF da ficha, na escala da planilha
 * ("ajustar à página" do Excel). Só para quem tem permissão de imprimir.
 */
export default function ImpressaoFicha({ indice, motor, estado, assinaturas, titulo, onFechar }) {
  const pag = indice.modelo.pagina || {}
  const paisagem = pag.orient === 'landscape'
  const PW = (paisagem ? 297 : 210) * MM_PX
  const PH = (paisagem ? 210 : 297) * MM_PX
  const [mt, mr, mb, ml] = (pag.margens || [0.75, 0.7, 0.75, 0.7]).map(pol => pol * 96)
  const [aw, ah] = pag.ajuste || [1, 1]
  let escala = 1
  if (aw) escala = Math.min(escala, (PW - ml - mr) / indice.larguraImpressao)
  if (ah) escala = Math.min(escala, (PH - mt - mb) / indice.altura)
  const esquerda = pag.centralizar ? ml + ((PW - ml - mr) - indice.larguraImpressao * escala) / 2 : ml

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onFechar])

  return createPortal(
    <div className={s.impressao}>
      <style>{`@page { size: A4 ${paisagem ? 'landscape' : 'portrait'}; margin: 0; }`}</style>
      <div className={s.impressaoBarra}>
        <strong>{titulo}</strong>
        <div className={s.impressaoAcoes}>
          <button type="button" className={`${s.popBtn} ${s.popPrimario}`} onClick={() => window.print()}>🖨 Imprimir / PDF</button>
          <button type="button" className={s.popBtn} onClick={onFechar}>Fechar</button>
        </div>
      </div>
      <div className={s.impressaoArea}>
        <div className={s.folhaA4} style={{ width: PW, height: PH }}>
          <div style={{ position: 'absolute', left: esquerda, top: mt }}>
            <FichaGrade indice={indice} motor={motor} estado={estado} assinaturas={assinaturas} modo="leitura" escala={escala} soImpressao />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
