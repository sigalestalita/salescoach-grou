

## Importação em Lote de Gravações do Google Drive

### Problema
Atualmente, cada gravação do Google Drive precisa ser adicionada manualmente com um link individual. Quando o usuário tem uma pasta inteira com várias gravações, isso é trabalhoso e lento.

### Solução
Criar uma funcionalidade de "Importar Pasta do Drive" que:
1. Recebe o link de uma pasta do Google Drive
2. Lista todos os arquivos de áudio/vídeo da pasta via API do Google Drive
3. Cria automaticamente uma agenda para cada arquivo encontrado
4. Inicia a análise de todas em sequência

**Requisito**: A pasta precisa estar compartilhada como "Qualquer pessoa com o link" (mesmo requisito atual para links individuais).

### Mudanças

#### 1. Nova Edge Function: `supabase/functions/import-drive-folder/index.ts`
- Recebe o link da pasta do Google Drive e metadata (seller_id, meeting_type)
- Extrai o folder ID do link
- Usa a Google Drive API pública (`https://www.googleapis.com/drive/v3/files?q='FOLDER_ID'+in+parents`) com a API Key do Google para listar arquivos
- Filtra apenas arquivos de mídia (mp3, mp4, webm, wav, m4a, ogg, etc.)
- Para cada arquivo encontrado:
  - Cria um registro na tabela `meetings` com o link direto do arquivo como `youtube_url`
  - Dispara a função `analyze-meeting` para processar
- Retorna a lista de reuniões criadas

#### 2. Secret necessária: `GOOGLE_API_KEY`
- Uma API Key simples do Google Cloud (não OAuth) é suficiente para listar arquivos em pastas públicas
- Será solicitada ao usuário antes da implementação

#### 3. UI: Novo botão "Importar Pasta" na página Agendas (`src/pages/Agendas.tsx`)
- Adiciona um novo Dialog com campos:
  - Link da pasta do Google Drive
  - Tipo de reunião (empresa/individual)
  - Vendedor responsável
- Mostra progresso da importação (quantos arquivos encontrados, quantos criados)
- Após importação, atualiza a lista de agendas automaticamente

#### 4. Fluxo visual
```text
[Botão "Importar Pasta"] → Dialog com link da pasta
  → Edge Function lista arquivos na pasta
  → Cria N agendas automaticamente
  → Dispara análise para cada uma
  → Usuário vê todas na lista com status "transcrevendo"
```

### Detalhes Técnicos
- A Google Drive API v3 permite listar arquivos em pastas públicas usando apenas uma API Key (sem OAuth)
- O endpoint usado será: `GET https://www.googleapis.com/drive/v3/files?q='{folderId}'+in+parents&key={apiKey}&fields=files(id,name,mimeType)`
- Cada arquivo será convertido para o link de download direto que o `analyze-meeting` já sabe processar
- O processamento será sequencial (um por vez) para não sobrecarregar a transcrição

