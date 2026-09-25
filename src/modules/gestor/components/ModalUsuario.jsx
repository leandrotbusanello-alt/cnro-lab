import { useMemo, useState } from 'react'
import Modal from '../../../components/ui/Modal'
import {
  MODULOS, MODULOS_ATRIBUIVEIS, MODULOS_PADRAO, PERFIS, PERFIS_POR_ID, SENHA_PADRAO,
  exigeAssinatura, modulosDoUsuario, perfilTemTodos, perfisGerenciaveis, rotuloPerfil,
} from '../constants'
import {
  alterarStatus, criarUsuario, editarUsuario, enviarArquivoUsuario, removerArquivoUsuario, resetarSenha,
} from '../gestorRepo'
import CampoArquivo from './CampoArquivo'
import Avatar from './Avatar'
import styles from '../gestor.module.css'

const SEM_ARQUIVO = { arquivo: null, remover: false }

function modulosIniciais(u) {
  if (!u) return []
  return modulosDoUsuario(u).filter(m => MODULOS_ATRIBUIVEIS.includes(m))
}

function formDe(u) {
  return {
    nome: u?.nome || '',
    email: u?.email || '',
    cargo: u?.cargo || '',
    perfil: String(u?.perfil || '').toUpperCase(),
    empresa_id: u?.empresa_id || '',
    modulos: modulosIniciais(u),
  }
}

function rotuloEmpresa(e) {
  return `${e.nome}${e.lote ? ` — Lote ${e.lote}` : ''}${e.ativo === false ? ' (inativa)' : ''}`
}

const mesmaLista = (a, b) => [...a].sort().join(',') === [...b].sort().join(',')

/**
 * Cadastro / edição de usuário em uma tela só:
 * dados, módulos de acesso, assinatura (obrigatória para Laboratório/Assistente) e foto (opcional).
 * usuario = null → novo usuário.
 */
export default function ModalUsuario({ usuario, empresas, eu, online, fotoUrl, onSalvo, onAbrir, notificar, onFechar }) {
  const novo = !usuario
  const [form, setForm] = useState(() => formDe(usuario))
  const [arquivos, setArquivos] = useState({ assinatura: SEM_ARQUIVO, foto: SEM_ARQUIVO })
  const [salvando, setSalvando] = useState(false)
  const [tentou, setTentou] = useState(false)
  const [erro, setErro] = useState('')
  const [confirmar, setConfirmar] = useState(null) // 'reset' | 'inativar' | 'reativar'
  const [resultado, setResultado] = useState(null) // { tipo, usuario, loginCriado?, avisoArquivo? }

  const perfilEu = eu?.perfil
  const gerenciaveis = perfisGerenciaveis(perfilEu)
  const proprio = !novo && usuario.id === eu?.id
  const perfilAlvo = String(usuario?.perfil || '').toUpperCase()
  const podeEditar = novo || proprio || gerenciaveis.includes(perfilAlvo)
  const podeMudarPerfil = podeEditar && !proprio
  const podeAcesso = !novo && !proprio && gerenciaveis.includes(perfilAlvo)
  const ativo = (usuario?.status || 'Ativo') === 'Ativo'

  const todosModulos = perfilTemTodos(form.perfil)
  const assinaturaObrigatoria = exigeAssinatura(form.perfil, form.modulos)
  const temAssinatura = !!arquivos.assinatura.arquivo || (!!usuario?.assinatura_url && !arquivos.assinatura.remover)

  const opcoesPerfil = useMemo(() => {
    const ids = new Set(gerenciaveis)
    if (!novo) ids.add(perfilAlvo)
    return PERFIS.filter(p => ids.has(p.id))
  }, [gerenciaveis, novo, perfilAlvo])

  const opcoesEmpresa = useMemo(
    () => empresas.filter(e => e.ativo !== false || e.id === usuario?.empresa_id),
    [empresas, usuario?.empresa_id],
  )

  const original = useMemo(() => formDe(usuario), [usuario])
  const dadosAlterados = novo
    || ['nome', 'email', 'cargo', 'perfil', 'empresa_id'].some(k => String(form[k] || '') !== String(original[k] || ''))
    || (!todosModulos && !mesmaLista(form.modulos, original.modulos))
  const arquivosAlterados = Object.values(arquivos).some(a => a.arquivo || a.remover)
  const alterado = dadosAlterados || arquivosAlterados
  const empresaSoTexto = !novo && !usuario.empresa_id && usuario.empresa

  // Pendências que impedem salvar (mostradas depois da 1ª tentativa)
  const pendencias = []
  if (!form.nome.trim()) pendencias.push('Informe o nome.')
  if (!form.email.trim()) pendencias.push('Informe o e-mail.')
  if (!form.perfil) pendencias.push('Escolha o perfil.')
  if (form.perfil && !todosModulos && form.modulos.length === 0) pendencias.push('Marque pelo menos um módulo de acesso.')
  if (assinaturaObrigatoria && !temAssinatura) {
    pendencias.push('A assinatura (PNG) é obrigatória para quem tem o módulo Laboratório ou Assistente.')
  }

  function set(campo, valor) { setForm(f => ({ ...f, [campo]: valor })); setErro('') }

  function mudarPerfil(p) {
    // Ao escolher o perfil, as caixas vêm com o padrão dele (o Gestor pode ajustar)
    setForm(f => ({ ...f, perfil: p, modulos: (MODULOS_PADRAO[p] || []).filter(m => MODULOS_ATRIBUIVEIS.includes(m)) }))
    setErro('')
  }

  function alternarModulo(id) {
    setForm(f => ({ ...f, modulos: f.modulos.includes(id) ? f.modulos.filter(m => m !== id) : [...f.modulos, id] }))
    setErro('')
  }

  function setArquivo(tipo, valor) { setArquivos(a => ({ ...a, [tipo]: valor })); setErro('') }

  /** Envia/remove assinatura e foto. Retorna { usuario, falhas[] } */
  async function salvarArquivos(u) {
    let atual = u
    const falhas = []
    for (const tipo of ['assinatura', 'foto']) {
      const a = arquivos[tipo]
      try {
        if (a.arquivo) atual = await enviarArquivoUsuario(atual, tipo, a.arquivo)
        else if (a.remover) atual = await removerArquivoUsuario(atual, tipo)
      } catch (e) {
        falhas.push(`${tipo === 'assinatura' ? 'Assinatura' : 'Foto'}: ${e.message || 'falha no envio'}`)
      }
    }
    return { usuario: atual, falhas }
  }

  async function salvar(e) {
    e?.preventDefault()
    setTentou(true)
    if (pendencias.length) { setErro(pendencias[0]); return }

    const dados = {
      nome: form.nome, email: form.email, cargo: form.cargo, perfil: form.perfil,
      empresa_id: form.empresa_id || null,
      modulos_acesso: todosModulos ? null : form.modulos,
    }

    setSalvando(true); setErro('')
    try {
      if (novo) {
        const r = await criarUsuario(dados)
        const { usuario: u, falhas } = await salvarArquivos(r.usuario)
        onSalvo(u)
        setResultado({ tipo: 'criado', usuario: u, avisoArquivo: falhas.join(' · ') })
      } else {
        let u = usuario
        if (dadosAlterados) u = (await editarUsuario({ id: usuario.id, ...dados })).usuario
        const r = await salvarArquivos(u)
        onSalvo(r.usuario)
        if (r.falhas.length) {
          setErro('Dados salvos, mas houve falha no arquivo — ' + r.falhas.join(' · '))
          setArquivos({ assinatura: SEM_ARQUIVO, foto: SEM_ARQUIVO })
        } else {
          notificar('Usuário atualizado.')
          onFechar()
        }
      }
    } catch (err) {
      setErro(err.message || 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarAcao() {
    const acao = confirmar
    setSalvando(true); setErro('')
    try {
      if (acao === 'reset') {
        const r = await resetarSenha(usuario.id)
        onSalvo(r.usuario)
        setResultado({ tipo: 'reset', usuario: r.usuario, loginCriado: r.loginCriado })
      } else {
        const r = await alterarStatus(usuario.id, acao === 'inativar' ? 'Inativo' : 'Ativo')
        onSalvo(r.usuario)
        if (r.aviso) notificar(r.aviso, 'warning')
        else notificar(acao === 'inativar' ? 'Usuário inativado. O acesso foi bloqueado.' : 'Usuário reativado.')
      }
      setConfirmar(null)
    } catch (err) {
      setErro(err.message || 'Não foi possível concluir.')
    } finally {
      setSalvando(false)
    }
  }

  const fechar = salvando ? undefined : onFechar

  // ── Tela de resultado (usuário criado / senha resetada) ───────────────────
  if (resultado) {
    const u = resultado.usuario
    return (
      <Modal
        titulo={resultado.tipo === 'criado' ? 'Usuário criado' : (resultado.loginCriado ? 'Login criado' : 'Senha resetada')}
        subtitulo={u.nome}
        onFechar={onFechar}
        rodape={<>
          {resultado.avisoArquivo && (
            <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => onAbrir(u)}>
              Abrir cadastro
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
          {resultado.avisoArquivo && (
            <div className={`${styles.aviso} ${styles.avisoAlerta}`}>
              O usuário foi criado, mas um arquivo não foi salvo ({resultado.avisoArquivo}).
              Clique em “Abrir cadastro” e envie de novo.
            </div>
          )}
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
  const textoBotao = salvando && !confirmar ? 'Salvando...' : (novo ? 'Criar usuário' : 'Salvar')

  return (
    <Modal
      titulo={novo ? 'Novo usuário' : (podeEditar ? 'Editar usuário' : 'Usuário')}
      subtitulo={novo ? `Senha inicial: ${SENHA_PADRAO} (troca obrigatória no primeiro acesso)` : usuario.email}
      onFechar={fechar}
      largura="lg"
      rodape={podeEditar ? <>
        {erro && <span className={styles.erroRodape} role="alert">{erro}</span>}
        <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} onClick={onFechar} disabled={salvando}>
          Cancelar
        </button>
        <button type="submit" form="form-usuario" className={`${styles.btn} ${styles.btnPrimario}`}
          disabled={salvando || !online || !alterado}>
          {textoBotao}
        </button>
      </> : (
        <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} onClick={onFechar}>Fechar</button>
      )}
    >
      <form id="form-usuario" className={styles.form} onSubmit={salvar} noValidate>
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

        {/* ── Dados ── */}
        <label className={styles.campo}>
          <span className={styles.rotulo}>Nome completo <span className={styles.obrigatorio}>*</span></span>
          <input className={styles.input} value={form.nome} onChange={e => set('nome', e.target.value)}
            disabled={!podeEditar} autoFocus={novo} />
        </label>

        <div className={styles.grade2}>
          <label className={styles.campo}>
            <span className={styles.rotulo}>E-mail (login) <span className={styles.obrigatorio}>*</span></span>
            <input className={styles.input} type="email" value={form.email}
              onChange={e => set('email', e.target.value)} disabled={!podeEditar} autoComplete="off" />
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
            <select className={styles.input} value={form.perfil} onChange={e => mudarPerfil(e.target.value)}
              disabled={!podeMudarPerfil}>
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

        {/* ── Módulos de acesso ── */}
        {form.perfil && (
          <div className={styles.secao}>
            <div className={styles.secaoTitulo}>
              Módulos de acesso {!todosModulos && <span className={styles.obrigatorio}>*</span>}
            </div>
            {todosModulos ? (
              <p className={styles.ajuda}>O perfil {rotuloPerfil(form.perfil)} tem acesso a todos os módulos.</p>
            ) : (
              <>
                <div className={`${styles.modulos} ${tentou && form.modulos.length === 0 ? styles.grupoErro : ''}`}>
                  {MODULOS.filter(m => MODULOS_ATRIBUIVEIS.includes(m.id)).map(m => {
                    const marcado = form.modulos.includes(m.id)
                    return (
                      <label key={m.id}
                        className={`${styles.modulo} ${marcado ? styles.moduloMarcado : ''} ${!podeEditar ? styles.moduloDesabilitado : ''}`}>
                        <input type="checkbox" checked={marcado} disabled={!podeEditar}
                          onChange={() => alternarModulo(m.id)} />
                        {m.rotulo}
                      </label>
                    )
                  })}
                </div>
                <span className={styles.ajuda}>
                  As caixas vêm marcadas com o padrão do perfil; ajuste se precisar. O módulo Gestor é exclusivo dos perfis Gestor e Desenvolvedor.
                </span>
              </>
            )}
          </div>
        )}

        {/* ── Assinatura e foto ── */}
        <div className={styles.secao}>
          <div className={styles.secaoTitulo}>Assinatura e foto</div>
          <div className={styles.arquivos}>
            <CampoArquivo
              usuario={usuario} tipo="assinatura" valor={arquivos.assinatura}
              onChange={v => setArquivo('assinatura', v)}
              obrigatorio={assinaturaObrigatoria} opcional={!assinaturaObrigatoria}
              desabilitado={!podeEditar} erroExterno={tentou}
            />
            <CampoArquivo
              usuario={usuario} tipo="foto" valor={arquivos.foto}
              onChange={v => setArquivo('foto', v)}
              opcional desabilitado={!podeEditar}
            />
          </div>
          {!assinaturaObrigatoria && form.perfil && (
            <span className={styles.ajuda}>
              {todosModulos
                ? 'Gestor e Desenvolvedor não precisam de assinatura (não executam ensaios).'
                : 'Assinatura obrigatória só para quem tem o módulo Laboratório ou Assistente.'}
            </span>
          )}
        </div>

      </form>

      {/* ── Acesso: senha e status ── */}
      {podeAcesso && (
        <div className={styles.secao} style={{ marginTop: 14 }}>
          <div className={styles.secaoTitulo}>Acesso</div>
          {!podeEditar && erro && <div className={`${styles.aviso} ${styles.avisoErro}`}>{erro}</div>}
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
    </Modal>
  )
}
