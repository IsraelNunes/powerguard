# PowerGuard AI - Risk & Reliability

MVP completo para o Hackathon InovSpin (submissão até **06/03/2026 23:59**), focado em confiabilidade elétrica com IA explicável.

## 1) Problema

Falhas elétricas em ativos industriais costumam ser detectadas tarde, com pouca explicação do porquê do alerta e sem ferramenta prática para simular impacto de mudanças operacionais.

## 2) Solução

PowerGuard AI recebe medições elétricas (CSV), detecta anomalias com método robusto, calcula score de risco (0-100), explica variáveis de maior impacto, sugere causa provável e permite simulação what-if de cenários operacionais.
Além disso, o sistema estima **impacto de negócio** (risco de indisponibilidade e custo evitável estimado) para apoiar priorização executiva.

## 3) Stack

- Front-end: React + Vite + TypeScript
- Back-end: NestJS + TypeScript
- Banco: PostgreSQL
- ORM: Prisma
- Infra local: Docker Compose

## 4) Arquitetura (diagrama textual)

```txt
[React Dashboard]
   |  upload CSV / filtros / what-if
   v
[NestJS API]
  |- IngestionModule  -> valida CSV -> salva Measurement
  |- AnalyticsModule  -> MAD robust z-score -> risco + explicabilidade
  |- AlertsModule     -> timeline de eventos por severidade
  |- SimulatorModule  -> cenário what-if e impacto no risco
  |- MeasurementsModule -> séries temporais
  |- HealthModule
   v
[PostgreSQL + Prisma]
  Equipment, Measurement, AnalysisRun, AnomalyResult, AlertEvent
```

## 5) IA aplicada e explicável

Abordagem implementada no backend (TypeScript puro):

1. **Detecção de anomalias**: Robust Z-Score com mediana e MAD por variável (`voltage`, `current`, `power`, `frequency`, `temperature`).
2. **Score de risco (0-100)**: composição ponderada de componente de anomalia, desvio médio e regras elétricas.
3. **Classificação**:
- `0-24 LOW`
- `25-49 MEDIUM`
- `50-74 HIGH`
- `75-100 CRITICAL`
4. **Explicabilidade**:
- `featureImpact` por variável
- texto de explicação com top drivers
- `rootCauseHint` baseado em regras (ex.: corrente + temperatura elevadas)
5. **What-if**: aplica deltas em tensão/corrente/temperatura e recalcula risco/explicação.
6. **Impacto financeiro**:
- `estimatedDowntimeRiskHours`
- `potentialAvoidedCostUSD`
- cálculo heurístico transparente baseado em `criticalCount`, `anomalyCount`, `risk.average` e `risk.current`.

## 6) Funcionalidades implementadas

### Back-end

- Upload CSV com validação robusta
- Persistência em Postgres
- Execução de analytics e geração de eventos
- Timeline de alertas com filtro de severidade
- Simulador what-if real
- Impacto financeiro estimado no resumo analítico
- Healthcheck
- Teste unitário do motor de risco

### Front-end

- Dashboard com visual industrial
- Upload + gatilho automático de analytics
- KPIs executivos (risco atual, eventos 7d, tendência, etc.)
- KPIs de impacto (custo evitável estimado e risco de indisponibilidade em horas)
- Gráfico temporal (voltage/current/power/temperature)
- Lista de alertas por severidade
- Painel What-if integrado ao endpoint real
- Estados de loading/erro/vazio

## 7) Endpoints da API

Base URL: `http://localhost:3000/api`

1. `GET /health`
2. `POST /ingestion/csv`
3. `GET /measurements?equipmentId=...&from=...&to=...&limit=...`
4. `POST /analytics/run?equipmentId=...&from=...&to=...&limit=...`
5. `GET /analytics/summary?equipmentId=...`
6. `GET /alerts?equipmentId=...&severity=...&from=...&to=...&limit=...`
7. `POST /simulator/what-if`

## 8) Modelo de dados (Prisma)

- `Equipment`
- `Measurement`
- `AnalysisRun`
- `AnomalyResult`
- `AlertEvent`

Schema: [schema.prisma](/home/israel/Documentos/spin/backend/prisma/schema.prisma)

## 9) Estrutura do projeto

```txt
spin/
  backend/
    src/
      analytics/
      alerts/
      health/
      ingestion/
      measurements/
      simulator/
      prisma/
    prisma/
      schema.prisma
  frontend/
    src/
      components/
      features/
      hooks/
      lib/
      pages/
      styles/
      types/
  docs/
    samples/
      measurements_sample.csv
      measurements_stage4.csv
    API_STAGE3.md
    PITCH_3MIN.md
```

## 10) Como rodar

1. Preparar ambiente:
```bash
cp .env.example .env
```

2. Subir stack:
```bash
docker compose up -d --build
```

3. Verificar serviços:
```bash
docker compose ps
```

## 11) Demo rápida (script técnico)

1. Upload de dataset:
```bash
curl -X POST http://localhost:3000/api/ingestion/csv \
  -F "equipmentName=Stage4 Transformer" \
  -F "file=@docs/samples/measurements_stage4.csv"
```

2. Rodar analytics:
```bash
curl -X POST "http://localhost:3000/api/analytics/run?equipmentId=<EQUIPMENT_ID>"
```

3. Obter resumo:
```bash
curl "http://localhost:3000/api/analytics/summary?equipmentId=<EQUIPMENT_ID>"
```

Exemplo de campos de impacto no `summary`:
```json
{
  "summary": {
    "risk": { "current": 82, "average": 61.3, "max": 97, "min": 12 },
    "criticalCount": 37,
    "impact": {
      "estimatedDowntimeRiskHours": 21.6,
      "potentialAvoidedCostUSD": 25840
    }
  }
}
```

4. Listar alertas:
```bash
curl "http://localhost:3000/api/alerts?equipmentId=<EQUIPMENT_ID>&severity=CRITICAL&limit=10"
```

5. Simular cenário what-if:
```bash
curl -X POST http://localhost:3000/api/simulator/what-if \
  -H "Content-Type: application/json" \
  -d '{
    "equipmentId":"<EQUIPMENT_ID>",
    "currentDeltaPercent":10,
    "voltageDeltaPercent":-5,
    "temperatureDeltaPercent":12
  }'
```

## 12) Variáveis de ambiente

Arquivo base: [.env.example](/home/israel/Documentos/spin/.env.example)

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_PORT` (use `5433` se `5432` já estiver em uso)
- `API_PORT`
- `FRONTEND_PORT`
- `DATABASE_URL`
- `VITE_API_BASE_URL`

## 13) Qualidade de engenharia

- Validação de entrada (DTO + ValidationPipe)
- Estrutura modular no NestJS
- Logs de ingestão/execução
- Teste unitário do motor de risco (`analytics.engine.spec.ts`)
- Docker Compose com serviços integrados
- Métrica de impacto de negócio para comunicação executiva durante a demo

## 14) Roteiro do pitch (3 minutos)

Arquivo pronto para gravação:
- [PITCH_3MIN.md](/home/israel/Documentos/spin/docs/PITCH_3MIN.md)

## 15) Troubleshooting

### API não responde em `:3000`

```bash
docker compose ps -a
docker compose logs api --tail=200
```

### Conflito de porta Postgres

Ajustar `.env`:
```env
POSTGRES_PORT=5433
```

### Reaplicar schema Prisma

```bash
docker compose exec api npm run prisma:push
```
