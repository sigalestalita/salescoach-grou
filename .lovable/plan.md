

## Corrigir Download de Arquivos do Google Drive

### Problema
O arquivo do Google Drive (`1PSSUTiFGG9qnZUj5hhgVFxwzNMXrQZ7y`) está retornando uma **página HTML de confirmação** em vez do arquivo real. Isso acontece com arquivos grandes no Google Drive — o Google exige confirmação antes do download. A URL direta atual (`drive.usercontent.google.com/download?...&confirm=t`) não está funcionando para este arquivo.

O AssemblyAI recebe HTML ao invés de áudio e falha com "File type is text/html".

### Solução
Modificar o `analyze-meeting/index.ts` para que, quando o link for do Google Drive, o Edge Function **baixe o arquivo primeiro** no servidor, verifique se é realmente mídia (não HTML), e então **faça upload para o AssemblyAI** usando a função `uploadToAssemblyAI` que já existe no código.

### Mudança no `supabase/functions/analyze-meeting/index.ts`

No bloco `youtube_url` com Drive (linhas 191-208), alterar o fluxo:

**Antes:** passa a URL direta do Drive para o AssemblyAI transcrever remotamente.

**Depois:**
1. Baixa o arquivo do Google Drive no Edge Function (com headers que simulam navegador e seguem redirects)
2. Verifica o Content-Type — se for HTML, tenta extrair o link real de confirmação do HTML e baixar novamente
3. Faz upload do blob para o AssemblyAI via `uploadToAssemblyAI()` (já existente)
4. Transcreve usando a URL do upload do AssemblyAI

```text
Drive link → Edge Function baixa o arquivo → Upload para AssemblyAI → Transcreve
```

Isso elimina o problema de confirmação do Google Drive, pois o Edge Function lida com redirects e confirmações antes de enviar ao AssemblyAI.

### Arquivos modificados
- `supabase/functions/analyze-meeting/index.ts` — alterar fluxo de Google Drive para download + upload ao invés de URL direta

