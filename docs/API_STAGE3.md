# API - ETAPA 3 (Ingestion + Measurements)

Base URL local:
- `http://localhost:3000/api`

## 1) Healthcheck

### Request

```bash
curl http://localhost:3000/api/health
```

### Response `200`

```json
{
  "status": "ok",
  "service": "powerguard-api",
  "timestamp": "2026-03-05T18:30:41.678Z"
}
```

## 2) Upload CSV

### Endpoint

- `POST /ingestion/csv`
- Content-Type: `multipart/form-data`
- Campo obrigatório: `file` (`.csv`)
- Campos opcionais de form-data:
  - `equipmentId` (usa equipamento existente)
  - `equipmentName` (cria equipamento novo quando `equipmentId` não é enviado)

### Exemplo de request

```bash
curl -X POST http://localhost:3000/api/ingestion/csv \
  -F "equipmentName=Main Transformer T1" \
  -F "file=@docs/samples/measurements_sample.csv"
```

### Response `201`

```json
{
  "equipmentId": "cmmdtcyjs0000a2t1mv09srl1",
  "equipmentName": "Main Transformer T1",
  "rowsReceived": 4,
  "rowsInserted": 4,
  "columnsDetected": [
    "timestamp",
    "voltage",
    "current",
    "power",
    "frequency",
    "temperature",
    "phase_a",
    "phase_b",
    "phase_c"
  ]
}
```

### Validações implementadas

- Arquivo obrigatório
- Extensão `.csv` obrigatória
- Header obrigatório com colunas mínimas:
  - `timestamp, voltage, current, power, frequency, temperature`
- `timestamp` válido e em ordem estritamente crescente
- Campos numéricos válidos
- Valores negativos não permitidos para:
  - `voltage`, `current`, `power`, `frequency`, `temperature`
- Colunas opcionais aceitas:
  - `phase_a`, `phase_b`, `phase_c`

### Exemplo de erro `400`

```json
{
  "message": "CSV validation failed",
  "errors": [
    "missing required column: temperature"
  ]
}
```

## 3) Consultar medições

### Endpoint

- `GET /measurements`

### Query params

- `equipmentId` (obrigatório)
- `from` (opcional, ISO datetime)
- `to` (opcional, ISO datetime)
- `limit` (opcional, inteiro 1..5000, default 1000)

### Exemplo de request

```bash
curl "http://localhost:3000/api/measurements?equipmentId=cmmdtcyjs0000a2t1mv09srl1&limit=10"
```

### Response `200`

```json
{
  "equipmentId": "cmmdtcyjs0000a2t1mv09srl1",
  "count": 4,
  "items": [
    {
      "id": "cmmdtcyjy0001a2t1af2x85cq",
      "equipmentId": "cmmdtcyjs0000a2t1mv09srl1",
      "timestamp": "2026-03-05T00:00:00.000Z",
      "voltage": 220.1,
      "current": 10.5,
      "power": 2311,
      "frequency": 60,
      "temperature": 34.2,
      "phaseA": 73.1,
      "phaseB": 72.9,
      "phaseC": 74,
      "createdAt": "2026-03-05T18:43:15.310Z"
    }
  ]
}
```

## 4) Formato CSV recomendado

```csv
timestamp,voltage,current,power,frequency,temperature,phase_a,phase_b,phase_c
2026-03-05T00:00:00Z,220.1,10.5,2311,60.00,34.2,73.1,72.9,74.0
```

## 5) Observações

- O backend já inclui entidades de analytics e alertas no Prisma schema, mas os endpoints dessas funcionalidades entram na ETAPA 4.
- A aplicação roda em Docker com `prisma db push` automático na inicialização da API.
