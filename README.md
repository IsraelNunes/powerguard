# Spin Guard + Spin Forecast

Plataforma web para operação elétrica com dois módulos integrados:

- **Spin Guard**: monitora medições elétricas, detecta anomalias, calcula risco (0-100), gera alertas e simula cenários what-if.
- **Spin Forecast**: prevê geração solar (24h/7d/30d), compara com perfil esperado e mostra impacto operacional/financeiro.

Stack:
- Frontend: React + Vite + TypeScript
- Backend: NestJS + TypeScript
- Banco: PostgreSQL + Prisma
- Execução local: Docker Compose

## O que o sistema faz

### Spin Guard
- Upload de CSV de medições elétricas
- Detecção de anomalias (Robust Z-Score/MAD)
- Score de risco com classificação
- Explicação do alerta e hipótese de causa
- Timeline de alertas por severidade
- Simulador what-if (impacto no risco)

### Spin Forecast
- Cadastro e gestão de usinas solares
- Histórico de geração + clima
- Treino e uso de modelo de previsão
- Gráficos de histórico, perfil esperado e previsão
- KPIs técnicos e financeiros
- Integração com risco operacional do Spin Guard

## Como rodar localmente

1. Criar arquivo de ambiente:

```bash
cp .env.example .env
```

2. Subir os serviços:

```bash
docker compose up -d --build
```

3. Aplicar schema e carregar dados iniciais:

```bash
docker compose exec -T api npm run prisma:push
docker compose exec -T api npm run prisma:seed
```

4. Acessar:

- Frontend: `http://localhost:5173`
- API health: `http://localhost:3000/api/health`

## Como usar

### Fluxo rápido do Spin Guard

1. Abra o frontend.
2. Faça upload de um CSV de medições (exemplo em `docs/samples`).
3. O sistema processa a análise e exibe:
   - risco atual,
   - alertas,
   - gráficos elétricos,
   - gráfico de risco no tempo.
4. Use o simulador what-if para testar cenários.

Exemplo de upload via API:

```bash
curl -X POST http://localhost:3000/api/ingestion/csv \
  -F "equipmentName=Transformador Demo" \
  -F "file=@docs/samples/measurements_stage4.csv"
```

### Fluxo rápido do Spin Forecast

1. Clique em **Abrir Spin Forecast** no app.
2. Selecione uma usina.
3. Rode treino/previsão (se necessário).
4. Analise:
   - geração prevista,
   - perfil esperado,
   - tendência e confiança,
   - receita esperada vs prevista,
   - perda estimada.

## Datasets de exemplo

Arquivos úteis em `docs/samples`:
- `measurements_stage4.csv`
- `measurements_hackathon_test.csv`
- `measurements_2weeks.csv`
- `measurements_1month_critical.csv`
- `solar_generation_sample.csv`
- `solar_weather_sample.csv`

## Troubleshooting rápido

Ver status dos serviços:

```bash
docker compose ps
```

Ver logs da API:

```bash
docker compose logs api --tail=200
```

Se precisar reaplicar schema:

```bash
docker compose exec -T api npm run prisma:push
```
