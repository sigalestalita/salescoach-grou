

## Diagnóstico — por que as últimas agendas não estão funcionando

### Evidências coletadas
1. **As 3 agendas travadas** (`Teste 2`, `Teste Tali`, `Reunião Mariana + Daniela Bertoldo`) usam o **mesmo arquivo do Google Drive** (`1PSSUTiFGG9qnZUj5hhgVFxwzNMXrQZ7y`).
2. **Todas estão presas no status `baixando`** — nunca chegam a `transcrevendo`.
3. Nenhuma transcrição foi gravada para esses 3 meetings (tabela `transcriptions` vazia para eles).
4. Não há logs da edge function `analyze-meeting` — indicando que a função **morreu silenciosamente** (estouro de memória/CPU).
5. Testei a URL direta do Drive via curl: retorna **HTTP 200** com `Content-Type: video/mp4` e **`Content-Length: 703.051.832 bytes (~703 MB)`**.
6. O compartilhamento está correto (a página servida é o próprio arquivo MP4, sem HTML de confirmação).

### Causa raiz
O código atual em `supabase/functions/analyze-meeting/index.ts` (função `downloadFromGoogleDrive`) **baixa o arquivo inteiro como Blob na memória da edge function** antes de fazer upload para a AssemblyAI:

```ts
let res = await fetch(url, { headers, redirect: "follow" });
let blob = await res.blob();   // ← 703 MB carregados em memória
...
assemblyAudioUrl = await uploadToAssemblyAI(fileBlob);
```

Edge Functions têm limites estritos de **memória (~256 MB) e tempo de execução**. Um arquivo de 703 MB:
- Estoura a memória → o processo é morto pelo runtime sem nem conseguir executar `update({ status: "erro" })`.
- A meeting fica eternamente no estado `baixando`.
- Por isso o "Travado" e o "Tentar novamente" implementados ontem **não resolvem** — o próximo retry vai estourar exatamente do mesmo jeito.

### Por que arquivos menores funcionavam
As reuniões com sucesso (`Wal Almeida`, `Eduardo Neves`, etc.) provavelmente são gravações curtas/menores que cabem na memória. O arquivo de 703 MB é uma gravação completa do Google Meet (cerca de 1h+ em alta qualidade).

### A solução: pular o download intermediário

A AssemblyAI **aceita uma URL pública diretamente** no parâmetro `audio_url` — ela mesma faz o download do arquivo nos servidores dela, sem qualquer limite de tamanho da nossa edge function.

Como verifiquei, `https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t` responde **HTTP 200 direto com o MP4** quando o arquivo está compartilhado como "Qualquer pessoa com o link" — exatamente como está esse arquivo (confirmado no print do compartilhamento).

### Plano de implementação

**1. Refatorar `analyze-meeting/index.ts`**
- Para links do Google Drive: **NÃO baixar mais o arquivo na edge function**. Em vez disso:
  - Construir a URL direta `https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t`.
  - Fazer um `HEAD` rápido (ou GET de 1KB com Range) só para validar que o arquivo é acessível e não retorna HTML.
  - Passar a URL diretamente para `transcribeWithAssemblyAI()` (que já chama `POST /v2/transcript` com `audio_url`).
- Manter `downloadFromGoogleDrive` apenas como fallback caso a validação detecte HTML (arquivo privado).

**2. Validação inteligente antes de submeter à AssemblyAI**
- Se o `HEAD` retornar `Content-Type: text/html` ou status >= 400, atualizar `meetings.status = "erro"` com uma mensagem clara: "Arquivo do Google Drive não está acessível publicamente. Verifique se o compartilhamento está como 'Qualquer pessoa com o link'."
- Se retornar `video/*` ou `audio/*` ou `application/octet-stream` com tamanho > 0, prosseguir.

**3. Adicionar coluna `error_message` em `meetings`** (migração)
- Atualmente não existe — por isso o usuário só vê "deu erro" sem detalhes.
- Exibir essa mensagem em `MeetingDetail.tsx` e `Agendas.tsx` quando `status = 'erro'`.

**4. Reprocessar as 3 agendas travadas** automaticamente após o deploy para validar.

### Resultado esperado
- Arquivos de qualquer tamanho do Google Drive (incluindo o de 703 MB) processam sem problema, porque a AssemblyAI baixa direto da Google.
- Quando houver falha real (arquivo privado, link quebrado), a mensagem de erro real chega até o usuário com instrução do que corrigir.
- Tempo de execução da edge function cai de minutos (download) para segundos (apenas dispatch).

### Arquivos afetados
- `supabase/functions/analyze-meeting/index.ts` — refatorar fluxo do Drive
- Nova migração SQL — adicionar `meetings.error_message TEXT`
- `src/pages/MeetingDetail.tsx` — exibir `error_message`
- `src/pages/Agendas.tsx` — tooltip/badge com `error_message` quando status=erro
- Memória `mem://tech/google-drive-integration` — atualizar com a nova estratégia

