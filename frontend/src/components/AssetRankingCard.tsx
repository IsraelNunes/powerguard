import { AnalyticsRankingResponse } from '../types/api';

interface Props {
  ranking: AnalyticsRankingResponse | undefined;
  loading: boolean;
}

export function AssetRankingCard({ ranking, loading }: Props) {
  return (
    <article className="card">
      <h2>Top 5 Ativos Críticos</h2>
      {loading ? <p>Carregando ranking...</p> : null}
      {!loading && (!ranking || ranking.items.length === 0) ? <p>Sem dados de ranking.</p> : null}

      <div className="ranking-list">
        {ranking?.items.map((item, index) => (
          <div key={item.equipmentId} className="ranking-item">
            <strong>
              #{index + 1} {item.equipmentName}
            </strong>
            <small>
              Risco {item.riskCurrent} | Críticos {item.criticalCount} | Confiança {item.confidence}%
            </small>
          </div>
        ))}
      </div>
    </article>
  );
}
