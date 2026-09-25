import { useMemo, useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { PERFIS, PERFIS_POR_ID, SENHA_PADRAO, perfisGerenciaveis, rotuloPerfil } from '../constants'
import { alterarStatus, criarUsuario, editarUsuario, resetarSenha } from '../gestorRepo'
import ArquivoUsuario from './ArquivoUsuario'
import Avatar from './Avatar'
import styles from '../gestor.module.css'

const VAZIO = { nome: '', email: '', cargo: '', perfil: '', empresa_id: '' }

function formDe(u) {
  if (!u) return VAZIO
  return {
    nome: u.nome || '',
    email: u.email || '',
    cargo: u.cargo || '',
    perfil: String(u.perfil || '').toUpperCase(),
    empresa_id: u.empresa_id || '',
  }
}

function rotuloEmpresa(e) {
  return `${e.nome}${e.lote ? ` — Lote ${e.lote}` : ''}${e.ativo === false ? ' (inativa)' : ''}`
}

/**
 * Cadastro / edição de usuário.
 * usuario = null → novo usuário.
 */
export default function ModalUsuario({ usuario, empresas, eu, online, fotoUrl, onSalvo, onAbrir, notificar, onFechar }) {
  const novo = !usuario
  const [form, setForm] = useState(() => formDe(usuario))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [confirmar, setConfirmar] = useState(null) // 'reset' | 'inativar' | 'reativar'
  const [resultado, setResultado] = useState(null) // { tipo: 'criado' | 'reset', usuario }

  const perfilEu = eu?.perfil
  const gerenciaveis = perfisGerenciaveis(perfilEu)
  const proprio = !novo && usuario.id === eu?.id
  const perfilAlvo = String(usuario?.perfil || '').toUpperCase()
  const podeEditar = novo || proprio || gerenciaveis.includes(perfilAlvo)
  const podeMudarPerfil = podeEditar && !proprio
  const podeAcesso = !novo && !proprio && gerenciaveis.includes(perfilAlvo)
  const ativo = (usuario?.status || 'Ativo') === 'Ativo'

  const opcoesPerfil = useMemo(() => {
    const ids = new Set(gerenciaveis)
    if (!novo) ids.add(perfilAlvo)
    return PERFIS.filter(p => ids.has(p.id))
  }, [gerenciaveis, novo, perfilAlvo])

  const opcoesEmpresa = useMemo(
    () => empresas.filter(e => e.ativo !== false || e.id === usuario?.empresa_id),
    [empresas, usuario?.empresa_id],
  )

  const original = formDe(usuario)
  const alterado = novo || Object.keys(form).some(k => String(form[k] || '') !== String(original[k] || ''))
  const empresaSoTexto = !novo && !usuario.empresa_id && usuario.empresa

  function set(campo, valor) { setForm(f => ({ ...f, [campo]: valor })); setErro('') }

  async function executar(fn) {
    setSalvando(true); setErro('')
    try {
      await fn()
    } catch (e) {
      setErro(e.message || 'Não foi possível concluir.')
    } finally {
      setSalvando(false)
    }
  }

  function salvar(e) {
    e?.preventDefault()
    if (!form.nome.trim()) { setErro('Informe o nome.'); return }
    if (!form.email.trim()) { setErro('Informe o e-mail.'); return }
    if (!form.perfil) { setErro('Escolha o perfil.'); return }
    const dados = { ...form, empresa_id: form.empresa_id || null }
    executar(async () => {
      if (novo) {
        const r = await criarUsuario(dados)
        onSalvo(r.usuario)
        setResultado({ tipo: 'criado', usuario: r.usuario })
      } else {
        const r = await editarUsuario({ id: usuario.id, ...dados })
        onSalvo(r.usuario)
        notificar('Usuário atualizado.')
        onFechar()
      }
    })
  }

  function confirmarAcao() {
    const acao = confirmar
    executar(async () => {
      if (acao === 'reset') {
        const r = await resetarSenha(usuario.id)
        onSalvo(r.usuario)
        setResultado({ tipo: 'reset', usuario: r.usuario, loginCriado: r.loginCriado })
      } else {
        const r = await alterarStatus(usuario.id, acao === 'inativar' ? 'Inativo' : 'Ativo')
        onSalvo(r.usuario)
        if (r.aviso) notificar(r.aviso, 'warning')
        else notificar(acao === 'inativar'
          ? 'Usuário inativado. O acesso foi bloqueado.'
          : 'Usuário reativado.')
      }
      setConfirmar(null)
    })
  }

  const fechar = salvando ? undefined : onFechar

  // ── Tela de resultado (login criado / senha resetada) ─────────────────────
  if (resultado) {
    const u = resultado.usuario
    return (
      <Modal
        titulo={resultado.tipo === 'criado' ? 'Usuário criado' : (resultado.loginCriado ? 'Login criado' : 'Senha resetada')}
        subtitulo={u.nome}
        onFechar={onFechar}
        rodape={<>
          {resultado.tipo === 'criado' && (
            <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => onAbrir(u)}>
              Cadastrar assinatura / foto
            </button>
          )}
          <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} onClick={onFechar}>Concluir</button>
        </>}
      >
        <div className={styles.form}>
          <div className={`${styles.aviso} ${styles.avisoOk}`}>
            {resultado.tipo === 'criado'
              ? 'Cadastro e login criados. Passe os dados abaixo para o usuário.'
              : 'A senha voltou para a senha padrão. Passe os dados abaixo para o usuário.'}
          </div>
          <dl className={styles.credencial}>
            <dt>E-mail</dt><dd>{u.email}</dd>
            <dt>Senha</dt><dd>{SENHA_PADRAO}</dd>
          </dl>
          <p className={styles.ajuda}>
            No primeiro acesso o sistema pedirá que o usuário crie uma senha pessoal.
          </p>
        </div>
      </Modal>
    )
  }

  // ── Formulário ────────────────────────────────────────────────────────────
  return (
    <Modal
      titulo={novo ? 'Novo usuário' : (podeEditar ? 'Editar usuário' : 'Usuário')}
      subtitulo={novo ? `Senha inicial: ${SENHA_PADRAO} (troca obrigatória no primeiro acesso)` : usuario.email}
      onFechar={fechar}
      rodape={podeEditar ? <>
        <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} onClick={onFechar} disabled={salvando}>
          Cancelar
        </button>
        <button type="submit" form="form-usuario" className={`${styles.btn} ${styles.btnPrimario}`}
          disabled={salvando || !online || !alterado}>
          {salvando && !confirmar ? 'Salvando...' : (novo ? 'Criar usuário' : 'Salvar')}
        </button>
      </> : (
        <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} onClick={onFechar}>Fechar</button>
      )}
    >
      <form id="form-usuario" className={styles.form} onSubmit={salvar}>
        {!novo && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Avatar nome={usuario.nome} url={fotoUrl} grande />
            <div className={styles.celula}>
              <div className={styles.nome}>{usuario.nome}{proprio && ' (você)'}</div>
              <div className={styles.selos} style={{ justifyContent: 'flex-start', marginTop: 4 }}>
                <span className={`${styles.badge} ${styles['perfil' + perfilAlvo] || styles.neutro}`}>{rotuloPerfil(perfilAlvo)}</span>
                {ativo
                  ? <span className={`${styles.badge} ${styles.ok}`}>Ativo</span>
                  : <span className={`${styles.badge} ${styles.erro}`}>Inativo</span>}
                {!usuario.auth_id && <span className={`${styles.badge} ${styles.alerta}`}>Sem login</span>}
                {usuario.auth_id && usuario.trocar_senha && <span className={`${styles.badge} ${styles.info}`}>Senha provisória</span>}
              </div>
            </div>
          </div>
        )}

        {!podeEditar && (
          <div className={`${styles.aviso} ${styles.avisoInfo}`}>
            Somente o Desenvolvedor (DEV) pode alterar usuários com perfil {rotuloPerfil(perfilAlvo)}.
          </div>
        )}
        {!online && (
          <div className={`${styles.aviso} ${styles.avisoAlerta}`}>Sem conexão: não é possível salvar agora.</div>
        )}

        <label className={styles.campo}>
          <span className={styles.rotulo}>Nome completo <span className={styles.obrigatorio}>*</span></span>
          <input className={styles.input} value={form.nome} onChange={e => set('nome', e.target.value)}
            disabled={!podeEditar} required autoFocus={novo} />
        </label>

        <div className={styles.grade2}>
          <label className={styles.campo}>
            <span className={styles.rotulo}>E-mail (login) <span className={styles.obrigatorio}>*</span></span>
            <input className={styles.input} type="email" value={form.email}
              onChange={e => set('email', e.target.value)} disabled={!podeEditar} required autoComplete="off" />
          </label>
          <label className={styles.campo}>
            <span className={styles.rotulo}>Cargo</span>
            <input className={styles.input} value={form.cargo} onChange={e => set('cargo', e.target.value)}
              disabled={!podeEditar} placeholder="Ex.: Laboratorista, Técnico de campo" />
          </label>
        </div>

        <div className={styles.grade2}>
          <label className={styles.campo}>
            <span className={styles.rotulo}>Perfil <span className={styles.obrigatorio}>*</span></span>
            <select className={styles.input} value={form.perfil} onChange={e => set('perfil', e.target.value)}
              disabled={!podeMudarPerfil} required>
              <option value="">Selecione...</option>
              {opcoesPerfil.map(p => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
            </select>
            {form.perfil && <span className={styles.ajuda}>{PERFIS_POR_ID[form.perfil]?.descricao}</span>}
            {proprio && <span className={styles.ajuda}>Você não pode alterar o próprio perfil.</span>}
          </label>
          <label className={styles.campo}>
            <span className={styles.rotulo}>Empresa</span>
            <select className={styles.input} value={form.empresa_id} onChange={e => set('empresa_id', e.target.value)}
              disabled={!podeEditar}>
              <option value="">— Nenhuma —</option>
              {opcoesEmpresa.map(e => <option key={e.id} value={e.id}>{rotuloEmpresa(e)}</option>)}
            </select>
            {empresaSoTexto && (
              <span className={styles.ajuda}>
                Cadastro antigo: “{usuario.empresa}{usuario.lote ? ` / Lote ${usuario.lote}` : ''}”. Selecione a empresa na lista para vincular.
              </span>
            )}
          </label>
        </div>

        {erro && <div className={`${styles.aviso} ${styles.avisoErro}`}>{erro}</div>}
      </form>

      {/* ── Acesso: senha e status ── */}
      {podeAcesso && (
        <div className={styles.secao} style={{ marginTop: 14 }}>
          <div className={styles.secaoTitulo}>Acesso</div>
          {confirmar ? (
            <div className={styles.confirmacao}>
              <div className={`${styles.aviso} ${confirmar === 'inativar' ? styles.avisoErro : styles.avisoAlerta}`}>
                {confirmar === 'reset' && (usuario.auth_id
                  ? `A senha de ${usuario.nome} voltará para ${SENHA_PADRAO} e será pedida uma nova no próximo acesso. Confirma?`
                  : `Será criado o login de ${usuario.nome} (${usuario.email}) com a senha ${SENHA_PADRAO}. Confirma?`)}
                {confirmar === 'inativar' && `${usuario.nome} perderá o acesso imediatamente (inclusive em aparelhos já conectados). Confirma?`}
                {confirmar === 'reativar' && `${usuario.nome} voltará a ter acesso com a senha atual. Confirma?`}
              </div>
              <div className={styles.acoes}>
                <button type="button" className={`${styles.btn} ${styles.btnSecundario} ${styles.btnPequeno}`}
                  onClick={() => setConfirmar(null)} disabled={salvando}>Cancelar</button>
                <button type="button"
                  className={`${styles.btn} ${confirmar === 'inativar' ? styles.btnPerigo : styles.btnPrimario} ${styles.btnPequeno}`}
                  onClick={confirmarAcao} disabled={salvando || !online}>
                  {salvando ? 'Aguarde...' : 'Confirmar'}
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.acoes}>
              <button type="button" className={`${styles.btn} ${styles.btnSecundario} ${styles.btnPequeno}`}
                onClick={() => setConfirmar('reset')} disabled={!online || salvando || !ativo}
                title={!ativo ? 'Reative o usuário antes de resetar a senha' : ''}>
                {usuario.auth_id ? `🔑 Resetar senha (${SENHA_PADRAO})` : '🔑 Criar login'}
              </button>
              {ativo ? (
                <button type="button" className={`${styles.btn} ${styles.btnPerigo} ${styles.btnPequeno}`}
                  onClick={() => setConfirmar('inativar')} disabled={!online || salvando}>
                  Inativar usuário
                </button>
              ) : (
                <button type="button" className={`${styles.btn} ${styles.btnOk} ${styles.btnPequeno}`}
                  onClick={() => setConfirmar('reativar')} disabled={!online || salvando}>
                  Reativar usuário
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Assinatura e foto ── */}
      {!novo && (
        <div className={styles.secao} style={{ marginTop: 14 }}>
          <div className={styles.secaoTitulo}>Assinatura e foto</div>
          <div className={styles.arquivos}>
            <ArquivoUsuario usuario={usuario} tipo="assinatura" podeEditar={podeEditar && online}
              onAtualizado={onSalvo} notificar={notificar} />
            <ArquivoUsuario usuario={usuario} tipo="foto" podeEditar={podeEditar && online}
              onAtualizado={onSalvo} notificar={notificar} />
          </div>
        </div>
      )}
    </Modal>
  )
}
