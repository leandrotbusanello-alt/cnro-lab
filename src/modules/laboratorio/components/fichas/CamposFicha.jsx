import { data as formatarData } from '../../utils'
import s from './fichas.module.css'

/**
 * Campo da ficha: input quando editável, texto quando somente leitura/impressão.
 * tipo: 'text' | 'date' | 'textarea'
 */
export function Valor({ valor, onChange, editavel, tipo = 'text', className = '', placeholder, alinhar = 'center', vazio = '' }) {
  const estilo = { textAlign: alinhar }
  if (!editavel) {
    const texto = tipo === 'date' ? (valor ? formatarData(valor) : '') : (valor ?? '')
    return <span className={`${s.valor} ${className}`} style={estilo}>{texto || vazio}</span>
  }
  if (tipo === 'textarea') {
    return (
      <textarea
        className={`${s.entrada} ${s.entradaArea} ${className}`}
        value={valor ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
      />
    )
  }
  return (
    <input
      type={tipo}
      className={`${s.entrada} ${className}`}
      style={estilo}
      value={valor ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  )
}

/** Caixa de seleção no estilo da planilha */
export function Caixa({ marcado, onChange, editavel, rotulo }) {
  const conteudo = (
    <span className={s.caixa} aria-hidden="true">
      {marcado && (
        <svg viewBox="0 0 10 10"><path d="M1.5 5.2 L4 7.6 L8.6 2.2" fill="none" stroke="#000" strokeWidth="1.4" /></svg>
      )}
    </span>
  )
  if (!editavel) return conteudo
  return (
    <button
      type="button"
      className={s.caixaBotao}
      role="checkbox"
      aria-checked={!!marcado}
      aria-label={rotulo}
      onClick={() => onChange(!marcado)}
    >
      {conteudo}
    </button>
  )
}

/** Cabeçalho padrão dos formulários controlados */
export function CabecalhoFicha({ titulo, codigo, logo, cab }) {
  return (
    <table className={s.cabecalho}>
      <colgroup><col style={{ width: '55%' }} /><col style={{ width: '45%' }} /></colgroup>
      <tbody>
        <tr className={s.cabTitulo}>
          <td>Título: <b>{titulo}</b></td>
          <td className={s.cabLogo}><img src={logo} alt="Nova Rota do Oeste" /></td>
        </tr>
        <tr><td>Tipo de Documento: <b>{cab.tipo}</b></td><td>Codificação: <b>{codigo}</b></td></tr>
        <tr><td>Data de Vigência: <b>{cab.vigencia}</b></td><td>Versão: <b>{cab.versao}</b></td></tr>
        <tr><td>Fase: <b>{cab.fase}</b></td><td>Nível: <b>{cab.nivel}</b></td></tr>
        <tr className={s.linhaVazia}><td colSpan={2} /></tr>
      </tbody>
    </table>
  )
}

/** Rodapé "Elaborado / Revisado / Aprovado por" */
export function RodapeFicha({ responsaveis }) {
  return (
    <table className={s.rodape}>
      <colgroup><col style={{ width: '14%' }} /><col /></colgroup>
      <tbody>
        <tr className={s.linhaVazia}><td colSpan={2} /></tr>
        <tr><td>Elaborado por:</td><td><b>{responsaveis.elaborado}</b></td></tr>
        <tr><td>Revisado por:</td><td><b>{responsaveis.revisado}</b></td></tr>
        <tr><td>Aprovado por:</td><td><b>{responsaveis.aprovado}</b></td></tr>
      </tbody>
    </table>
  )
}
