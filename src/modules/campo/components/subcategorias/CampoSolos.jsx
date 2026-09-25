import styles from './Subcategoria.module.css'
import {
  OPCOES_CAMADA_SOLO, OPCOES_PISTA, OPCOES_FAIXA, OPCOES_LADO,
  OPCOES_PROCTOR, OPCOES_IDADE_RUPTURA,
} from '../../constants'

function F({ label, name, type = 'text', options, required, dados, onChange, placeholder, span }) {
  const handleChange = e => onChange({ ...dados, [name]: e.target.value })
  return (
    <label className={`${styles.field} ${span === 2 ? styles.span2 : ''}`}>
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

// Localização em campo (comum a segmento, CPs, etc.)
function LocalizacaoSegmento({ dados, onChange }) {
  const props = { dados, onChange }
  return (
    <>
      <F {...props} label="Camada" name="camada" options={OPCOES_CAMADA_SOLO} required />
      <F {...props} label="Pista"  name="pista"  options={OPCOES_PISTA}  />
      <F {...props} label="Faixa"  name="faixa"  options={OPCOES_FAIXA}  />
      <F {...props} label="Lado"   name="lado"   options={OPCOES_LADO}   />
      <F {...props} label="Estaca" name="estaca" placeholder="Ex: 345+20" />
    </>
  )
}

export default function CampoSolos({ subcategoria, dados, onChange }) {

  // ── Jazida / Caixa de Empréstimo ──────────────────────────────────────────
  if (subcategoria === 'jazida' || subcategoria === 'caixa_emprestimo') {
    const label = subcategoria === 'jazida' ? 'Identificação da Jazida' : 'Identificação da Caixa'
    return (
      <div className={styles.wrapper}>
        <div className={styles.grid2}>
          <F dados={dados} onChange={onChange} label={label}          name="jazida"           required placeholder="Ex: Jazida A" />
          <F dados={dados} onChange={onChange} label="Município"      name="municipio"        placeholder="Ex: Cuiabá - MT" />
          <F dados={dados} onChange={onChange} label="Coordenadas GPS" name="coordenadas"     placeholder="Ex: -15.5956, -56.0942" />
          <F dados={dados} onChange={onChange} label="Profundidade Coletada (m)" name="profundidade" type="number" placeholder="Ex: 1.50" />
          <F dados={dados} onChange={onChange} label="Data da Coleta" name="data_coleta"      type="date" />
        </div>
      </div>
    )
  }

  // ── Segmento / Aterro / Sub-base / Base ───────────────────────────────────
  if (subcategoria === 'segmento') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.grid2}>
          <LocalizacaoSegmento dados={dados} onChange={onChange} />
          <F dados={dados} onChange={onChange} label="Tipo de Proctor"    name="proctor"      options={OPCOES_PROCTOR} />
          <F dados={dados} onChange={onChange} label="GC Mínimo (%)"      name="gc_minimo"    type="number" placeholder="Ex: 100" />
          <F dados={dados} onChange={onChange} label="Profundidade (m)"   name="profundidade" type="number" placeholder="Ex: 0.30" />
        </div>
      </div>
    )
  }

  // ── CPs Solo-Cimento ──────────────────────────────────────────────────────
  if (subcategoria === 'cps_solo_cimento') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.grid2}>
          <LocalizacaoSegmento dados={dados} onChange={onChange} />

          <div className={styles.subSection} style={{ gridColumn: '1 / -1' }}>
            <p className={styles.subSectionTitle}>Dados dos Corpos de Prova</p>
            <div className={styles.grid2}>
              <F dados={dados} onChange={onChange} label="Teor de Cimento (%)" name="teor_cimento"  type="number" placeholder="Ex: 5" />
              <F dados={dados} onChange={onChange} label="Data de Moldagem"    name="data_moldagem" type="date" />
              <F dados={dados} onChange={onChange} label="Quantidade de CPs"   name="qtd_cps"       type="number" placeholder="Ex: 3" />
              <F dados={dados} onChange={onChange} label="Idade de Ruptura (dias)" name="idade_ruptura" options={OPCOES_IDADE_RUPTURA} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Agregados / Brita / Areia ─────────────────────────────────────────────
  if (subcategoria === 'agregados') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.grid2}>
          <F dados={dados} onChange={onChange} label="Tipo de Agregado"    name="tipo_agregado"  placeholder="Ex: Brita 1, Brita 0, Areia" />
          <F dados={dados} onChange={onChange} label="Origem / Pedreira"   name="origem"         placeholder="Ex: Pedreira São João" />
          <F dados={dados} onChange={onChange} label="Granulometria Nominal" name="granulometria" placeholder="Ex: ¾ ′′" />
          <F dados={dados} onChange={onChange} label="Quantidade (ton)"    name="quantidade"     type="number" placeholder="Ex: 500" />
          <F dados={dados} onChange={onChange} label="Local de Aplicação"  name="local_aplicacao" options={OPCOES_CAMADA_SOLO} />
          <F dados={dados} onChange={onChange} label="Data da Coleta"      name="data_coleta"    type="date" />
        </div>
      </div>
    )
  }

  return null
}
