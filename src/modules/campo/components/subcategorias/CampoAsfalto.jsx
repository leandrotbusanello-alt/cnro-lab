import { useState } from 'react'
import styles from './Subcategoria.module.css'
import {
  OPCOES_CAMADA_ASFALTO, OPCOES_PISTA, OPCOES_FAIXA, OPCOES_LADO,
} from '../../constants'

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

function LocalizacaoPista({ dados, onChange }) {
  const p = { dados, onChange }
  return (
    <>
      <F {...p} label="Camada" name="camada" options={OPCOES_CAMADA_ASFALTO} required />
      <F {...p} label="Pista"  name="pista"  options={OPCOES_PISTA} />
      <F {...p} label="Faixa"  name="faixa"  options={OPCOES_FAIXA} />
      <F {...p} label="Lado"   name="lado"   options={OPCOES_LADO}  />
      <F {...p} label="Estaca" name="estaca" placeholder="Ex: 280+40" />
    </>
  )
}

export default function CampoAsfalto({ subcategoria, dados, onChange, onCertificadoChange }) {
  const [nomeArquivo, setNomeArquivo] = useState('')

  function handleCertificado(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setNomeArquivo(file.name)
    onCertificadoChange?.(file)
  }

  // ── Massa Asfáltica (Usina / Pista) ───────────────────────────────────────
  if (subcategoria === 'massa_asfaltica') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.grid2}>
          <F dados={dados} onChange={onChange} label="Tipo de Mistura"     name="tipo_mistura"  placeholder="Ex: CBUQ, PMF, SMA" required />
          <F dados={dados} onChange={onChange} label="Teor de Ligante (%)" name="teor_ligante"  type="number" placeholder="Ex: 5.5" />
          <F dados={dados} onChange={onChange} label="Temperatura na Usina (°C)" name="temp_usina" type="number" placeholder="Ex: 160" />
          <F dados={dados} onChange={onChange} label="Temperatura na Pista (°C)" name="temp_pista" type="number" placeholder="Ex: 140" />

          <div className={styles.subSection} style={{ gridColumn: '1 / -1' }}>
            <p className={styles.subSectionTitle}>Localização na Pista</p>
            <div className={styles.grid2}>
              <LocalizacaoPista dados={dados} onChange={onChange} />
              <F dados={dados} onChange={onChange} label="Espessura Aplicada (cm)" name="espessura" type="number" placeholder="Ex: 5" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── CPs Extraídos de Pista ────────────────────────────────────────────────
  if (subcategoria === 'cps_extraidos_pista') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.grid2}>
          <LocalizacaoPista dados={dados} onChange={onChange} />
          <F dados={dados} onChange={onChange} label="Espessura do CP (cm)" name="espessura"   type="number" placeholder="Ex: 6" />
          <F dados={dados} onChange={onChange} label="Data de Extração"     name="data_extracao" type="date" />
          <F dados={dados} onChange={onChange} label="Quantidade de CPs"    name="qtd_cps"    type="number" placeholder="Ex: 3" />
        </div>
      </div>
    )
  }

  // ── Ligante Asfáltico (CAP / Emulsão) ────────────────────────────────────
  if (subcategoria === 'ligante_asfaltico') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.grid2}>
          <F dados={dados} onChange={onChange} label="Tipo de Ligante"        name="tipo_ligante"  placeholder="Ex: CAP 50/70, CAUQ" required />
          <F dados={dados} onChange={onChange} label="Fornecedor / Origem"    name="fornecedor"    placeholder="Ex: Petrobras" />
          <F dados={dados} onChange={onChange} label="Nota Fiscal / Remessa"  name="nota_fiscal"   placeholder="Ex: NF 12345" />
          <F dados={dados} onChange={onChange} label="Data de Coleta"         name="data_coleta"   type="date" />
        </div>

        {/* Upload do certificado de qualidade */}
        <div className={styles.subSection}>
          <p className={styles.subSectionTitle}>Certificado de Qualidade</p>
          <div className={styles.uploadArea}>
            <label className={styles.uploadLabel}>
              <span className={styles.uploadIcon}>📄</span>
              <span className={styles.uploadText}>
                {nomeArquivo || 'Clique para anexar o certificado'}
              </span>
              <span className={styles.uploadSub}>PDF, JPG ou PNG — máx. 10 MB</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className={styles.uploadInput}
                onChange={handleCertificado}
              />
            </label>
          </div>
          {nomeArquivo && (
            <p className={styles.uploadNome}>✅ {nomeArquivo}</p>
          )}
        </div>
      </div>
    )
  }

  return null
}
