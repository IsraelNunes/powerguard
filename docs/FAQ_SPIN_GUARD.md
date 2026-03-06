# FAQ do Avaliador - Spin Guard

## 1) Qual problema o Spin Guard resolve?
Detecção tardia de risco elétrico. O módulo antecipa anomalias, classifica severidade e orienta ação operacional.

## 2) Onde está a IA no Spin Guard?
No motor de analytics: anomalia por Robust Z-Score (MAD), score de risco (0-100), explicabilidade por variável e hipótese de causa raiz.

## 3) Como o risco é calculado?
Combinação ponderada de:
- componente de anomalia,
- desvio médio das variáveis,
- regras de domínio elétrico.

## 4) Como vocês explicam um alerta?
Cada alerta indica variáveis que mais contribuíram para o risco e um root-cause hint baseado em regras transparentes.

## 5) O que o gráfico de risco mostra?
A evolução temporal do risco operacional com faixas de severidade e marcação de alertas no tempo.

## 6) Como o simulador what-if funciona?
Aplica deltas em variáveis operacionais (ex.: corrente/tensão/temperatura) e recalcula o risco para comparar cenários.

## 7) Como lidam com qualidade de dados?
Ingestão valida colunas, tipos, datas, missing e inconsistências antes de persistir no banco.

## 8) Quais KPIs executivos o módulo entrega?
Risco atual, eventos na semana, tendência, tempo desde último crítico, custo evitável estimado e risco de indisponibilidade.

## 9) Qual é o diferencial técnico do Spin Guard?
IA explicável aplicada ao contexto elétrico com resposta prática de operação, não apenas classificação.

## 10) O que evoluiria pós-hackathon?
Calibração por ativo real, autenticação corporativa, ingestão em streaming (SCADA/IoT) e MLOps de limiares.
