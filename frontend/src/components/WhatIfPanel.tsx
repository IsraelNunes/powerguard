import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { runWhatIf, WhatIfResponse } from '../features/simulator/api';

interface Props {
  equipmentId: string | null;
}

export function WhatIfPanel({ equipmentId }: Props) {
  const [currentDelta, setCurrentDelta] = useState(0);
  const [voltageDelta, setVoltageDelta] = useState(0);
  const [temperatureDelta, setTemperatureDelta] = useState(0);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!equipmentId) {
        throw new Error('Faça upload de dados antes de simular.');
      }

      return runWhatIf({
        equipmentId,
        currentDeltaPercent: currentDelta,
        voltageDeltaPercent: voltageDelta,
        temperatureDeltaPercent: temperatureDelta
      });
    }
  });

  const errorMessage = useMemo(() => {
    if (!mutation.error) return null;
    const error = mutation.error as AxiosError<{ message?: string }>;
    return error.response?.data?.message ?? error.message;
  }, [mutation.error]);

  const result = mutation.data as WhatIfResponse | undefined;
  const riskLevelLabel: Record<string, string> = {
    LOW: 'Baixo',
    MEDIUM: 'Medio',
    HIGH: 'Alto',
    CRITICAL: 'Critico'
  };

  return (
    <article className="card">
      <h2>Simulação What-If</h2>
      <p className="muted">Análise de impacto instantânea no score de risco.</p>

      <label>
        Corrente Δ: {currentDelta}%
        <input
          type="range"
          min={-20}
          max={20}
          value={currentDelta}
          onChange={(event) => setCurrentDelta(Number(event.target.value))}
          disabled={!equipmentId || mutation.isPending}
        />
      </label>

      <label>
        Tensão Δ: {voltageDelta}%
        <input
          type="range"
          min={-10}
          max={10}
          value={voltageDelta}
          onChange={(event) => setVoltageDelta(Number(event.target.value))}
          disabled={!equipmentId || mutation.isPending}
        />
      </label>

      <label>
        Temperatura Δ: {temperatureDelta}%
        <input
          type="range"
          min={-20}
          max={20}
          value={temperatureDelta}
          onChange={(event) => setTemperatureDelta(Number(event.target.value))}
          disabled={!equipmentId || mutation.isPending}
        />
      </label>

      <button type="button" disabled={!equipmentId || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? 'Simulando...' : 'Executar Simulação'}
      </button>

      {!equipmentId ? <p className="muted">Selecione/importe um equipamento para habilitar.</p> : null}
      {errorMessage ? <p className="error">{errorMessage}</p> : null}

      {result ? (
        <div className="sim-result">
          <strong>
            {result.baseline.riskScore} → {result.simulated.riskScore} ({result.delta.riskScore >= 0 ? '+' : ''}
            {result.delta.riskScore})
          </strong>
          <p>
            Nível: {riskLevelLabel[result.simulated.riskLevel] ?? result.simulated.riskLevel} |{' '}
            {result.simulated.explanation}
          </p>
          <small>{result.simulated.rootCauseHint}</small>
        </div>
      ) : null}
    </article>
  );
}
