# FAQ do Avaliador - PowerGuard AI

## 1) Qual problema real vocês resolvem no setor elétrico e para quem?
Resolvemos detecção tardia de risco elétrico operacional para equipes de operação e manutenção, com explicação do alerta e simulação de decisão.

## 2) Como o score de risco (0–100) é calculado exatamente?
O score combina 3 componentes: anomalia, desvio médio e regras elétricas, com pesos `0.45`, `0.35`, `0.20`, e normalização para `0–100`.

## 3) Por que escolheram Robust Z-Score (MAD) em vez de outro método?
Porque é robusto a outliers, simples, explicável e rápido para um MVP em TypeScript.

## 4) Como vocês garantem explicabilidade do alerta (não só detecção)?
Cada alerta inclui impacto por variável (`featureImpact`) e texto com os principais drivers do risco.

## 5) O que significa “root-cause hint” e qual confiabilidade dessa hipótese?
É uma hipótese baseada em regras transparentes (ex.: corrente alta + temperatura alta), útil para triagem, não diagnóstico definitivo.

## 6) Como o simulador what-if funciona e quais limites ele tem?
Aplica deltas em tensão/corrente/temperatura sobre uma medição de referência e recalcula risco/explicação com o mesmo motor; depende da qualidade do baseline histórico.

## 7) Como evitam falso positivo/falso negativo nas anomalias?
Usamos baseline robusto (mediana/MAD), limiares definidos e regras de domínio; ainda requer calibração com dados reais.

## 8) Como o sistema lida com dados ruins (missing, fora de ordem, valores inválidos)?
O módulo de ingestão valida colunas obrigatórias, tipos, ordenação temporal, missing e valores inválidos/negativos, retornando erro detalhado.

## 9) Qual é o fluxo completo do usuário do upload até ação operacional?
Upload CSV -> validação/persistência -> execução de analytics -> geração de alertas -> dashboard com KPIs/série/timeline -> simulação what-if.

## 10) Quais KPIs executivos o dashboard entrega para tomada de decisão?
Risco atual, eventos na semana, tendência, tempo desde último crítico, médias de tensão/temperatura e total de medições.

## 11) O que já está 100% funcional e o que ainda é roadmap?
Funcional: ingestão, analytics, alertas, dashboard e what-if real. Roadmap: autenticação robusta, streaming e integrações industriais diretas.

## 12) Como escalar de CSV para streaming em tempo real (IoT/SCADA)?
Substituir ingestão por pipeline de eventos (MQTT/Kafka), processar janelas deslizantes e atualizar dashboard em tempo real.

## 13) Como fariam validação com dados reais de planta/subestação?
Coletar histórico real, calibrar por ativo, validar com especialistas e comparar com eventos reais para ajustar limiares.

## 14) Como tratariam segurança, autenticação e auditoria em produção?
Com JWT/RBAC, TLS, segregação de acesso, trilha de auditoria, gestão de segredos e políticas de retenção de logs.

## 15) Qual o diferencial competitivo versus monitoramento tradicional?
IA explicável + score acionável + simulação what-if, com foco específico em confiabilidade elétrica industrial.

## 16) Qual impacto esperado no negócio (downtime, custo, confiabilidade)?
Redução de incidentes críticos, menor downtime e melhor priorização de manutenção preventiva.

## 17) Como está a qualidade de engenharia (testes, logs, modularidade)?
Backend modular em NestJS, DTOs com validação, logs, Prisma, Docker Compose e teste unitário do motor de risco.

## 18) Como reproduzir a demo local em poucos minutos?
`docker compose up -d --build`, upload de CSV de amostra, executar analytics e abrir dashboard em `http://localhost:5173`.

## 19) Quais foram os principais trade-offs técnicos do MVP?
Priorizamos simplicidade e explicabilidade (MAD + regras) em vez de modelos complexos, para entregar robusto dentro do prazo.

## 20) Qual o próximo passo pós-hackathon para virar produto real?
Piloto com dados reais, calibração por equipamento, autenticação corporativa e evolução para operação cloud/edge.
