import { useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { salvarEmpresa } from '../gestorRepo'
import styles from '../gestor.module.css'

function chave(nome, lote) {
  return `${String(nome || '').trim().toLowerCase()}|${String(lote || '').trim().toLowerCase()}`
}

/** Cadastro / edição de empresa (uma linha por empresa + lote). */
export default function ModalEmpresa({ empresa, empresas, qtdUsuarios, online, onSalvo, notificar, onFechar }) {
  const nova = !empresa
  const [form, setForm] = useState({
    nome: empresa?.nome || '',
    lote: empresa?.lote || '',
    rodovia: empresa?.rodovia || '',
    ativo: empresa ? empresa.ativo !== false : true,
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  function set(campo, valor) { setForm(f => ({ ...f, [campo]: valor })); setErro('') }

  const loteSemNumero = form.lote.trim() !== '' && !/\d/.test(form.lote)
  const duplicada = empresas.find(e => e.id !== empresa?.id && chave(e.nome, e.lote) === chave(form.nome, form.lote))
  const alterado = nova
    || form.nome !== (empresa.nome || '') || form.lote !== (empresa.lote || '')
    || form.rodovia !== (empresa.rodovia || '') || form.ativo !== (empresa.ativo !== false)
  const renomeou = !nova && qtdUsuarios > 0 && (form.nome !== (empresa.nome || '') || form.lote !== (empresa.lote || ''))

  async function salvar(e) {
    e.preventDefault()
    if (!form.nome.trim()) { setErro('Informe o nome da empresa.'); return }
    if (duplicada) { setErro('Já existe uma empresa com esse nome e lote.'); return }
    setSalvando(true); setErro('')
    try {
      const salva = await salvarEmpresa({ ...form, id: empresa?.id })
      onSalvo(salva)
      notificar(nova ? 'Empresa cadastrada.' : 'Empresa atualizada.')
      onFechar()
    } catch (err) {
      setErro(err.message || 'Não foi possível salvar.')
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo={nova ? 'Nova empresa' : 'Editar empresa'}
      subtitulo={nova ? 'Uma linha por empresa/consórcio e lote' : empresa.nome}
      onFechar={salvando ? undefined : onFechar}
      rodape={<>
        <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} onClick={onFechar} disabled={salvando}>
          Cancelar
        </button>
        <button type="submit" form="form-empresa" className={`${styles.btn} ${styles.btnPrimario}`}
          disabled={salvando || !online || !alterado}>
          {salvando ? 'Salvando...' : (nova ? 'Cadastrar' : 'Salvar')}
        </button>
      </>}
    >
      <form id="form-empresa" className={styles.form} onSubmit={salvar}>
        {!online && (
          <div className={`${styles.aviso} ${styles.avisoAlerta}`}>Sem conexão: não é possível salvar agora.</div>
        )}

        <label className={styles.campo}>
          <span className={styles.rotulo}>Nome da empresa / consórcio <span className={styles.obrigatorio}>*</span></span>
          <input className={styles.input} value={form.nome} onChange={e => set('nome', e.target.value)}
            required autoFocus={nova} />
          <span className={styles.ajuda}>Aparece como “Obra” nas fichas FR-IMOB-04 e FR-IMOB-05.</span>
        </label>

        <div className={styles.grade2}>
          <label className={styles.campo}>
            <span className={styles.rotulo}>Lote</span>
            <input className={styles.input} value={form.lote} onChange={e => set('lote', e.target.value)}
              placeholder="Ex.: 01" />
            {loteSemNumero
              ? <span className={styles.ajuda} style={{ color: '#b45309' }}>O lote precisa ter um número para compor o nº da O.S.</span>
              : <span className={styles.ajuda}>Usado no número da O.S. (AAAA.MM.DD.<strong>LL</strong>.SSSS).</span>}
          </label>
          <label className={styles.campo}>
            <span className={styles.rotulo}>Rodovia</span>
            <input className={styles.input} value={form.rodovia} onChange={e => set('rodovia', e.target.value)}
              placeholder="Ex.: BR-163" />
          </label>
        </div>

        {!nova && (
          <label className={styles.check}>
            <input type="checkbox" checked={form.ativo} onChange={e => set('ativo', e.target.checked)} />
            Empresa ativa
          </label>
        )}
        {!nova && !form.ativo && empresa.ativo !== false && (
          <div className={`${styles.aviso} ${styles.avisoAlerta}`}>
            Empresa inativa não aparece para novos cadastros de usuário. Pedidos e usuários já vinculados não são alterados.
          </div>
        )}
        {renomeou && (
          <div className={`${styles.aviso} ${styles.avisoInfo}`}>
            O novo nome/lote será aplicado também aos {qtdUsuarios} usuário(s) vinculado(s).
          </div>
        )}
        {duplicada && <div className={`${styles.aviso} ${styles.avisoErro}`}>Já existe uma empresa com esse nome e lote.</div>}
        {erro && !duplicada && <div className={`${styles.aviso} ${styles.avisoErro}`}>{erro}</div>}
      </form>
    </Modal>
  )
}
