

## Plano: Migrar transcrição para Groq Whisper API

### Contexto
Atualmente a edge function `analyze-meeting` usa a API da OpenAI Whisper (`api.openai.com`) para transcrição. A Groq oferece o mesmo modelo Whisper com velocidade ~10x superior e custo ~9x menor, com tier gratuito.

### Alterações

#### 1. Adicionar secret GROQ_API_KEY
- Usar a ferramenta `add_secret` para solicitar a chave da API Groq ao usuário
- Chave obtida em: https://console.groq.com/keys (gratuito)

#### 2. Atualizar `supabase/functions/analyze-meeting/index.ts`
- Modificar a função `transcribeWithWhisper` para usar a API da Groq:
  - Endpoint: `https://api.groq.com/openai/v1/audio/transcriptions`
  - Modelo: `whisper-large-v3-turbo` (mais rápido, mesma qualidade)
  - Header: `Authorization: Bearer ${GROQ_API_KEY}`
- Renomear a função para `transcribeAudio` para refletir a mudança
- Remover dependência de `OPENAI_API_KEY` para transcrição (manter apenas se usado em outro lugar)
- Fallback: se `GROQ_API_KEY` não estiver configurada, usar `OPENAI_API_KEY` como fallback

#### 3. Formato da chamada (compatível com OpenAI)
A API da Groq é compatível com o formato OpenAI, então a mudança é mínima:
```typescript
// Antes
const url = "https://api.openai.com/v1/audio/transcriptions";
const key = openaiKey;
const model = "whisper-1";

// Depois  
const url = "https://api.groq.com/openai/v1/audio/transcriptions";
const key = groqKey;
const model = "whisper-large-v3-turbo";
```

### Resultado esperado
- Transcrições ~10x mais rápidas
- Custo ~9x menor
- Mesma qualidade (mesmo modelo Whisper)
- Fallback para OpenAI se Groq não configurada

