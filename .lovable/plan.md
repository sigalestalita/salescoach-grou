

## Plano: Suporte a arquivos grandes do Google Drive

### Problema
- Edge Functions tem limite de ~150MB de RAM: arquivos grandes causam "Memory limit exceeded"
- Groq Whisper tem limite de 25MB por upload
- Todos os arquivos do usuário são grandes e estão no Google Drive

### Solução: Usar API de transcrição que aceita URLs diretamente

Em vez de baixar o arquivo para a Edge Function e re-enviar para o Groq, usar uma API que aceita a URL do arquivo diretamente. Isso elimina ambos os limites (memória da Edge Function e tamanho do Groq).

**API escolhida: AssemblyAI**
- Aceita URLs de áudio/vídeo diretamente (sem download no servidor)
- Free tier: 100 horas de transcrição/mês
- Suporte a arquivos de qualquer tamanho
- Detecção automática de idioma e speaker diarization

### Alterações

#### 1. Adicionar secret `ASSEMBLYAI_API_KEY`
- Chave obtida em: https://www.assemblyai.com (cadastro gratuito)

#### 2. Atualizar `supabase/functions/analyze-meeting/index.ts`

**Nova função `transcribeFromUrl`:**
- Envia a URL pública do Google Drive diretamente para a API AssemblyAI
- AssemblyAI faz o download e transcrição internamente (sem uso de memória na Edge Function)
- Usa polling para aguardar resultado (a transcrição é assíncrona)
- Retorna o texto + speaker labels se disponíveis

**Lógica de decisão atualizada:**

```text
Reunião com Google Drive link:
  1. Gerar URL direta do Google Drive (formato download)
  2. Enviar URL para AssemblyAI (sem baixar o arquivo)
  3. Poll até transcrição completa
  4. Continuar com análise AI normalmente

Reunião com arquivo no Storage (< 25MB):
  1. Baixar do Storage
  2. Transcrever com Groq (rápido, já configurado)

Reunião com transcrição manual:
  1. Usar texto colado pelo usuário
```

**Fluxo AssemblyAI:**
```text
POST /v2/transcript { audio_url: "https://drive.google.com/..." }
  → recebe { id: "abc123", status: "queued" }

GET /v2/transcript/abc123 (poll a cada 5s)
  → { status: "completed", text: "...", utterances: [...] }
```

#### 3. Atualizar `downloadFromGoogleDrive` → `getGoogleDriveDirectUrl`
- Em vez de baixar o arquivo, retorna apenas a URL direta de download
- A URL é passada para o AssemblyAI que faz o download internamente

#### 4. Manter fallbacks
- Groq para arquivos pequenos do Storage
- OpenAI como último fallback
- Transcrição manual sempre disponível

### Resultado esperado
- Arquivos de qualquer tamanho do Google Drive funcionam sem erros de memória
- Nenhum download de arquivo na Edge Function para links do Drive
- Transcrição com speaker diarization (bônus do AssemblyAI)
- 100 horas/mês grátis

