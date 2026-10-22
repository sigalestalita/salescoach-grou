# Coach de atendimento: playbooks

O Sales Coach avalia reuniões de venda por uma **metodologia de qualificação**
(BANT, SPICED, MEDDIC...). Times que não vendem, como Customer Success,
suporte, onboarding e renovação, precisam de outra régua: o **playbook** da
empresa para aquele tipo de conversa. Esta é a versão do coach para eles.

## Como funciona

| | Vendas (metodologia) | Atendimento (playbook) |
|---|---|---|
| O que a IA mede | Qualificação da oportunidade | Aderência ao playbook |
| Nota | Score geral | Aderência ao playbook (0–100, pelo peso das etapas) |
| Faixas | Temperatura (frio → muito quente) | Saúde do cliente (crítico → promotor) |
| Critérios | Critérios da metodologia | Etapas do playbook, com peso e "obrigatória" |
| Extras | MEDDIC, SPIN, talk ratio | Sinais (risco, oportunidade, atenção), boas práticas, o que evitar, informações a registrar, compromissos |
| Coach ao vivo | Próxima pergunta de qualificação, objeções | Etapa que falta, sinal de risco, dúvida do cliente, compromisso com prazo |

O que decide a régua é o **tipo de reunião**: cada tipo aponta para uma
metodologia ou para um playbook (Configurações → Tipos de reunião). Um tipo
"Onboarding" ligado ao playbook de onboarding faz toda reunião desse tipo, da
extensão ou enviada pelo app, ser avaliada pelo playbook.

## Configurar (admin)

Configurações → **Playbooks de atendimento**:

1. **Novo playbook** a partir de um modelo: Onboarding, Check-in de
   acompanhamento, Revisão de resultados (QBR), Renovação, Atendimento de
   suporte, Recuperação de cliente em risco. Ou **Montar a partir do nosso
   playbook**: cole o texto do playbook do time e a IA estrutura em etapas,
   sinais e faixas de saúde (função `suggest-playbook`), usando também a base
   de conhecimento. Nada é salvo antes da revisão.
2. Ajuste objetivo, etapas (peso e obrigatória), boas práticas, o que evitar,
   sinais, informações a registrar, faixas de saúde e regras da operação.
3. Ao salvar um playbook novo, o tipo de reunião com o mesmo nome já nasce
   ligado a ele (dá para desmarcar).

A base de conhecimento continua valendo: a IA confere se as respostas dadas
ao cliente batem com os documentos da empresa.

## Onde está no código

| O quê | Onde |
|---|---|
| Banco: `analysis_templates.mode` e `.playbook`, `analysis_results.playbook_result` | `supabase/migrations/20261028090000_playbooks_atendimento.sql` |
| Prompt da análise por playbook | `supabase/functions/_shared/analysis-template.ts` (`buildPlaybookPrompt`) |
| Análise | `supabase/functions/analyze-meeting` |
| Coach ao vivo | `supabase/functions/live-coach` |
| Sugestão de playbook pela IA | `supabase/functions/suggest-playbook`, `_shared/playbook-suggestion.ts` |
| Modelos prontos | `src/lib/playbook.ts` |
| Tela de configuração | `src/components/settings/PlaybookSettings.tsx` |
| Resultado da reunião | `src/components/MeetingAnalysisView.tsx` |
| Painel por área | `src/pages/Dashboard.tsx`, `meetingArea` e `isAtRisk` em `src/lib/methodology.ts` |
| Testes | `src/test/playbook.test.ts` |

O playbook mora na mesma tabela das metodologias e reaproveita as colunas:
etapas em `qualification_criteria` e faixas de saúde em `temperature_levels`.
Por isso o resto do sistema (temperatura na lista de agendas, filtros,
compartilhamento) funciona sem mudança, com os rótulos de saúde.

## Painel por área

O Dashboard separa **Vendas** e **Atendimento** (a aba aparece quando a empresa
tem playbook). A área de cada reunião vem da análise; sem análise ainda, do
tipo de reunião. Em Atendimento: aderência média, clientes em risco (metade
pior das faixas de saúde), saúde dos clientes, etapas médias por playbook,
sinais detectados (risco, oportunidade, atenção) e aderência por pessoa.

## Ainda não coberto

- O envio ao CRM manda os campos de venda; para atendimento, o mapeamento
  ainda precisa ser definido (ex.: saúde do cliente num campo da empresa).
