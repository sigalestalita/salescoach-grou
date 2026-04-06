

# Sistema de Análise de Agendas Comerciais com IA

## Visão Geral
Sistema SaaS completo em português (BR) para análise inteligente de reuniões comerciais, com transcrição por IA, análise por frameworks de vendas (BANT, MEDDIC, SPIN), RAG com base de conhecimento, e dashboard gerencial.

---

## Fase 1 — Fundação (Auth, DB, Layout)

### Autenticação e Roles
- Login/registro com email e senha via Lovable Cloud
- Tabela `user_roles` com enum: `admin`, `gestor`, `vendedor`
- Tabela `profiles` com nome, avatar, time
- Tabela `teams` para organização por equipe
- RLS em todas as tabelas

### Layout Principal
- Sidebar com navegação: Dashboard, Agendas, Base de Conhecimento, Equipe, Configurações
- Header com nome do usuário, role, e notificações
- Design em português (BR), tema profissional escuro/claro

---

## Fase 2 — Upload e Gestão de Agendas

### Upload de Arquivos
- Bucket Supabase Storage para áudio/vídeo (MP3, WAV, M4A, MP4)
- Formulário de upload com metadados: título, vendedor, lead, data
- Suporte a links do YouTube (extração via edge function)

### Organização
- Tabela `meetings` com status do pipeline (enviado → transcrevendo → analisando → completo)
- Pastas por vendedor, filtros por data/status/score
- Histórico individual e por time

---

## Fase 3 — Pipeline de IA

### Edge Function: Transcrição
- Integração com OpenAI Whisper API via edge function
- Transcrição com timestamps
- Separação de speakers (vendedor vs lead) via prompt de IA
- Armazenamento do transcript na tabela `transcriptions`

### Edge Function: Análise por Frameworks
- Envio do transcript para LLM (Lovable AI gateway como padrão, com opção de OpenAI/Anthropic)
- Análise estruturada retornando JSON com:
  - **BANT Score** (Budget, Authority, Need, Timeline — cada item 0-25)
  - **MEDDIC Score** (6 critérios — cada item 0-16.6)
  - **SPIN Score** (Situação, Problema, Implicação, Necessidade — cada item 0-25)
  - **Score Geral** (0-100)
  - **Temperatura**: Frio / Morno / Quente
  - **Métricas de conversa**: talk ratio, número de perguntas, tempo de escuta
  - **Highlights**: objeções, sinais de compra, momentos-chave
  - **Insights**: o que foi bem, o que faltou, sugestões práticas
  - **Sales Coach**: próximos passos, scripts recomendados

### Tabelas de resultados
- `analysis_results` com scores, temperatura, insights em JSONB
- `highlights` com trechos da conversa categorizados

---

## Fase 4 — RAG (Base de Conhecimento)

### Módulo Admin de Conhecimento
- Upload de documentos (PDF, DOC) com parsing
- CRUD de Produtos, Serviços e Cases com categorias
- Tabela `knowledge_documents` e `knowledge_items`

### Embeddings e Busca Semântica
- Ativar extensão `pgvector` no Supabase
- Edge function para gerar embeddings dos documentos (via OpenAI embeddings API)
- Na análise, buscar documentos relevantes e cruzar com transcript
- Identificar: oportunidades de cross-sell/upsell, aderência ao portfólio, soluções não exploradas

---

## Fase 5 — Relatório e Visualização

### Tela de Relatório da Reunião
- Score geral grande com indicador visual (gauge)
- Cards para cada framework (BANT, MEDDIC, SPIN) com barras de progresso
- Termômetro de temperatura da agenda
- Timeline com highlights clicáveis (objeções, sinais de compra)
- Seção de insights e recomendações do Sales Coach
- Métricas de conversa (talk ratio visual, duração, perguntas)
- Seção RAG: produtos/serviços relevantes e oportunidades identificadas

### Exportação
- Download do relatório em PDF

---

## Fase 6 — Dashboard Gerencial

### Visão Geral
- Score médio por vendedor (cards + ranking)
- Evolução temporal dos scores (gráfico de linha)
- Taxa de reuniões quentes vs mornas vs frias (donut chart)
- Principais gaps do time (radar chart)
- Comparação entre vendedores (tabela comparativa)
- Benchmarks: talk ratio ideal vs real, profundidade de discovery

### Filtros
- Por time, vendedor, período, temperatura

---

## Fase 7 — Admin e Controle

### Gestão de Usuários
- CRUD completo com atribuição de roles e times
- Permissões por nível (admin vê tudo, gestor vê seu time, vendedor vê suas agendas)

### Monitoramento
- Logs de processamento (cada etapa do pipeline)
- Controle de custos por API (tokens consumidos por análise)
- Tabela `api_usage_logs` com modelo usado, tokens, custo estimado
- Dashboard de uso com gastos por período

### Configurações
- Seleção de modelo de IA preferido (Lovable AI, OpenAI, Anthropic)
- Configuração de prompts customizados por framework
- Gestão de chaves de API externas (armazenadas como secrets)

