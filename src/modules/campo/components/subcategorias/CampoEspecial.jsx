import styles from './Subcategoria.module.css'
import { OPCOES_PISTA, OPCOES_FAIXA, OPCOES_LADO } from '../../constants'

function F({ label, name, type = 'text', options, required, dados, onChange, placeholder }) {
  const handleChange = e => onChange({ ...dados, [name]: e.target.value })
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}{required && <span className={styles.req}> *</span>}</span>
      {options ? (
        <select className={styles.input} value={dados[name] || ''} onChange={handleChange}>
          <option value="">Selecione…</option>
          {options.map(o => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={type}
          className={styles.input}
          value={dados[name] || ''}
          onChange={handleChange}
          placeholder={placeholder}
        />
      )}
    </label>
  )
}

// Localização comum a todos os ensaios especiais
function LocalizacaoEspecial({ dados, onChange }) {
  const p = { dados, onChange }
  return (
    <>
      <F {...p} label="Pista"  name="pista"  options={OPCOES_PISTA} />
      <F {...p} label="Faixa"  name="faixa"  options={OPCOES_FAIXA} />
      <F {...p} label="Lado"   name="lado"   options={OPCOES_LADO}  />
      <F {...p} label="Estaca" name="estaca" placeholder="Ex: 200+00" />
    </>
  )
}

export default function CampoEspecial({ subcategoria, dados, onChange }) {

  // ── Deflectometria ────────────────────────────────────────────────────────
  if (subcategoria === 'deflectometria') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.grid2}>
          <F dados={dados} onChange={onChange}
            label="Equipamento" name="equipamento"
            placeholder="Ex: Viga Benkelman, FWD" required />
          <F dados={dados} onChange={onChange}
            label="Estaca Inicial" name="estaca_inicial" placeholder="Ex: 100+00" />
          <F dados={dados} onChange={onChange}
            label="Estaca Final"   name="estaca_final"   placeholder="Ex: 200+00" />
          <F dados={dados} onChange={onChange}
            label="Intervalo entre Pontos (m)" name="intervalo" type="number" placeholder="Ex: 20" />
          <LocalizacaoEspecial dados={dados} onChange={onChange} />
          <F dados={dados} onChange={onChange}
            label="Data Desejada para o Ensaio" name="data_desejada" type="date" />
          <F dados={dados} onChange={onChange}
            label="Observações do Campo" name="obs_campo"
            placeholder="Condições da superfície, restrições…" />
        </div>
      </div>
    )
  }

  // ── Mancha de Areia ───────────────────────────────────────────────────────
  if (subcategoria === 'mancha_areia') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.grid2}>
          <LocalizacaoEspecial dados={dados} onChange={onChange} />
          <F dados={dados} onChange={onChange}
            label="Quantidade de Pontos" name="qtd_pontos" type="number" placeholder="Ex: 10" />
          <F dados={dados} onChange={onChange}
            label="Data Desejada para o Ensaio" name="data_desejada" type="date" />
          <F dados={dados} onChange={onChange}
            label="Observações" name="obs_campo"
            placeholder="Condições da superfície…" />
        </div>
      </div>
    )
  }

  // ── Pêndulo Britânico ─────────────────────────────────────────────────────
  if (subcategoria === 'pendulo_britanico') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.grid2}>
          <LocalizacaoEspecial dados={dados} onChange={onChange} />
          <F dados={dados} onChange={onChange}
            label="Quantidade de Pontos" name="qtd_pontos" type="number" placeholder="Ex: 5" />
          <F dados={dados} onChange={onChange}
            label="Data Desejada para o Ensaio" name="data_desejada" type="date" />
          <F dados={dados} onChange={onChange}
            label="Observações" name="obs_campo" placeholder="Estado da superfície…" />
        </div>
      </div>
    )
  }

  // ── Densímetro Nuclear ────────────────────────────────────────────────────
  if (subcategoria === 'densimetro') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.grid2}>
          <F dados={dados} onChange={onChange}
            label="Camada" name="camada" placeholder="Ex: Base, Sub-base" required />
          <F dados={dados} onChange={onChange}
            label="Profundidade (cm)" name="profundidade" type="number" placeholder="Ex: 30" />
          <LocalizacaoEspecial dados={dados} onChange={onChange} />
          <F dados={dados} onChange={onChange}
            label="Quantidade de Pontos" name="qtd_pontos" type="number" placeholder="Ex: 10" />
          <F dados={dados} onChange={onChange}
            label="Data Desejada para o Ensaio" name="data_desejada" type="date" />
        </div>
      </div>
    )
  }

  // ── Outros ────────────────────────────────────────────────────────────────
  if (subcategoria === 'outros') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.grid2}>
          <F dados={dados} onChange={onChange}
            label="Descrição do Ensaio" name="descricao_ensaio"
            placeholder="Descreva o ensaio necessário" required />
          <F dados={dados} onChange={onChange}
            label="Data Desejada para o Ensaio" name="data_desejada" type="date" />
          <LocalizacaoEspecial dados={dados} onChange={onChange} />
          <F dados={dados} onChange={onChange}
            label="Observações / Detalhamento" name="obs_campo"
            placeholder="Informações adicionais para a equipe do laboratório…" />
        </div>
      </div>
    )
  }

  return null
}
