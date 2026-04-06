

## Diagnóstico

Existem dois problemas identificados:

1. **Bug na detecção de link**: A variável `isLinkBased` usa `meeting.meeting_type` que sempre tem valor (default 'empresa'), fazendo com que QUALQUER meeting sem arquivo seja tratado como "link-based", mesmo que não tenha link
2. **Fluxo confuso para reuniões com link**: O usuário precisa colar manualmente a transcrição, mas a UX não deixa claro o que fazer. O botão "Analisar" no header fica escondido e substituído por "Analisar (colar transcrição)"
3. **Erro potencial no invoke**: A resposta de erro da edge function pode não estar sendo tratada corretamente (o `error` do `invoke` pode não conter a mensagem real)

## Plano de Correção

### 1. Corrigir detecção `isLinkBased` (MeetingDetail.tsx)
- Mudar de `(meeting.youtube_url || meeting.meeting_type)` para apenas `!!meeting.youtube_url`

### 2. Melhorar UX da transcrição manual (MeetingDetail.tsx)
- Para meetings com link, mostrar o input de transcrição SEMPRE (sem precisar clicar num botão separado)
- Remover o estado `showTranscriptInput` e exibir diretamente quando `isLinkBased && status === 'enviado'`
- Manter um único botão "Iniciar Análise" junto ao textarea

### 3. Melhorar tratamento de erro no handleAnalyze
- Extrair a mensagem de erro do body da resposta quando a edge function retorna erro HTTP
- Mostrar toast com mensagem descritiva

### 4. Exibir a transcrição após análise completa
- Garantir que a seção de transcrição aparece também para meetings com link após processamento

### Arquivos modificados
- `src/pages/MeetingDetail.tsx` — corrigir `isLinkBased`, simplificar fluxo do textarea, melhorar error handling

