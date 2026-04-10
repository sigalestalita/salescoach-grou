

## Plano: Corrigir botão "Iniciar Gravação" da extensão Chrome

### Problema Identificado

Há **3 bugs** no código da extensão que impedem o funcionamento:

1. **`chrome.desktopCapture.chooseDesktopMedia` precisa receber a aba de origem como segundo parâmetro.** Sem isso, a API falha silenciosamente no Manifest V3. A assinatura correta é `chooseDesktopMedia(sources, targetTab, callback)`.

2. **O callback de `chooseDesktopMedia` recebe apenas `streamId`, não `(streamId, options)`.** O segundo parâmetro não existe nessa API.

3. **O `sendResponse` é chamado dentro de um callback assíncrono aninhado**, mas o canal de mensagem já pode estar fechado quando `chooseDesktopMedia` retorna. O popup nunca recebe a resposta e não muda de estado.

### Solução

**`extension/popup.js`** — ao clicar "Iniciar Gravação":
- Obter a aba ativa com `chrome.tabs.query({ active: true, currentWindow: true })` 
- Enviar o `tabId` junto na mensagem `startCapture`
- Após enviar a mensagem, já trocar a UI para "gravando" (otimista), pois o seletor de tela aparecerá em seguida

**`extension/background.js`** — `handleStartCapture`:
- Receber o `tabId` da mensagem
- Buscar o tab object com `chrome.tabs.get(tabId)`
- Passar o tab como segundo argumento: `chrome.desktopCapture.chooseDesktopMedia(['screen', 'window', 'tab'], tab, callback)`
- Corrigir assinatura do callback para receber apenas `streamId`
- Responder com `sendResponse({ success: true })` **antes** do callback do desktopCapture (indicando que o seletor foi aberto)
- Usar uma mensagem separada para notificar o popup sobre sucesso/falha da captura

**`extension/manifest.json`** — adicionar permissão `"tabs"` (necessária para `chrome.tabs.query`).

**`extension/offscreen.js`** — sem alterações necessárias.

### Mudanças por Arquivo

| Arquivo | Mudança |
|---------|---------|
| `extension/manifest.json` | Adicionar `"tabs"` às permissions |
| `extension/popup.js` | Enviar `tabId` com a mensagem; ouvir mensagem de resultado da captura |
| `extension/background.js` | Usar `tab` no `chooseDesktopMedia`; corrigir callback; responder antes do seletor |

### Re-empacotar
- Recriar `public/sales-coach-extension.zip` com os arquivos atualizados

