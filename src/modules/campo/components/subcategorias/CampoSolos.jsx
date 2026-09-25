import { OPCOES_CAMADA, OPCOES_PISTA, OPCOES_FAIXA, OPCOES_LADO, OPCOES_PROCTOR } from '../../constants'
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

export default function CampoSolos({ subcategoria, dados, onChange }) {
  const set = (k, v) => onChange({ ...dados, [k]: v })
  const F = (props) => <FormField {...props} dados={dados} onChange={set} />

  const localizacaoComum = (
    <>
      <F label="Trecho / Segmento" name="trecho" />
      <F label="Estaca Inicial" name="estaca_inicial" />
      <F label="Estaca Final"   name="estaca_final"   />
      <F label="Camada" name="camada" options={OPCOES_CAMADA} />
      <F label="Pista"  name="pista"  options={OPCOES_PISTA}  />
      <F label="Faixa"  name="faixa"  options={OPCOES_FAIXA}  />
      <F label="Lado"   name="lado"   options={OPCOES_LADO}   />
    </>
  )

  if (subcategoria === 'jazida' || subcategoria === 'caixa_emprestimo') {
    return (
      <div className={styles.wrapper}>
        <FieldGroup grid={2}>
          <F label="Identificação da Jazida" name="jazida" required />
          <F label="Município" name="municipio" />
          <F label="Coordenadas GPS" name="coordenadas" />
          <F label="Profundidade Coletada (m)" name="profundidade" type="number" />
          <F label="Responsável pela Coleta" name="responsavel_coleta" />
          <F label="Data da Coleta" name="data_coleta" type="date" />
        </FieldGroup>
      </div>
    )
  }

  if (subcategoria === 'segmento') {
    return (
      <div className={styles.wrapper}>
        <FieldGroup grid={2}>
          {localizacaoComum}
          <F label="Tipo de Proctor" name="proctor" options={OPCOES_PROCTOR} />
          <F label="GC Mínimo (%)" name="gc_minimo" type="number" />
          <F label="Profundidade (m)" name="profundidade" type="number" />
        </FieldGroup>
      </div>
    )
  }

  if (subcategoria === 'cps_solo_cimento') {
    return (
      <div className={styles.wrapper}>
        <FieldGroup grid={2}>
          {localizacaoComum}
          <F label="Teor de Cimento (%)" name="teor_cimento" type="number" />
          <F label="Quantidade de CPs"   name="qtd_cps"      type="number" />
          <F label="Idade de Ruptura (dias)" name="idade_ruptura" type="number" />
          <F label="Data de Moldagem" name="data_moldagem" type="date" />
        </FieldGroup>
      </div>
    )
  }

  if (subcategoria === 'agregados') {
    return (
      <div className={styles.wrapper}>
        <FieldGroup grid={2}>
          <F label="Tipo de Agregado" name="tipo_agregado" />
          <F label="Origem / Pedreira" name="origem" />
          <F label="Granulometria Nominal" name="granulometria" />
          <F label="Quantidade (ton)"  name="quantidade" type="number" />
          <F label="Local de Aplicação" name="local_aplicacao" options={OPCOES_CAMADA} />
          <F label="Data da Coleta"    name="data_coleta" type="date" />
        </FieldGroup>
      </div>
    )
  }

  return null
}
