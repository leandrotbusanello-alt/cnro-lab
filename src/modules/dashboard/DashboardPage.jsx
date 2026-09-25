import { useDashboard } from './useDashboard'
import PeriodoSeletor from './components/PeriodoSeletor'
import BlocoCampo from './components/BlocoCampo'
import BlocoLaboratorio from './components/BlocoLaboratorio'
import BlocoAssistente from './components/BlocoAssistente'
import BlocoGestor from './components/BlocoGestor'
import ui from '../laboratorio/components/ui.module.css'
import styles from './DashboardPage.module.css'

/**
 * Painel interno (escopo aprovado em claude/CNRO_Lab_Painel_Interno_Escopo.md).
 * Tela inicial de todos os perfis — mostra um bloco por módulo que a pessoa tem.
 * O painel completo (gráficos, Modo TV, IA) é o Lab Painel, um sistema à parte.
 */
export default function DashboardPage() {
  const d = useDashboard()

  if (!d.perfil) return null

  const temBloco = d.modulos.length > 0

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.titulo}>📊 Painel</h1>
          <p className={styles.saudacao}>Olá, {d.perfil.nome?.split(' ')[0] || ''}.</p>
        </div>
        <button className={`${ui.btn} ${ui.btnSecundario} ${ui.btnPequeno}`} onClick={() => d.recarregar()} disabled={d.loading}>
          ↻ Atualizar
        </button>
      </header>

      {d.fonte === 'cache' && (
        <div className={`${ui.aviso} ${ui.avisoAlerta}`}>
          🔴 Sem conexão — mostrando os dados de{' '}
          {d.atualizadoEm
            ? `${d.atualizadoEm.toLocaleDateString('pt-BR')} às ${d.atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
            : 'antes de ficar offline'}.
        </div>
      )}

      {d.erro && <div className={`${ui.aviso} ${ui.avisoErro}`}>⚠️ {d.erro}</div>}

      <PeriodoSeletor
        tipo={d.tipoPeriodo} referencia={d.referencia} podeAvancar={d.podeAvancar}
        onMudarTipo={d.mudarTipoPeriodo} onNavegar={d.navegar} onIrParaAtual={d.irParaPeriodoAtual}
      />

      {d.semDadosDoPeriodo && (
        <p className={styles.avisoPeriodo}>
          Este período ainda não foi carregado neste aparelho — os números de "no período" ficam
          zerados até a conexão voltar. A situação atual continua mostrando o que foi sincronizado.
        </p>
      )}

      {d.loading && !d.dados ? (
        <div className={styles.carregando}><div className="spinner" /></div>
      ) : !d.dados ? null : (
        <div className={styles.blocos}>
          {d.modulos.includes('campo') && <BlocoCampo perfil={d.perfil} dados={d.dados} />}
          {d.modulos.includes('laboratorio') && <BlocoLaboratorio perfil={d.perfil} dados={d.dados} />}
          {d.modulos.includes('assistente') && <BlocoAssistente perfil={d.perfil} dados={d.dados} />}
          {d.ehGestor && <BlocoGestor dados={d.dados} />}
        </div>
      )}

      {!temBloco && !d.loading && (
        <p className={styles.vazio}>Nenhum módulo liberado para o seu usuário. Procure o Gestor.</p>
      )}
    </div>
  )
}
