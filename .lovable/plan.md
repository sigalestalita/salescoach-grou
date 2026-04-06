

# Edge Functions: Transcrição (Whisper) + Análise com IA

## Overview
Recebemos a chave da OpenAI. Vamos armazená-la como secret e criar as edge functions do pipeline de análise de reuniões.

## Steps

### 1. Armazenar OPENAI_API_KEY como secret
- Usar a ferramenta `add_secret` para salvar a chave de forma segura no backend

### 2. Edge Function: `analyze-meeting`
Pipeline completo em uma única função:

1. **Receber** `meetingId` no body
2. **Buscar** o meeting e o arquivo de áudio do Storage
3. **Transcrever** usando OpenAI Whisper API (`whisper-1`)
4. **Salvar** transcrição na tabela `transcriptions`
5. **Analisar** o transcript via Lovable AI gateway (Gemini) com prompt estruturado para extrair:
   - BANT, MEDDIC, SPIN scores
   - Score geral (0-100) e temperatura (frio/morno/quente)
   - Talk ratio, insights, sales coach recommendations
6. **Salvar** resultados na tabela `analysis_results`
7. **Atualizar** status do meeting para "completo" (ou "erro")

### 3. Atualização do Frontend
- Atualizar `MeetingDetail.tsx` e `Agendas.tsx` para exibir a transcrição
- Adicionar seção de transcrição com separação de speakers no relatório

### Technical Details

**Whisper API call:**
- Endpoint: `https://api.openai.com/v1/audio/transcriptions`
- Model: `whisper-1`
- Suporta: mp3, wav, m4a, mp4
- Retorna texto transcrito

**Análise via Lovable AI:**
- Prompt em português com instruções para retornar JSON estruturado
- Modelo: `google/gemini-2.5-flash` via gateway
- Output: scores BANT/MEDDIC/SPIN, temperatura, insights, sales coach

**Status pipeline:** `enviado → transcrevendo → analisando → completo/erro`

