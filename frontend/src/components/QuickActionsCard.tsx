interface Props {
  onRunDemo: () => Promise<void>;
  onRerunAnalytics: () => Promise<void>;
  disabled: boolean;
  isBusy: boolean;
}

export function QuickActionsCard({ onRunDemo, onRerunAnalytics, disabled, isBusy }: Props) {
  return (
    <article className="card">
      <h2>Ações Rápidas</h2>
      <p className="muted">Fluxo demo orientado para banca.</p>

      <div className="stack">
        <button type="button" onClick={() => void onRunDemo()} disabled={isBusy}>
          {isBusy ? 'Executando...' : 'Carregar Cenário Demo'}
        </button>
        <button type="button" className="secondary" onClick={() => void onRerunAnalytics()} disabled={disabled || isBusy}>
          Reexecutar Análise
        </button>
      </div>
    </article>
  );
}
