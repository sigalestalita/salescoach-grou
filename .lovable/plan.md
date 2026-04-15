

## Importação em Lote do Google Drive — Sem API Key do Google

### Abordagem

Em vez de usar a Google Drive API (que exige uma API Key), o usuário cola o link da pasta do Google Drive e o sistema apresenta um campo de texto onde ele cola **múltiplos links de arquivos** de uma vez. Alternativamente, podemos fazer scraping da página pública da pasta para extrair os IDs dos arquivos.

A abordagem mais confiável e sem dependência externa: **importação por lista de links**.

### Como funciona

1. Novo botão "Importar em Lote" na página Agendas
2. Abre um Dialog com um campo de texto grande (textarea)
3. O usuário cola vários links do Google Drive (um por linha)
4. Opcionalmente define tipo de reunião e vendedor
5. O sistema cria uma agenda para cada link e dispara a análise automaticamente
6. Mostra progresso: quantos foram criados e status de cada um

### Mudanças

#### 1. UI: Novo botão e Dialog em `src/pages/Agendas.tsx`
- Botão "Importar em Lote" ao lado do botão existente de criar agenda
- Dialog com:
  - Textarea para colar múltiplos links (um por linha)
  - Select de tipo de reunião
  - Select de vendedor (se admin)
- Validação: extrai file IDs dos links, ignora linhas vazias/inválidas
- Cria cada meeting via Supabase e dispara `analyze-meeting` para cada uma
- Barra de progresso mostrando quantas foram processadas

#### 2. Nova Edge Function: `supabase/functions/import-bulk-meetings/index.ts`
- Recebe array de links do Google Drive + metadata (seller_id, meeting_type)
- Para cada link válido:
  - Extrai o file ID
  - Cria registro na tabela `meetings` com `youtube_url` = link do Drive
  - Dispara `analyze-meeting` sequencialmente
- Retorna lista de meetings criadas com status

#### 3. Fluxo
```text
[Botão "Importar em Lote"] → Dialog com textarea
  → Usuário cola 10 links do Drive (um por linha)
  → Edge Function cria 10 agendas
  → Dispara análise para cada uma sequencialmente
  → Usuário vê todas na lista com status "transcrevendo"
```

### Vantagens
- Zero dependência de API Key do Google
- Funciona com o fluxo de análise já existente (AssemblyAI + Drive links)
- Simples e confiável
- Usuário pode copiar links rapidamente do Drive

