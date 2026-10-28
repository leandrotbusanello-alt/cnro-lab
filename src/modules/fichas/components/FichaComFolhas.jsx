import { useState } from 'react'
import FichaEnsaio from './FichaEnsaio'
import PainelRupturas from './PainelRupturas'
import { qtdFolhas, estadoDaFolha, comFolha, adicionarFolha, removerFolha } from '../motor/folhas.js'
import s from './Ficha.module.css'

/**
 * Ficha com folhas adicionais (decisão de 20/10/2026): quando o ensaio não cabe numa ficha
 * (ex.: mais CPs do que linhas), quem preenche acrescenta outra folha da mesma ficha.
 * A folha nova vem com o cabeçalho da anterior; cada folha calcula as suas médias.
 * Mesmo ensaio: uma revisão, uma aprovação, as mesmas assinaturas em todas as folhas.
 *
 *   <FichaComFolhas {...props da FichaEnsaio} motores={ficha.motores} podeGerenciarFolhas />
 *
 * podeGerenciarFolhas: mostra "+ Adicionar folha" e "Excluir esta folha" (preenchimento, antes do envio).
 * Fichas sem folha adicional ficam exatamente como antes (sem barra de folhas, a não ser o botão).
 */
export default function FichaComFolhas({ motores, podeGerenciarFolhas = false, estado, onEstado, idBase = 'ficha', fotos, rupturaObrigatoria = true, ...props }) {
  const n = qtdFolhas(estado)
  const [ativa, setAtiva] = useState(0)
  const i = Math.min(ativa, n - 1)
  const assinada = props.modo === 'preencher' && !!props.assinaturas?.executor
  const travar = assinada || props.modo === 'leitura'

  function adicionar() {
    onEstado?.(adicionarFolha(props.indice, estado))
    setAtiva(n)
  }

  function excluir() {
    if (!i) return
    if (!window.confirm(`Excluir a folha ${i + 1}? O que foi digitado nela será apagado.`)) return
    onEstado?.(removerFolha(estado, i))
    setAtiva(i - 1)
  }

  const mostrarBarra = n > 1 || podeGerenciarFolhas

  return (
    <div>
      {mostrarBarra && (
        <div className={s.folhasBarra} role="tablist" aria-label="Folhas da ficha">
          {n > 1 && Array.from({ length: n }, (_, k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={k === i}
              className={k === i ? s.folhaAtiva : ''}
              onClick={() => setAtiva(k)}
            >
              Folha {k + 1}
            </button>
          ))}
          {podeGerenciarFolhas && (
            <button type="button" className={s.folhaNova} onClick={adicionar} disabled={travar}
              title={assinada ? 'Remova a assinatura para acrescentar uma folha' : 'Acrescentar outra folha desta ficha (o cabeçalho vem preenchido)'}>
              + Adicionar folha
            </button>
          )}
          {podeGerenciarFolhas && i > 0 && (
            <button type="button" className={s.folhaExcluir} onClick={excluir} disabled={travar}>
              🗑 Excluir esta folha
            </button>
          )}
        </div>
      )}
      <FichaEnsaio
        key={i}
        {...props}
        motor={motores?.[i] || motores?.[0]}
        estado={estadoDaFolha(estado, i)}
        onEstado={novo => onEstado?.(comFolha(estado, i, novo))}
        idBase={i ? `${idBase}-f${i + 1}` : idBase}
        fotos={i ? undefined : fotos}
      />
      {props.indice?.rupturas && (props.modo !== 'leitura' || Object.keys(estadoDaFolha(estado, i)?.rupturas || {}).length > 0) && (
        <PainelRupturas
          key={`r${i}`}
          indice={props.indice}
          motor={motores?.[i] || motores?.[0]}
          estado={estadoDaFolha(estado, i)}
          onEstado={novo => onEstado?.(comFolha(estado, i, novo))}
          editavel={(props.modo === 'preencher' && !props.assinaturas?.executor) || (props.modo === 'revisao' && !props.assinaturas?.calculista)}
          obrigatorio={rupturaObrigatoria}
        />
      )}
    </div>
  )
}
