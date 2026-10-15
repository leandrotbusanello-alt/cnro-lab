import { useEffect, useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { TIPOS_EQUIPAMENTO } from '../../../lib/cadastros'
import { salvarCadastro, historicoEquipamento, listarUsuariosNomes } from '../cadastrosRepo'
import ui from '../../laboratorio/components/ui.module.css'
import styles from '../CadastrosPage.module.css'

// ─────────────────────────────────────────────────────────────────────────────
// Cadastros → Equipamentos (migração 24 — 15/10/2026): taras de cápsulas e cilindros.
// Identificação só pelo número. As fichas (FR-IMOB-55, FR-IMOB-34) buscam o peso pelo nº e
// gravam uma cópia no ensaio: alterar aqui não muda ensaios já preenchidos.
// Sem excluir: desative o equipamento. Cada cadastro/alteração fica no histórico.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (v, casas) => (v === null || v === undefined || v === '' ? '—'
  : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: Math.max(casas, 3) }))

export default function EquipamentosCadastro({ equipamentos, termo, onSalvo }) {
  const [tipo, setTipo] = useState('capsula')
  const [modal, setModal] = useState(null)   // { tipo: 'editar' | 'historico', item }
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const cil = tipo === 'cilindro'

  const lista = (equipamentos || [])
    .filter(e => e.tipo === tipo)
    .filter(e => mostrarInativos || e.ativo !== false)
    .filter(e => !termo || String(e.numero).includes(termo) || (e.observacao || '').toLowerCase().includes(termo))
    .sort((a, b) => a.numero - b.numero)
  const conferir = (equipamentos || []).filter(e => e.tipo === tipo && e.ativo !== false && e.observacao).length

  return (
    <>
      <div className={styles.filtros}>
        {Object.entries(TIPOS_EQUIPAMENTO).map(([t, cfg]) => (
          <button key={t} type="button" className={`${styles.filtro} ${tipo === t ? styles.filtroAtivo : ''}`} onClick={() => setTipo(t)}>
            {cfg.titulo} <span>{(equipamentos || []).filter(e => e.tipo === t && e.ativo !== false).length}</span>
          </button>
        ))}
        <label className={styles.filtro} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={mostrarInativos} onChange={e => setMostrarInativos(e.target.checked)} /> Mostrar desativados
        </label>
        <button className={`${ui.btn} ${ui.btnPrimario}`} style={{ marginLeft: 'auto' }} onClick={() => setModal({ tipo: 'editar', item: null })}>
          + Cadastrar {TIPOS_EQUIPAMENTO[tipo].singular}
        </button>
      </div>

      <p className={ui.ajuda}>
        As fichas buscam o peso pelo número {cil ? 'do cilindro (peso, volume e altura)' : 'da cápsula'} e gravam uma cópia no ensaio:
        alterar aqui vale para os próximos ensaios, sem mudar os já preenchidos.
        {conferir > 0 && <> <strong>{conferir}</strong> com observação (conferir).</>}
      </p>

      {!lista.length ? <p className={ui.vazio}>Nenhum{cil ? ' cilindro' : 'a cápsula'} cadastrad{cil ? 'o' : 'a'}.</p> : (
        <div className={styles.tabelaWrap}>
          <table className={styles.tabela}>
            <thead>
              <tr>
                <th>Nº</th>
                <th>Peso (g)</th>
                {cil && <th>Volume (cm³)</th>}
                {cil && <th>Altura (mm)</th>}
                <th>Observação</th>
                <th>Situação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map(e => (
                <tr key={e.id} className={e.ativo === false ? styles.inativo : ''}>
                  <td><strong>{e.numero}</strong></td>
                  <td>{fmt(e.peso_g, 2)}</td>
                  {cil && <td>{fmt(e.volume_cm3, 0)}</td>}
                  {cil && <td>{fmt(e.altura_mm, 2)}</td>}
                  <td>{e.observacao ? <span className={`${ui.badge} ${ui.pendente}`}>⚠ {e.observacao}</span> : '—'}</td>
                  <td>{e.ativo === false ? 'Desativado' : 'Ativo'}</td>
                  <td className={styles.colAcao}>
                    <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={() => setModal({ tipo: 'editar', item: e })}>✏️ Editar</button>
                    {' '}
                    <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={() => setModal({ tipo: 'historico', item: e })}>🕘 Histórico</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal?.tipo === 'editar' && (
        <ModalEquipamento tipo={modal.item?.tipo || tipo} item={modal.item} onFechar={() => setModal(null)}
          onSalvo={e => { setModal(null); onSalvo(`${e.tipo === 'cilindro' ? 'Cilindro' : 'Cápsula'} nº ${e.numero} salvo.`) }} />
      )}
      {modal?.tipo === 'historico' && <ModalHistoricoEquipamento item={modal.item} onFechar={() => setModal(null)} />}
    </>
  )
}

/** número digitado em pt-BR ("93,50") → número; vazio → null; inválido → NaN */
function lerNumero(txt) {
  const t = String(txt ?? '').trim().replace(/\./g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}
const paraTexto = v => (v === null || v === undefined ? '' : String(v).replace('.', ','))

function ModalEquipamento({ tipo, item, onFechar, onSalvo }) {
  const cil = tipo === 'cilindro'
  const [f, setF] = useState({
    numero: item?.numero ?? '', peso: paraTexto(item?.peso_g), volume: paraTexto(item?.volume_cm3), altura: paraTexto(item?.altura_mm),
    observacao: item?.observacao || '', ativo: item?.ativo !== false,
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))

  async function salvar() {
    setErro(null)
    const numero = parseInt(f.numero, 10)
    if (!item && (!Number.isInteger(numero) || numero <= 0)) { setErro('Informe o número (inteiro, maior que zero).'); return }
    const peso = lerNumero(f.peso), volume = lerNumero(f.volume), altura = lerNumero(f.altura)
    if (peso === null || Number.isNaN(peso) || peso <= 0) { setErro('Informe o peso em gramas (ex.: 34,90).'); return }
    if (cil && (volume === null || Number.isNaN(volume) || volume <= 0)) { setErro('Informe o volume do cilindro em cm³.'); return }
    if (cil && Number.isNaN(altura)) { setErro('Altura inválida.'); return }
    setSalvando(true)
    try {
      const dados = { id: item?.id, peso_g: peso, observacao: f.observacao, ativo: f.ativo }
      if (!item) { dados.tipo = tipo; dados.numero = numero }
      if (cil) { dados.volume_cm3 = volume; dados.altura_mm = altura }
      onSalvo(await salvarCadastro('equipamentos', dados))
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo={item ? `Editar ${cil ? 'cilindro' : 'cápsula'} nº ${item.numero}` : `Cadastrar ${cil ? 'cilindro' : 'cápsula'}`}
      onFechar={onFechar}
      rodape={(
        <>
          <button className={`${ui.btn} ${ui.btnSecundario}`} onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className={`${ui.btn} ${ui.btnPrimario}`} onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : '💾 Salvar'}</button>
        </>
      )}
    >
      <div className={ui.pilha}>
        {!item && (
          <label className={ui.campo}>
            <span className={ui.rotulo}>Número <span className={ui.obrigatorio}>*</span></span>
            <input className={ui.input} inputMode="numeric" value={f.numero} onChange={e => set('numero', e.target.value.replace(/\D/g, ''))} autoFocus />
          </label>
        )}
        <label className={ui.campo}>
          <span className={ui.rotulo}>Peso (g) <span className={ui.obrigatorio}>*</span></span>
          <input className={ui.input} inputMode="decimal" value={f.peso} onChange={e => set('peso', e.target.value)} placeholder="Ex.: 34,90" autoFocus={!!item} />
        </label>
        {cil && (
          <>
            <label className={ui.campo}>
              <span className={ui.rotulo}>Volume (cm³) <span className={ui.obrigatorio}>*</span></span>
              <input className={ui.input} inputMode="decimal" value={f.volume} onChange={e => set('volume', e.target.value)} placeholder="Ex.: 2081" />
            </label>
            <label className={ui.campo}>
              <span className={ui.rotulo}>Altura (mm)</span>
              <input className={ui.input} inputMode="decimal" value={f.altura} onChange={e => set('altura', e.target.value)} placeholder="Ex.: 113,20" />
            </label>
          </>
        )}
        <label className={ui.campo}>
          <span className={ui.rotulo}>Observação (ex.: "conferir peso"; apague depois de conferir)</span>
          <input className={ui.input} value={f.observacao} onChange={e => set('observacao', e.target.value)} />
        </label>
        <label className={ui.campo} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={f.ativo} onChange={e => set('ativo', e.target.checked)} />
          <span>Ativo (desativado: as fichas deixam de encontrar este número)</span>
        </label>
        {item && <p className={ui.ajuda}>O número não muda. Para trocar o número, desative este e cadastre outro.</p>}
        {erro && <div className={`${ui.aviso} ${ui.avisoErro}`}>{erro}</div>}
      </div>
    </Modal>
  )
}

const ROTULOS = { peso_g: 'Peso (g)', volume_cm3: 'Volume (cm³)', altura_mm: 'Altura (mm)', observacao: 'Observação', ativo: 'Situação' }
const valorHist = (k, v) => (k === 'ativo' ? (v === false ? 'Desativado' : 'Ativo') : v === null || v === undefined || v === '' ? '—' : String(v).replace('.', ','))

function ModalHistoricoEquipamento({ item, onFechar }) {
  const [linhas, setLinhas] = useState(null)
  const [nomes, setNomes] = useState({})
  const [erro, setErro] = useState(null)

  useEffect(() => {
    historicoEquipamento(item.id).then(setLinhas).catch(e => setErro(e.message))
    listarUsuariosNomes().then(setNomes).catch(() => {})
  }, [item.id])

  return (
    <Modal titulo="Histórico" subtitulo={`${item.tipo === 'cilindro' ? 'Cilindro' : 'Cápsula'} nº ${item.numero}`} onFechar={onFechar}>
      {erro && <div className={`${ui.aviso} ${ui.avisoErro}`}>{erro}</div>}
      {!linhas && !erro && <div className="spinner" />}
      {linhas && linhas.length === 0 && <p className={ui.vazio}>Sem registros.</p>}
      {linhas && linhas.length > 0 && (
        <div className={styles.historico}>
          {linhas.map(l => {
            const mudou = Object.keys(ROTULOS).filter(k => item.tipo === 'cilindro' || !['volume_cm3', 'altura_mm'].includes(k))
              .filter(k => !l.antes || JSON.stringify(l.antes[k] ?? null) !== JSON.stringify(l.depois?.[k] ?? null))
            return (
              <div key={l.id} className={styles.histItem}>
                <strong>{l.acao} · {new Date(l.registrado_em).toLocaleString('pt-BR')}{nomes[l.registrado_por] ? ` · ${nomes[l.registrado_por]}` : ''}</strong>
                {mudou.map(k => (
                  <span key={k}>
                    {ROTULOS[k]}: {l.antes ? <>{valorHist(k, l.antes[k])} → </> : null}<b>{valorHist(k, l.depois?.[k])}</b>
                  </span>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
