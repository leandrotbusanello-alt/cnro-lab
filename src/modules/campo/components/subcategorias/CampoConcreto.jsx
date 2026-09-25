import styles from './Subcategoria.module.css'
import { OPCOES_LANCAMENTO, OPCOES_IDADE_RUPTURA } from '../../constants'

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

export default function CampoConcreto({ dados, onChange }) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.grid2}>
        {/* Dados do traço / especificação */}
        <F dados={dados} onChange={onChange} label="Tipo de Concreto"      name="tipo_concreto"    placeholder="Ex: Estrutural, Pavimento" required />
        <F dados={dados} onChange={onChange} label="fck Especificado (MPa)" name="resistencia_fck"  type="number" placeholder="Ex: 25" required />
        <F dados={dados} onChange={onChange} label="Abatimento (mm)"       name="slump"            type="number" placeholder="Ex: 100" />
        <F dados={dados} onChange={onChange} label="Forma de Lançamento"   name="lancamento"       options={OPCOES_LANCAMENTO} />

        {/* Identificação do concreto / estrutura */}
        <F dados={dados} onChange={onChange} label="Estrutura / Elemento"  name="estrutura"        placeholder="Ex: Laje, Pilar, Viga" />
        <F dados={dados} onChange={onChange} label="Local / Eixo"          name="local"            placeholder="Ex: Eixo A, Bloco 2" />

        {/* Dados do ensaio */}
        <div className={styles.subSection} style={{ gridColumn: '1 / -1' }}>
          <p className={styles.subSectionTitle}>Dados dos Corpos de Prova</p>
          <div className={styles.grid2}>
            <F dados={dados} onChange={onChange} label="Data de Moldagem"        name="data_moldagem"  type="date" />
            <F dados={dados} onChange={onChange} label="Quantidade de CPs"       name="qtd_cps"        type="number" placeholder="Ex: 4" />
            <F dados={dados} onChange={onChange} label="Idade de Ruptura (dias)" name="idade_ruptura"  options={OPCOES_IDADE_RUPTURA} />
            <F dados={dados} onChange={onChange} label="Responsável pela Coleta" name="responsavel_cp" placeholder="Nome" />
          </div>
        </div>
      </div>
    </div>
  )
}
