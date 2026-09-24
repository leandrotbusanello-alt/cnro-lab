import { OPCOES_PISTA, OPCOES_FAIXA, OPCOES_LADO } from '../../constants'
import FieldGroup from '../FieldGroup'
import styles from './Subcategoria.module.css'

export default function CampoEspecial({ subcategoria, dados, onChange }) {
  const set = (k, v) => onChange({ ...dados, [k]: v })
  const F = ({ label, name, type = 'text', options }) => (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {options ? (
        <select className={styles.input} value={dados[name] || ''} onChange={e => set(name, e.target.value)}>
          <option value="">Selecione…</option>
          {options.map(o => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} className={styles.input} value={dados[name] || ''} onChange={e => set(name, e.target.value)} />
      )}
    </label>
  )

  const locBase = (
    <>
      <F label="Trecho" name="trecho" />
      <F label="Estaca" name="estaca" />
      <F label="Pista"  name="pista"  options={OPCOES_PISTA}  />
      <F label="Faixa"  name="faixa"  options={OPCOES_FAIXA}  />
      <F label="Lado"   name="lado"   options={OPCOES_LADO}   />
    </>
  )

  if (subcategoria === 'deflectometria') {
    return (
      <div className={styles.wrapper}>
        <FieldGroup grid={2}>
          {locBase}
          <F label="Equipamento (Benkelman / FWD)" name="equipamento" />
          <F label="Carga (kN)" name="carga" type="number" />
          <F label="Data do Ensaio" name="data_ensaio" type="date" />
        </FieldGroup>
      </div>
    )
  }

  if (subcategoria === 'mancha_areia') {
    return (
      <div className={styles.wrapper}>
        <FieldGroup grid={2}>
          {locBase}
          <F label="Areia Utilizada (g)" name="massa_areia" type="number" />
          <F label="Data do Ensaio"      name="data_ensaio" type="date" />
        </FieldGroup>
      </div>
    )
  }

  if (subcategoria === 'pendulo_britanico') {
    return (
      <div className={styles.wrapper}>
        <FieldGroup grid={2}>
          {locBase}
          <F label="Condição da Superfície" name="condicao" />
          <F label="Data do Ensaio" name="data_ensaio" type="date" />
        </FieldGroup>
      </div>
    )
  }

  if (subcategoria === 'densimetro') {
    return (
      <div className={styles.wrapper}>
        <FieldGroup grid={2}>
          {locBase}
          <F label="N° do Densímetro" name="num_densimetro" />
          <F label="Profundidade (cm)" name="profundidade" type="number" />
          <F label="Umidade de Projeto (%)" name="umidade_projeto" type="number" />
          <F label="Densidade de Projeto (g/cm³)" name="dens_projeto" type="number" />
          <F label="Data do Ensaio" name="data_ensaio" type="date" />
        </FieldGroup>
      </div>
    )
  }

  return null
}
