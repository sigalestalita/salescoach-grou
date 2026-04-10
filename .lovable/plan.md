

## Plano: Corrigir filtro de Serviços no Gerador de Argumentos

### Problema Identificado
A tabela `knowledge_items` (Produtos & Serviços) está vazia. O Gerador de Argumentos busca serviços apenas dessa tabela, então quando o executivo seleciona "Serviços Grou", nenhuma opção aparece.

A base de conhecimento tem 18 documentos cadastrados (incluindo "apresentação serviços 2026", landing pages de produtos como Bússola, Feedback 360, Workshop NR1, Master Líder, Certificação PDA, Dilemas de Gestão, etc.), mas nenhum item na aba "Produtos & Serviços".

### Solução Proposta

**1. Busca híbrida no ArgumentGenerator.tsx**
- Além de buscar da `knowledge_items`, também buscar da `knowledge_documents` filtrando por categorias relevantes (portfólio de serviços, lp, apresentação)
- Combinar ambas as fontes para exibir como opções selecionáveis no filtro de serviços
- Quando não houver itens em `knowledge_items`, usar os documentos como fallback

**2. Atualizar a Edge Function**
- Quando serviços forem selecionados via documentos (ao invés de items), incluir o `extracted_content` dos documentos selecionados no contexto enviado à IA
- Manter compatibilidade com `knowledge_items` quando estes existirem

### Detalhes Técnicos

- Query adicional em `knowledge_documents` filtrando categorias como `lp`, `portfólio de serviços`, `site`
- Mapear documentos para o mesmo formato de seleção (nome + descrição)
- Na Edge Function, receber um campo adicional `selectedDocIds` para buscar conteúdo extraído dos documentos selecionados e injetar no prompt

### Alternativa
Se preferir, posso criar os itens de Produtos & Serviços automaticamente na tabela `knowledge_items` com base nos documentos existentes (ex: Bússola, Feedback 360, Workshop NR1, Master Líder, Certificação PDA, Dilemas de Gestão, PDA Assessment). Assim o filtro funcionaria imediatamente sem alterar a lógica de busca.

