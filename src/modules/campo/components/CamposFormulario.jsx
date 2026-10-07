import { useState } from 'react'
import { normalizarKm } from '../../../lib/km'
import { statusTraco, tracosDaEmpresa } from '../../../lib/cadastros'
import styles from './subcategorias/Subcategoria.module.css'
import extra from './CamposFormulario.module.css'

const OUTRO = '__outro__'

/**
 * Grade de campos de um formulário do pedido (formularios.js).
 *   campos     lista de definições
 *   valores    objeto com os valores
 *   onChange   (patch) => void — recebe só o que mudou
 *   cadastros  { tracos, jazidas, pedreiras, fornecedores }
 *   empresaId  para filtrar os traços da empresa
 *   onArquivo  (nomeCampo, File) => void — certificado do ligante
 */
export default function CamposFormulario({ campos, valores, onChange, cadastros, empresaId, onArquivo }) {
  return (
    <div className={styles.grid2}>
      {campos.map(c => (
        <Campo
          key={`${c.nome}-${c.tipo}`}
          campo={c}
          valores={valores}
          onChange={onChange}
          cadastros={cadastros}
          empresaId={empresaId}
          onArquivo={onArquivo}
        />
      ))}
    </div>
  )
}

function Rotulo({ campo }) {
  return (
    <span className={styles.label}>
      {campo.rotulo}{campo.obrigatorio && <span className={styles.req}> *</span>}
    </span>
  )
}

function Campo({ campo: c, valores, onChange, cadastros, empresaId, onArquivo }) {
  const valor = valores?.[c.nome] ?? ''
  const set = v => onChange({ [c.nome]: v })
  const classeLarga = c.largo || c.tipo === 'opcoes' ? extra.largo : ''

  if (c.tipo === 'opcoes') {
    return (
      <div className={`${styles.field} ${classeLarga}`}>
        <Rotulo campo={c} />
        <div className={extra.opcoes}>
          {c.opcoes.map(o => (
            <button key={o} type="button" className={`${extra.opcao} ${valor === o ? extra.opcaoAtiva : ''}`} onClick={() => set(o)}>
              {o}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (c.tipo === 'fixo') {
    return (
      <label className={styles.field}>
        <Rotulo campo={c} />
        <input className={styles.input} value={c.valor} disabled />
      </label>
    )
  }

  if (c.tipo === 'lista') {
    const opcoes = valor && !c.opcoes.includes(valor) ? [valor, ...c.opcoes] : c.opcoes
    return (
      <div className={styles.field}>
        <label className={styles.field}>
          <Rotulo campo={c} />
          <select className={styles.input} value={valor} onChange={e => set(e.target.value)}>
            <option value="">Selecione…</option>
            {opcoes.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        {c.outroCampo && valor === 'Outro' && (
          <input className={styles.input} value={valores?.[c.outroCampo] || ''} placeholder="Informe a medida"
            onChange={e => onChange({ [c.outroCampo]: e.target.value })} />
        )}
      </div>
    )
  }

  if (c.tipo === 'cadastro') {
    return <CampoCadastro campo={c} valores={valores} onChange={onChange} cadastros={cadastros} empresaId={empresaId} />
  }

  if (c.tipo === 'arquivo') {
    return <CampoArquivo campo={c} valor={valor} onArquivo={onArquivo} classe={classeLarga} />
  }

  const tipoInput = { data: 'date', hora: 'time', numero: 'number' }[c.tipo] || 'text'
  return (
    <label className={styles.field}>
      <Rotulo campo={c} />
      <input
        type={tipoInput}
        inputMode={c.tipo === 'km' ? 'decimal' : undefined}
        className={styles.input}
        value={valor}
        placeholder={c.placeholder || (c.tipo === 'km' ? 'Ex.: 545,970' : undefined)}
        onChange={e => set(e.target.value)}
        onBlur={c.tipo === 'km' ? e => { const n = normalizarKm(e.target.value); if (n !== e.target.value) set(n) } : undefined}
      />
    </label>
  )
}

/** Lista vinda dos Cadastros, com "Outro (digitar)" para o que ainda não está cadastrado */
function CampoCadastro({ campo: c, valores, onChange, cadastros, empresaId }) {
  const valor = valores?.[c.nome] || ''
  const id = valores?.[c.idCampo] || ''
  const ehTraco = c.fonte === 'tracos'
  const lista = ehTraco
    ? tracosDaEmpresa(cadastros?.tracos, empresaId)
    : (cadastros?.[c.fonte] || []).filter(i => i.ativo !== false)
  const nomeDe = i => (ehTraco ? i.nome_traco : i.nome)
  const [digitando, setDigitando] = useState(!!valor && !id)

  function escolher(v) {
    if (v === OUTRO) { setDigitando(true); onChange({ [c.nome]: '', [c.idCampo]: '' }); return }
    setDigitando(false)
    const item = lista.find(i => i.id === v)
    const patch = { [c.nome]: item ? nomeDe(item) : '', [c.idCampo]: item?.id || '' }
    // jazida: município do cadastro, se ainda não informado
    if (c.fonte === 'jazidas' && item?.municipio && !valores?.municipio) patch.municipio = item.municipio
    onChange(patch)
  }

  const selecionado = lista.find(i => i.id === id) || (cadastros?.[c.fonte] || []).find(i => i.id === id)
  const st = ehTraco && selecionado ? statusTraco(selecionado) : null

  return (
    <div className={`${styles.field} ${ehTraco ? extra.largo : ''}`}>
      <label className={styles.field}>
        <Rotulo campo={c} />
        <select className={styles.input} value={digitando ? OUTRO : id} onChange={e => escolher(e.target.value)}>
          <option value="">{lista.length ? 'Selecione…' : 'Nenhum cadastrado — use "Outro"'}</option>
          {selecionado && !lista.includes(selecionado) && <option value={selecionado.id}>{nomeDe(selecionado)} (inativo)</option>}
          {lista.map(i => {
            const s = ehTraco ? statusTraco(i) : null
            const sufixo = s?.codigo === 'vencido' ? ' — VENCIDO' : s?.codigo === 'vence' ? ` — vence em ${s.dias} dia(s)` : ''
            return <option key={i.id} value={i.id}>{nomeDe(i)}{sufixo}</option>
          })}
          <option value={OUTRO}>Outro (digitar)</option>
        </select>
      </label>
      {digitando && (
        <input className={styles.input} value={valor} autoFocus
          placeholder={ehTraco ? 'Nome do traço (o laboratório cadastra depois)' : `Nome (o laboratório cadastra depois)`}
          onChange={e => onChange({ [c.nome]: e.target.value, [c.idCampo]: '' })} />
      )}
      {st?.codigo === 'vencido' && (
        <span className={extra.alerta}>⚠️ Traço vencido ({st.rotulo.toLowerCase()}). O laboratório será avisado.</span>
      )}
      {st?.codigo === 'vence' && <span className={extra.aviso}>⏳ {st.rotulo}.</span>}
    </div>
  )
}

function CampoArquivo({ campo: c, valor, onArquivo, classe }) {
  const [nome, setNome] = useState('')
  return (
    <div className={`${styles.field} ${classe}`}>
      <Rotulo campo={c} />
      <div className={styles.uploadArea}>
        <label className={styles.uploadLabel}>
          <span className={styles.uploadIcon}>📄</span>
          <span className={styles.uploadText}>
            {nome || (valor ? '📎 Arquivo já anexado — clique para trocar' : 'Clique para anexar')}
          </span>
          <span className={styles.uploadSub}>PDF, JPG ou PNG — máx. 10 MB</span>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className={styles.uploadInput}
            onChange={e => { const f = e.target.files?.[0]; if (f) { setNome(f.name); onArquivo?.(c.nome, f) } }}
          />
        </label>
      </div>
      {nome && <p className={styles.uploadNome}>✅ {nome}</p>}
    </div>
  )
}
