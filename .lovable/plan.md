

## Plano: Filtro de Tipo de Oferta (Licença PDA vs Serviços) + Atualização do Modelo de IA

### Problema
Atualmente o gerador não distingue entre venda de **Licença PDA** (produto) e **Serviços Grou** (consultorias, treinamentos, diagnósticos). Isso gera argumentos genéricos que misturam os dois. Além disso, o modelo de IA atual é o **Gemini 2.5 Flash** — vamos atualizar para o **Gemini 3 Flash Preview**, mais recente e com melhor custo-benefício.

### Alterações

**1. Frontend (`src/pages/ArgumentGenerator.tsx`)**
- Adicionar novo filtro **"Tipo de Oferta"** com 3 opções:
  - **Licença PDA** (produto)
  - **Serviços Grou** (consultorias, treinamentos, diagnósticos — lista puxada da base de conhecimento)
  - **Ambos**
- Quando "Serviços Grou" for selecionado, buscar da tabela `knowledge_items` os itens com `item_type` = serviço/treinamento para exibir como sub-opções selecionáveis
- Enviar o campo `offerType` e `selectedServices` no body da requisição

**2. Edge Function (`supabase/functions/generate-arguments/index.ts`)**
- Receber os novos campos `offerType` e `selectedServices`
- Ajustar o prompt para direcionar argumentos especificamente para produto PDA, serviços selecionados, ou ambos
- Quando for serviços, incluir descrições dos serviços selecionados da base de conhecimento no contexto
- Atualizar modelo de `google/gemini-2.5-flash` para `google/gemini-3-flash-preview`

### Detalhes Técnicos
- Query na `knowledge_items` filtrando por categorias de serviço/treinamento para popular o seletor dinâmico
- O prompt do sistema será contextualizado: se for só PDA, foca em licenciamento e ROI de assessment; se for serviços, foca nos benefícios específicos dos serviços selecionados
- Modelo atualizado para `google/gemini-3-flash-preview` (melhor qualidade de resposta)

