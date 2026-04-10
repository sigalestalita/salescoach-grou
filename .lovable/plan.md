

## Plano: Extensão Chrome com Gravação de Tela + Áudio

### Contexto
Os executivos compartilham tela durante apresentações comerciais. A extensão precisa capturar tanto o áudio quanto o vídeo da tela, gerando uma gravação completa da reunião.

### Arquitetura

**Extensão Chrome (Manifest V3)**

| Arquivo | Função |
|---------|--------|
| `extension/manifest.json` | Permissões: tabCapture, desktopCapture, storage, offscreen |
| `extension/popup.html` + `popup.js` | UI: botões Gravar/Parar, campos título, tipo, lead |
| `extension/background.js` | Service worker: coordena captura via `chrome.desktopCapture` ou `chrome.tabCapture` |
| `extension/offscreen.html` + `offscreen.js` | MediaRecorder gravando vídeo+áudio (webm/vp8+opus) |
| `extension/icon.png` | Ícone da extensão |

**Captura de tela + áudio:**
- Usa `chrome.desktopCapture.chooseDesktopMedia` para o executivo selecionar qual tela/aba compartilhar (mesma UX do Google Meet)
- O stream resultante inclui vídeo da tela + áudio do sistema
- Opcionalmente combina com áudio do microfone via `navigator.mediaDevices.getUserMedia({ audio: true })`
- Grava em formato WebM (vídeo+áudio) via MediaRecorder no offscreen document

**Edge Function: `upload-recording`**
- Recebe o arquivo WebM via multipart upload
- Salva no bucket `meeting-files`
- Cria registro na tabela `meetings`
- Dispara o pipeline `analyze-meeting` existente (que extrai o áudio para transcrição)

**Fluxo de dados:**
```text
Tela compartilhada + Microfone
  → chrome.desktopCapture → MediaStream (vídeo+áudio)
  → MediaRecorder → blob WebM
  → POST /upload-recording
       → Supabase Storage (meeting-files)
       → meetings table (status: "enviado")
       → analyze-meeting pipeline
```

### Funcionalidades do Popup
1. Botão "Gravar" — abre seletor de tela/aba, inicia gravação
2. Timer mostrando duração da gravação
3. Campos: título da agenda, tipo (empresa/consultoria), lead (nome, empresa, email)
4. Botão "Parar e Enviar" — para gravação, faz upload automático
5. Indicador de status (gravando, enviando, concluído)
6. Login com credenciais do Sales Coach (token salvo no chrome.storage)

### Página de Download
- Adicionar rota `/extensao` no app com instruções de instalação e botão de download do ZIP
- ZIP gerado e disponibilizado em `public/sales-coach-extension.zip`

### Detalhes Técnicos
- `chrome.desktopCapture` permite capturar tela inteira, janela específica ou aba — o executivo escolhe
- O vídeo gravado fica disponível como anexo na página de detalhes da reunião
- A transcrição continua usando apenas o áudio extraído do WebM (AssemblyAI aceita WebM diretamente)
- Chunk upload para arquivos grandes (>50MB): divide em partes e faz upload sequencial

