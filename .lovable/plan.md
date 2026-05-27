## Diagnóstico

A funcionalidade ao vivo não está chegando nas funções de backend: não há logs recentes em `live-transcribe` nem em `live-coach`, e no print o indicador `LIVE` não aparece ao lado de `Gravando`. Isso indica que a extensão está gravando, mas o pipeline realtime não inicia.

Causas encontradas:

1. **A reunião ao vivo não consegue ser criada**
   - A extensão tenta criar a reunião com `status: 'ao_vivo'` antes de abrir o WebSocket.
   - A tabela `meetings` tem uma regra que só aceita: `enviado`, `baixando`, `transcrevendo`, `analisando`, `completo`, `erro`.
   - Resultado: o insert com `ao_vivo` falha, `meetingId` fica vazio e a extensão desliga o live silently. Sem `meetingId`, não abre `live-transcribe`, não há transcrição e não há insights.

2. **A conexão AssemblyAI realtime está incompleta para a API atual**
   - A documentação atual do AssemblyAI Streaming v3 exige `speech_model` na URL do WebSocket.
   - O código atual usa `sample_rate=16000&format_turns=true&language_code=pt`, mas não envia `speech_model`.
   - Isso pode fazer a conexão com AssemblyAI falhar mesmo depois que o WebSocket da extensão passar a abrir.

3. **Falta observabilidade no overlay**
   - Hoje, quando o realtime falha, o usuário só vê “Aguardando primeiras falas…” e `...`.
   - O erro real fica escondido no console, o que mascara falhas de criação da reunião, WebSocket, token, AssemblyAI ou Realtime.

## Plano de correção

1. **Corrigir o status ao vivo no banco**
   - Criar migration para atualizar a regra de `meetings.status` e incluir `ao_vivo`.
   - Preservar todos os status atuais.
   - Garantir que as permissões necessárias continuem disponíveis para usuários autenticados e backend.

2. **Corrigir a abertura da transcrição ao vivo**
   - Em `supabase/functions/live-transcribe/index.ts`, ajustar a URL do AssemblyAI Streaming v3 para incluir um modelo válido, preferencialmente `speech_model=u3-rt-pro`.
   - Usar parâmetros compatíveis com áudio PCM16 16k mono, como `encoding=pcm_s16le` e `sample_rate=16000`.
   - Validar a resposta de geração do token temporário antes de abrir o WebSocket.
   - Logar status/razão de fechamento da conexão AssemblyAI.

3. **Tornar o erro visível na extensão**
   - Em `extension/content.js`, quando `preCreateMeeting` falhar, exibir uma mensagem clara no card de transcrição/dicas em vez de só esconder o `LIVE`.
   - Mostrar estados como: “Live indisponível: reunião não criada”, “Conectando transcrição…”, “Transcrição conectada”, “Erro no WebSocket”.
   - Manter logs técnicos no console para diagnóstico futuro.

4. **Fortalecer o Realtime dos insights**
   - Confirmar o `phx_join` do Realtime com tratamento de `phx_reply`.
   - Se o join falhar, exibir erro no overlay.
   - Manter inscrição filtrada por `meeting_id` em `live_tips`.

5. **Atualizar e reempacotar a extensão**
   - Subir a versão do `manifest.json`.
   - Regenerar `public/sales-coach-extension.zip`.
   - A página `/extensao` continuará baixando o ZIP atualizado.

6. **Validação final**
   - Verificar no banco se uma reunião com `status = ao_vivo` é criada ao iniciar gravação.
   - Verificar logs de `live-transcribe` mostrando conexão do cliente e AssemblyAI.
   - Verificar inserts em `transcription_segments` após fala real.
   - Verificar chamada de `live-coach` e inserts em `live_tips`.
   - Confirmar que o overlay exibe texto transcrito e pelo menos uma dica realtime após alguns segundos de conversa.