

## Plano: Persistir estado da gravação e upload na extensão Chrome

### Problema
O popup perde o estado ao ser fechado/reaberto porque usa apenas `isRecording` como flag. Não há distinção entre "gravando", "parando", "enviando" ou "concluído", e o cronômetro reinicia.

### Solução: Máquina de estados persistida no `chrome.storage.local`

Estados: `idle` | `recording` | `stopping` | `uploading` | `done` | `error`

### Mudanças por arquivo

**`extension/offscreen.js`**
- Ao iniciar gravação: salvar `recordingState: 'recording'` no storage
- Ao parar (onstop): salvar `recordingState: 'stopping'`, depois `'uploading'`
- Ao concluir upload: salvar `recordingState: 'done'` + `lastMeetingId`
- Ao erro: salvar `recordingState: 'error'` + `uploadError`
- Remover a limpeza de `isRecording`/`recordingStartTime` e usar `recordingState` em vez disso

**`extension/popup.js`**
- No `DOMContentLoaded`, ler `recordingState` e `recordingStartTime` do storage
- Restaurar a UI conforme o estado:
  - `recording` → mostrar cronômetro (usando `recordingStartTime` salvo)
  - `stopping`/`uploading` → mostrar status "Enviando..."
  - `done` → mostrar "Gravação enviada!" por 5s, depois voltar a idle
  - `error` → mostrar mensagem de erro salva
- Ao clicar "Iniciar": salvar `recordingState: 'recording'` + `recordingStartTime`
- Ao clicar "Parar": salvar `recordingState: 'stopping'`
- Continuar ouvindo mensagens do offscreen para atualizar UI em tempo real
- Remover referências a `isRecording` (substituído por `recordingState`)

**`extension/background.js`**
- Sem mudanças estruturais necessárias

**Re-empacotar**
- Recriar `public/sales-coach-extension.zip` com os arquivos atualizados

### Resultado
O cronômetro persiste ao fechar/reabrir o popup. O status de upload é visível mesmo após sair e voltar. Ao concluir, o popup mostra a confirmação corretamente.

