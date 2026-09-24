import { OPCOES_CAMADA, OPCOES_PISTA, OPCOES_FAIXA, OPCOES_LADO } from '../../constants'
import FieldGroup from '../FieldGroup'
import styles from './Subcategoria.module.css'

// Declarado FORA do componente pai para evitar perda de foco ao digitar no mobile
function FormField({ label, name, type = 'text', options, required, dados, onChange }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}{required && <span className={styles.req}> *</span>}</span>
      {options ? (
        <select className={styles.input} value={dados[name] || ''} onChange={e => onChange(name, e.target.value)}>
          <option value="">Selecione…</option>
          {options.map(o => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} className={styles.input} value={dados[name] || ''} onChange={e => onChange(name, e.target.value)} />
      )}
    </label>
  )
}

export default function CampoAsfalto({ subcategoria, dados, onChange }) {
  const set = (k, v) => onChange({ ...dados, [k]: v })
  const F = (props) => <FormField {...props} dados={dados} onChange={set} />

  if (subcategoria === 'massa_asfaltica') {
    return (
      <div className={styles.wrapper}>
        <FieldGroup grid={2}>
          <F label="Tipo de Mistura / DNIT" name="tipo_mistura" required />
          <F label="Usina de Origem"         name="usina" />
          <F label="Temperatura na Usina (°C)"  name="temp_usina"  type="number" />
          <F label="Temperatura na Pista (°C)"  name="temp_pista"  type="number" />
          <F label="Camada" name="camada" options={OPCOES_CAMADA} />
          <F label="Pista"  name="pista"  options={OPCOES_PISTA}  />
          <F label="Faixa"  name="faixa"  options={OPCOES_FAIXA}  />
          <F label="Estaca Inicial" name="estaca_inicial" />
          <F label="Estaca Final"   name="estaca_final"   />
          <F label="Espessura de Projeto (cm)" name="espessura_projeto" type="number" />
          <F label="CAP Utilizado" name="cap" />
          <F label="Data de Aplicação" name="data_aplicacao" type="date" />
        </FieldGroup>
      </div>
    )
  }

  if (subcategoria === 'cps_extraidos_pista') {
    return (
      <div className={styles.wrapper}>
        <FieldGroup grid={2}>
          <F label="Tipo de Mistura / DNIT" name="tipo_mistura" required />
          <F label="Camada" name="camada" options={OPCOES_CAMADA} />
          <F label="Pista"  name="pista"  options={OPCOES_PISTA}  />
          <F label="Faixa"  name="faixa"  options={OPCOES_FAIXA}  />
          <F label="Lado"   name="lado"   options={OPCOES_LADO}   />
          <F label="Estaca de Extração" name="estaca_extracao" />
          <F label="Data de Extração"   name="data_extracao" type="date" />
          <F label="Quantidade de CPs"  name="qtd_cps"      type="number" />
          <F label="Diâmetro dos CPs (mm)" name="diametro_cps" type="number" />
          <F label="Data da Execução do Serviço" name="data_execucao" type="date" />
        </FieldGroup>
      </div>
    )
  }

  if (subcategoria === 'ligante_asfaltico') {
    return (
      <div className={styles.wrapper}>
        <FieldGroup grid={2}>
          <F label="Tipo de Ligante (CAP / Emulsão)" name="tipo_ligante" required />
          <F label="Fornecedor" name="fornecedor" />
          <F label="Nota Fiscal / Lote" name="nota_fiscal" />
          <F label="Temperatura de Coleta (°C)" name="temp_coleta" type="number" />
          <F label="Volume Coletado (L)"         name="volume"      type="number" />
          <F label="Data de Coleta" name="data_coleta" type="date" />
        </FieldGroup>
      </div>
    )
  }

  return null
}
