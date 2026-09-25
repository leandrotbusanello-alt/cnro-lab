import { useState } from 'react'
import { formatar, interpretarEntrada, textoParaEdicao } from '../motor/formatacao.js'

/**
 * Campo de digitação de uma célula da ficha (grade ou lista).
 * Mostra o valor formatado como na planilha; ao focar, mostra o valor para edição
 * (65,13 · 13/03/2026). Confirma ao sair do campo ou com Enter.
 *
 * Declarado fora dos componentes pais (evita perda de foco ao digitar no celular).
 */
export default function CampoCelula({
  id, valor, dado = 'numero', nf, multilinha = false, editavel, className, style, rotulo,
  onConfirmar, onNavegar,
}) {
  const [editando, setEditando] = useState(null)
  const invalido = !!valor && typeof valor === 'object' && 'invalido' in valor
  const formato = dado === 'data' && (!nf || !/[dmy]/i.test(nf)) ? 'dd/mm/yyyy'
    : dado === 'hora' && (!nf || !/h/i.test(nf)) ? 'h:mm' : nf
  const exibido = editando ?? (invalido ? valor.invalido : formatar(valor ?? null, dado === 'texto' ? '@' : formato))

  function confirmar() {
    if (editando === null) return
    const novo = interpretarEntrada(editando, dado)
    setEditando(null)
    const antes = JSON.stringify(valor ?? null)
    if (JSON.stringify(novo ?? null) !== antes) onConfirmar(novo)
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { setEditando(null); e.currentTarget.blur(); return }
    if (e.key === 'Enter' && (!multilinha || e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      confirmar()
      onNavegar?.(e.shiftKey ? -1 : 1)
    }
  }

  const props = {
    id,
    className,
    style,
    value: exibido,
    readOnly: !editavel,
    tabIndex: editavel ? 0 : -1,
    'aria-label': rotulo,
    'aria-invalid': invalido || undefined,
    title: invalido ? (dado === 'data' ? 'Use o formato dd/mm/aaaa' : dado === 'hora' ? 'Use o formato hh:mm, por exemplo 13:44' : 'Digite um número, por exemplo 65,13') : undefined,
    autoComplete: 'off',
    spellCheck: false,
    onFocus: e => {
      if (!editavel) return
      setEditando(textoParaEdicao(valor, dado))
      requestAnimationFrame(() => { try { e.target.select() } catch { /* campo já saiu */ } })
    },
    onChange: e => setEditando(e.target.value),
    onBlur: confirmar,
    onKeyDown,
  }

  if (multilinha) return <textarea {...props} />
  const dica = { data: 'dd/mm/aaaa', hora: 'hh:mm' }[dado]
  return <input {...props} inputMode={dado === 'numero' ? 'decimal' : dado === 'data' || dado === 'hora' ? 'numeric' : 'text'} placeholder={editavel && dica ? dica : undefined} />
}
