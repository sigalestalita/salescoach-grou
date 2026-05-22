# Plano — Sales Coach AI ao vivo (Live Coaching)

## Objetivo
Durante a reunião (Google Meet, Zoom Web, Teams Web), exibir um painel flutuante na tela do vendedor com **dicas em tempo real** (a cada ~10–20s): próxima pergunta SPIN, alerta de talk-ratio, objeção detectada, gatilho da base de conhecimento, etc. — sem esperar o fim da gravação.

## Arquitetura proposta

```text
[Extensão Chrome (overlay na aba da reunião)]
        │  microfone + áudio do sistema (já capturados hoje)
        │
        │  WebSocket binário (PCM16 16kHz)
        ▼
[Edge Function: live-transcribe (Deno + WebSocket relay)]
        │  pipe para AssemblyAI Realtime (Streaming v3)
        ▼
[AssemblyAI Realtime] ── transcrição parcial + final por turno
        │
        ▼
[Edge Function: live-coach]
   • buffer dos últimos ~60s de transcrição
   • a cada 15s (ou ao detectar fim de turno do lead) chama
     Lovable AI Gateway (google/gemini-3.5-flash) com:
       - últimos turnos
       - contexto da reunião (lead, empresa, tipo)
       - trechos relevantes da base de conhecimento (RAG)
   • retorna JSON: { dica, urgencia, categoria, citação_kb? }
        │
        ▼  Realtime (Supabase channel "meeting:{id}")
[Overlay da extensão] mostra cards de dica + métricas ao vivo
```

## Por que essa pilha
- **AssemblyAI Streaming v3** já é o provedor atual e suporta PT-BR em tempo real (latência ~300ms). Reaproveita `ASSEMBLYAI_API_KEY`.
- **Gemini 3.5 Flash** via Lovable AI: rápido, barato, bom para PT-BR e instruction-following — ideal para gerar dicas curtas a cada 15s.
- **Supabase Realtime** já existe no projeto; só precisa publicar mensagens num canal por reunião.
- A extensão já captura `screenStream` + `micStream` e mistura num `AudioContext` — basta plugar um `ScriptProcessor`/`AudioWorklet` para enviar PCM via WS em paralelo ao `MediaRecorder` que continua salvando o arquivo final.

## Fluxo de dicas (live-coach prompt)
A cada disparo (15s ou turno do lead encerrado), o agente recebe:
- janela de transcrição (últimos 60s, com speaker labels)
- meta da reunião (lead, empresa, tipo)
- top-3 chunks da KB (busca vetorial pelas últimas falas do lead)
- estado anterior (dicas já emitidas para não repetir)

E devolve **no máximo 1 dica**:
```json
{
  "should_emit": true,
  "categoria": "SPIN | objecao | talk_ratio | proxima_pergunta | kb",
  "urgencia": "baixa | media | alta",
  "titulo": "Lead mencionou preço — ancore valor antes",
  "acao": "Pergunte: 'quanto custa hoje não resolver isso?'",
  "fonte_kb": "doc_id opcional"
}
```

## Overlay ao vivo (extensão)
Adicionar à UI existente em `content.js`/`content.css`:
- Painel lateral colapsável com lista de dicas (últimas 5)
- Indicadores ao vivo: **Talk ratio %**, **última pergunta aberta há Xs**, **temperatura provisória**
- Toggle "modo silencioso" (só registra, não exibe) — para quem prefere review pós-call
- Notificação sutil (badge pulsando) quando dica de urgência alta chega

## Mudanças necessárias

### Extensão
- `content.js`: paralelo ao `MediaRecorder`, criar `AudioWorkletNode` que envia PCM16 para WS `/live-transcribe?meetingId=...`
- `content.css`: novo painel de dicas (já temos design system do overlay)
- Criar meeting no Supabase **antes** de começar (status `ao_vivo`) para ter o `meetingId`; ao parar, faz o upload do arquivo final e dispara `analyze-meeting` para a análise completa (o que já existe hoje)

### Edge Functions (novas)
- `live-transcribe/index.ts` — upgrade HTTP→WS, abre socket com AssemblyAI Realtime, faz relay bidirecional e grava cada turno final em `transcription_segments` (tabela nova)
- `live-coach/index.ts` — invocada por trigger/cron interno a cada 15s OU chamada direta pelo `live-transcribe` quando detecta fim de turno do lead; publica no canal Realtime `meeting:{id}:tips`

### Banco
- Nova tabela `transcription_segments(meeting_id, start_ms, end_ms, speaker, text, is_final)` — necessária para análise contínua sem esperar a transcrição completa
- Nova tabela `live_tips(meeting_id, emitted_at, categoria, urgencia, titulo, acao, fonte_kb_id)` — histórico de dicas + auditoria
- Realtime habilitado nas duas

### Frontend (`/MeetingDetail`)
- Aba "Ao vivo" quando `status='ao_vivo'`: mostra transcrição streaming + timeline de dicas emitidas (mesma view que o vendedor viu, para o gestor acompanhar remotamente se quiser)

## Detalhes técnicos importantes
- **Supabase Edge Functions suportam WebSocket** (`Deno.upgradeWebSocket`) — viável fazer o relay sem servidor adicional.
- **Latência alvo**: transcrição parcial < 500ms, dica do coach < 3s após fim do turno do lead.
- **Custo**: AssemblyAI Realtime é cobrado por minuto de áudio. Gemini Flash via Lovable AI é barato. Vale adicionar **toggle por reunião** ("ativar coach ao vivo") para o vendedor decidir quando ligar.
- **Privacidade**: deixar claro no overlay que áudio está sendo enviado para transcrição em tempo real.
- **Fallback**: se o WS cair, a gravação local continua e a análise pós-call (atual) funciona normalmente — live coaching é aditivo, nunca substitui.

## Entrega em fases

**Fase 1 — MVP (transcrição ao vivo + dica simples)**
- `live-transcribe` WS + AssemblyAI Realtime
- Tabela `transcription_segments` + Realtime
- Overlay mostrando transcrição streaming (sem coach ainda)
- Validação: latência, qualidade do PT-BR

**Fase 2 — Coach reativo**
- `live-coach` com Gemini Flash + RAG da KB
- Painel de dicas no overlay
- Tabela `live_tips`

**Fase 3 — Métricas ao vivo + visão do gestor**
- Talk-ratio rolling window, temperatura provisória
- Aba "Ao vivo" em `MeetingDetail` para gestor acompanhar

## Arquivos afetados (estimativa)
- `extension/content.js`, `extension/content.css`, `extension/manifest.json`
- `supabase/functions/live-transcribe/index.ts` (novo)
- `supabase/functions/live-coach/index.ts` (novo)
- Migração SQL: `transcription_segments`, `live_tips`, RLS, realtime
- `src/pages/MeetingDetail.tsx` (aba ao vivo)
- Memória `mem://features/live-coaching` (nova)

## Riscos / pontos de decisão
1. **Extensão Chrome vs PWA**: hoje a extensão é Manifest V3 e já tem permissões de captura — caminho mais curto. Alternativa: PWA standalone, mas perde captura de áudio do sistema sem extensão.
2. **AssemblyAI Realtime PT-BR**: confirmar qualidade. Plano B: Deepgram Nova-3 (melhor PT-BR ao vivo) — exigiria nova `secret`.
3. **Fim de turno**: usar `end_of_turn` da AssemblyAI v3 (recomendado) em vez de cron 15s — dicas mais naturais.
4. **Limite de WS em Edge Functions**: ~150s por conexão em alguns planos — precisa reconnect transparente do lado da extensão.

Quer que eu siga com a **Fase 1** (transcrição ao vivo, sem coach ainda) ou prefere ir direto para um MVP minimalista das 3 fases?
