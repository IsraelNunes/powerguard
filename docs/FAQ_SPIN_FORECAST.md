# FAQ do Avaliador - Spin Forecast

## 1) Qual problema o Spin Forecast resolve?
Antecipar disponibilidade de geração solar e seu impacto na operação e no resultado financeiro.

## 2) Quais dados o módulo utiliza?
Histórico de geração por usina, dados climáticos (INMET quando disponível) e variáveis temporais (hora/dia/sazonalidade).

## 3) Como o modelo de previsão foi implementado?
Modelo explicável em TypeScript (sem microserviço Python), com features de lags, sazonalidade e clima.

## 4) Quais horizontes de previsão existem?
24 horas, 7 dias e 30 dias.

## 5) O que é perfil esperado?
Baseline histórico por hora da usina; referência para comparar se a previsão está acima ou abaixo do normal.

## 6) Diferença entre receita esperada e prevista?
- Receita esperada: perfil esperado x tarifa.
- Receita prevista: previsão do modelo x tarifa.
A diferença gera gap financeiro/perda estimada.

## 7) Como o módulo mostra incerteza?
Faixa P10/P90 por ponto previsto, além de métricas de qualidade como MAPE e rótulo de confiança.

## 8) Quais gráficos financeiros foram incluídos?
- Receita esperada vs prevista;
- perda por hora e acumulada;
- sensibilidade de perda por cenário.

## 9) Como integra com o Spin Guard?
Baixa disponibilidade solar pode ampliar risco operacional e gerar alerta contextual sincronizado.

## 10) O que evoluiria pós-hackathon?
Treino agendado automático, múltiplos modelos por usina, calibração financeira por contrato/tarifa real e backtesting contínuo.
