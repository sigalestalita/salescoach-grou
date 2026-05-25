## Objetivo

Remover o critério de **tempo/prazo (Timeline)** de toda a avaliação de qualificação de leads, pois o ciclo de vendas da Grou é consultivo e complexo — "quando" o lead vai fechar não deve impactar a temperatura nem a nota de qualificação.

## Diagnóstico do que usa "tempo" hoje

| Local | Uso de tempo | Decisão |
|---|---|---|
| `analyze-meeting` prompt — BANT | `timeline` (0-25 pts) | **Remover** |
| `analyze-meeting` prompt — critérios de temperatura | "<30 dias", "<90 dias", "3-9 meses", ">9 meses", ">12 meses" | **Remover toda menção temporal** |
| `analyze-meeting` prompt — MEDDIC | sem critério temporal direto (Decision Process ≠ timeline) | Manter |
| `analyze-meeting` prompt — SPIN | sem critério temporal | Manter |
| Dashboard (`avgBant`) | item `{ key: "timeline", label: "Prazo" }` | **Remover** |
| MeetingDetail render BANT | loop `["budget","authority","need","timeline"]` + tooltip | **Remover `timeline`, atualizar tooltip** |
| `analysis_results.bant_score` (JSON histórico) | contém `timeline` em registros antigos | **Sem migração**: front simplesmente ignora a chave |

## Como BANT vira "BAN" (Budget · Authority · Need)

- Cada critério passa a valer **0–33 pontos** (total 99 ≈ 100).
- Soma BANT continua sendo um indicador comparável (a média histórica cairá ~25%, o que é esperado e será explicado no card).
- Justificativa por critério (`reason`) é mantida.

## Novos critérios de temperatura (sem componente temporal)

Baseados apenas em **profundidade da dor, clareza da necessidade, orçamento e acesso ao decisor**:

- **muito_quente** — Budget confirmado + decisor presente + dor urgente e quantificada + próximo passo de proposta acordado.
- **quente** — Budget provável + acesso ao decisor + necessidade validada com dor reconhecida.
- **morno** — Necessidade identificada, mas budget incerto OU sem acesso direto ao decisor; dor reconhecida sem priorização.
- **frio** — Dor genérica, sem orçamento definido, sem acesso ao decisor; precisa de nutrição.
- **congelado** — Sem perfil para o negócio (descarte).

A regra de cruzamento passa a ser "quantos dos 3 critérios BAN foram plenamente atendidos" em vez de "4 critérios BANT".

## Métricas após o ajuste (resumo do impacto)

| Métrica | Antes | Depois |
|---|---|---|
| BANT score (total) | 0–100 (4×25) | 0–99 (3×33) — exibido como "BAN" |
| Card "BANT Médio" no Dashboard | 4 barras | **3 barras** (Budget, Authority, Need) |
| Distribuição de temperatura | influenciada por timeline | influenciada só por dor/budget/decisor |
| MEDDIC | 6 critérios, 0–17 cada | inalterado |
| SPIN | 4 critérios, 0–25 cada | inalterado |
| Talk ratio / conversation_metrics | inalterado | inalterado |
| Overall score | 0–100 | inalterado (a IA recalibra a partir do prompt novo) |
| Histórico (`analysis_results` existentes) | tem `timeline` na JSON | chave fica órfã, **ignorada no render** |

## Arquivos afetados

- `supabase/functions/analyze-meeting/index.ts`
  - Remover `timeline` do schema `bant_score` (3 critérios, 0–33 cada).
  - Reescrever bloco "CRITÉRIOS OBRIGATÓRIOS PARA CLASSIFICAÇÃO DE TEMPERATURA" sem nenhuma janela temporal.
  - Atualizar instrução final para "3 critérios BAN" em vez de "4 critérios BANT".
- `src/pages/Dashboard.tsx`
  - `avgBant`: remover `{ key: "timeline", label: "Prazo" }`.
  - `FrameworkCard` BANT: passar `maxValue={33}`.
  - Renomear título visível para "BAN (Budget · Authority · Need)".
- `src/pages/MeetingDetail.tsx`
  - Loop BANT: `["budget","authority","need"]`.
  - Tooltip: remover menção a Timeline; explicar que prazo não é critério na Grou por ciclo consultivo.
  - Ajustar título da seção para "BAN Score".
- `mem://features/qualification-logic`
  - Atualizar regra: BANT → BAN, temperatura sem janela temporal.

## Sem migração de banco

Os JSONs antigos continuam com `timeline`; o frontend simplesmente para de ler essa chave. Análises novas já virão sem ela. Nenhum schema SQL muda.

## Pontos para o usuário confirmar antes de implementar

1. **Nome exibido**: prefere "BAN", "BANT (sem prazo)" ou manter "BANT" só visualmente?
2. **MEDDIC**: o "Decision Process" às vezes é usado para mapear etapas/prazos de decisão. Quer que eu reforce no prompt que ele deve focar **só no fluxo de aprovação**, ignorando estimativas de tempo? (Recomendo sim.)
3. **Recalcular histórico**: deseja reprocessar as análises antigas com o novo prompt (botão "reanalisar")? Por padrão, **não** faria — só impacta análises novas.