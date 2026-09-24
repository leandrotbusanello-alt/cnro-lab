import { OPCOES_LANCAMENTO } from '../../constants'
import FieldGroup from '../FieldGroup'
import styles from './Subcategoria.module.css'

export default function CampoConcreto({ dados, onChange }) {
  const set = (k, v) => onChange({ ...dados, [k]: v })
  const F = ({ label, name, type = 'text', options, required }) => (
    <label className={styles.field}>
      <span className={styles.label}>{label}{required && <span className={styles.req}> *</span>}</span>
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

  return (
    <div className={styles.wrapper}>
      <FieldGroup grid={2}>
        <F label="Traço / Classe do Concreto" name="traco"    required />
        <F label="fck de Projeto (MPa)"        name="fck"      type="number" required />
        <F label="Slump (mm)"                  name="slump"    type="number" />
        <F label="Forma de Lançamento"         name="lancamento" options={OPCOES_LANCAMENTO} />
        <F label="Local de Aplicação"          name="local_aplicacao" />
        <F label="Estrutura / Elemento"        name="elemento" />
        <F label="Quantidade de CPs"           name="qtd_cps"  type="number" />
        <F label="Idade de Ruptura (dias)"     name="idade_ruptura" type="number" />
        <F label="Data de Concretagem"         name="data_concretagem" type="date" />
        <F label="Responsável pela Coleta"     name="responsavel_coleta" />
      </FieldGroup>
    </div>
  )
}
