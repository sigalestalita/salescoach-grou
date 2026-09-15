# Sales Coach

Sistema de Análise de Agendas Comerciais com IA Avançada

Crie um sistema SaaS completo de análise inteligente de reuniões comerciais com uso de múltiplos modelos de IA (LLMs), capaz de transcrever, interpretar, analisar e gerar recomendações estratégicas com base em frameworks de vendas e na base de conhecimento da empresa.

🧠 Arquitetura de IA (OBRIGATÓRIO)

O sistema deve utilizar uma arquitetura híbrida de IA com:

1. LLM principal (análise e interpretação)

 Integração com APIs como:

 Anthropic (Claude)

 OpenAI (GPT)

 Responsável por:

 Interpretação semântica da conversa

 Classificação por frameworks (BANT, MEDDIC, SPIN)

 Geração de insights

 Avaliação qualitativa

2. Modelo de transcrição (speech-to-text)

 Exemplo:

 Whisper ou similar

 Responsável por:

 Converter áudio/vídeo em texto estruturado

 Separar speakers (diarization, se possível)

3. RAG (Retrieval-Augmented Generation)

 Implementar sistema de embeddings + busca semântica

 Baseado na base de conhecimento da empresa (Grou/PDA)

Responsável por:

 Cruzar o que foi falado com:

 Portfólio

 Serviços

 Materiais

 Identificar:

 Oportunidades de cross-sell

 Upsell

 SPIN Sell

 Validar aderência do discurso ao posicionamento da empresa

📥 Inputs aceitos

 Upload:

 MP3, WAV, M4A, MP4

 Links:

 YouTube

 Google Drive

🔄 Pipeline de processamento

 Upload ou ingestão do link

 Transcrição automática

 Identificação de speakers:

 SDR / Vendedor

 Lead

 Envio para LLM

 Análise estruturada:

 Frameworks de vendas

 Qualidade da conversa

 Uso do portfólio (via RAG)

 Geração de relatório + score

📊 Frameworks de análise

BANT

 Budget

 Authority

 Need

 Timeline

MEDDIC

 Metrics

 Economic buyer

 Decision criteria

 Decision process

 Identify pain

 Champion

SPIN Selling

 Situação

 Problema

 Implicação

 Necessidade

🧩 Base de Conhecimento (RAG)

Criar módulo onde o admin pode:

 Subir documentos (PDF, DOC, links)

 Cadastrar:

 Produtos

 Serviços

 Cases

 Organizar por categorias

A IA deve:

 Buscar contexto relevante em tempo real

 Comparar com a conversa

 Identificar:

 Falta de exploração de soluções

 Oportunidades não aproveitadas

 Aderência ao discurso ideal

📈 Métricas e Outputs

🔥 Score geral (0–100)

Baseado em:

 Qualificação

 Condução da reunião

 Aderência a frameworks

 Uso do portfólio

🌡️ Temperatura da agenda

 Frio / Morno / Quente

 Derivado de BANT + MEDDIC + intenção do lead

⏱️ Métricas de conversa

 Duração total

 Talk ratio (vendedor vs lead)

 Tempo de escuta ativa

 Número de perguntas

🎯 Scores por framework

 BANT score

 MEDDIC score

 SPIN score

💡 Insights automáticos

 O que foi bem feito

 O que faltou explorar

 Sugestões práticas

🧠 Highlights

 Principais trechos

 Objeções

 Momentos de interesse

 Sinais de compra

📊 Benchmarks

Inspirado em ferramentas como Gong:

 Talk ratio ideal vs real

 Profundidade de discovery

 Clareza de proposta de valor

🤖 Camada de Inteligência (Diferencial)

A IA deve também:

 Atuar como um “Sales Coach”

 Gerar:

 Sugestões de melhoria personalizadas

 Scripts recomendados

 Próximos passos ideais

 Identificar padrões:

 Erros recorrentes

 Melhores práticas dos top performers

👥 Gestão de usuários

Roles:

 Admin

 Gestor

 SDR/Vendedor

Funcionalidades:

 Cadastro de usuários

 Permissões por nível

 Organização por:

 Time

 Vendedor

 SDR

📂 Organização de agendas

 Pastas por vendedor

 Histórico de reuniões

 Biblioteca individual e por time

📊 Dashboard

 Score médio por vendedor

 Evolução temporal

 Ranking

 Taxa de reuniões quentes

 Principais gaps do time

 Comparação entre vendedores

⚙️ Backend / Admin

 CRUD de usuários

 Gestão da base de conhecimento

 Monitoramento de uso de IA

 Logs de processamento

 Controle de custos por API (MUITO IMPORTANTE)

🚀 Requisitos técnicos importantes

 Sistema escalável (multi-tenant)

 Integração com APIs de IA

 Armazenamento de arquivos

 Banco vetorial (para RAG)

 Segurança de dados (LGPD)

🎯 Objetivo final

Criar um sistema que não apenas analisa reuniões, mas:

 Aumenta a taxa de conversão

 Melhora a qualidade de qualificação

 Escala o aprendizado do time comercial

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://salescoach-grou.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7091a1a7-4d80-4df6-9894-3dc3266b74c6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
