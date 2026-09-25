import { useEffect, useRef, useState } from 'react'
import { LIMITE_ASSINATURA_MB, LIMITE_FOTO_MB } from '../constants'
import { urlArquivo } from '../gestorRepo'
import styles from '../gestor.module.css'

const CONFIG = {
  assinatura: {
    titulo: 'Assinatura',
    aceita: 'image/png',
    tipos: ['image/png'],
    limiteMb: LIMITE_ASSINATURA_MB,
    ajuda: `PNG com fundo transparente, até ${LIMITE_ASSINATURA_MB} MB.`,
    erroTipo: 'A assinatura deve ser um arquivo PNG (de preferência com fundo transparente).',
  },
  foto: {
    titulo: 'Foto',
    aceita: 'image/png,image/jpeg,image/webp',
    tipos: ['image/png', 'image/jpeg', 'image/webp'],
    limiteMb: LIMITE_FOTO_MB,
    ajuda: `JPG, PNG ou WEBP, até ${LIMITE_FOTO_MB} MB.`,
    erroTipo: 'A foto deve ser JPG, PNG ou WEBP.',
  },
}

/**
 * Campo de arquivo do formulário de usuário (assinatura ou foto).
 * Não envia nada sozinho: guarda a escolha até o "Salvar" do formulário.
 *   valor = { arquivo: File | null, remover: boolean }
 */
export default function CampoArquivo({ usuario, tipo, valor, onChange, obrigatorio, opcional, desabilitado, erroExterno }) {
  const cfg = CONFIG[tipo]
  const caminhoAtual = usuario?.[tipo === 'assinatura' ? 'assinatura_url' : 'foto_url'] || null
  const [urlAtual, setUrlAtual] = useState(null)
  const [urlNova, setUrlNova] = useState(null)
  const [erro, setErro] = useState('')
  const input = useRef(null)

  // Imagem já cadastrada (Storage privado → URL temporária)
  useEffect(() => {
    let ativo = true
    setUrlAtual(null)
    if (caminhoAtual) urlArquivo(usuario, tipo).then(u => { if (ativo) setUrlAtual(u) })
    return () => { ativo = false }
  }, [caminhoAtual]) // eslint-disable-line react-hooks/exhaustive-deps

  // Prévia do arquivo escolhido
  useEffect(() => {
    if (!valor.arquivo) { setUrlNova(null); return }
    const u = URL.createObjectURL(valor.arquivo)
    setUrlNova(u)
    return () => URL.revokeObjectURL(u)
  }, [valor.arquivo])

  function escolher(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErro('')
    if (!cfg.tipos.includes(file.type)) { setErro(cfg.erroTipo); return }
    if (file.size > cfg.limiteMb * 1024 * 1024) { setErro(`Arquivo maior que ${cfg.limiteMb} MB.`); return }
    onChange({ arquivo: file, remover: false })
  }

  const temAtual = !!caminhoAtual && !valor.remover
  const exibida = urlNova || (temAtual ? urlAtual : null)
  const vazio = !valor.arquivo && !temAtual

  return (
    <div className={`${styles.arquivo} ${obrigatorio && vazio && erroExterno ? styles.arquivoErro : ''}`}>
      <span className={styles.rotulo}>
        {cfg.titulo}{' '}
        {obrigatorio && <span className={styles.obrigatorio}>*</span>}
        {opcional && <span className={styles.ajuda}>(opcional)</span>}
      </span>
      <div className={styles.previa}>
        {exibida ? <img src={exibida} alt={cfg.titulo} />
          : temAtual ? 'Carregando...'
          : obrigatorio ? 'Obrigatória — escolha o arquivo'
          : 'Nenhuma'}
      </div>
      <span className={styles.ajuda}>
        {valor.arquivo ? `Novo arquivo: ${valor.arquivo.name} (será salvo ao confirmar)`
          : valor.remover ? 'Será removida ao salvar.'
          : cfg.ajuda}
      </span>

      {erro && <div className={`${styles.aviso} ${styles.avisoErro}`}>{erro}</div>}

      {!desabilitado && (
        <div className={styles.acoes}>
          <input ref={input} type="file" accept={cfg.aceita} className={styles.arquivoInput} onChange={escolher} />
          <button type="button" className={`${styles.btn} ${styles.btnSecundario} ${styles.btnPequeno}`}
            onClick={() => input.current?.click()}>
            {vazio ? 'Escolher arquivo' : 'Trocar'}
          </button>
          {valor.arquivo && (
            <button type="button" className={`${styles.btn} ${styles.btnSecundario} ${styles.btnPequeno}`}
              onClick={() => onChange({ arquivo: null, remover: false })}>
              Desfazer
            </button>
          )}
          {!valor.arquivo && temAtual && !obrigatorio && (
            <button type="button" className={`${styles.btn} ${styles.btnPerigo} ${styles.btnPequeno}`}
              onClick={() => onChange({ arquivo: null, remover: true })}>
              Remover
            </button>
          )}
          {valor.remover && (
            <button type="button" className={`${styles.btn} ${styles.btnSecundario} ${styles.btnPequeno}`}
              onClick={() => onChange({ arquivo: null, remover: false })}>
              Manter
            </button>
          )}
        </div>
      )}
    </div>
  )
}
