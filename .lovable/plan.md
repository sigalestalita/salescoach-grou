

## Adicionar Tabelas de Preços de Consultoria à Base de Conhecimento

### Problema
A IA usa a mesma tabela de preços para todos os tipos de reunião. Reuniões de consultoria têm tabelas de preços diferentes (Créditos PDA - Consultoria para clientes existentes e Programa de Partners para novos clientes), mas a IA não tem essa informação.

### Solução

Duas mudanças:

#### 1. Inserir as tabelas de preços como documentos na base de conhecimento (via migration)

Criar dois registros na tabela `knowledge_documents` com `extracted_content` contendo os dados estruturados:

**Documento 1: "Créditos PDA - Consultoria (Recargas para clientes existentes)"**
- Categoria: "Preços Consultoria"
- Conteúdo extraído com a tabela completa:
  - Avulso: R$ 294,00 | Recarga Silver: - | Recarga Gold: -
  - 01 a 09: R$ 240,00 | Silver: - | Gold: -
  - 10 a 50: R$ 207,00 | Silver: R$ 186,30 | Gold: R$ 144,90
  - 51 a 100: R$ 194,00 | Silver: R$ 174,60 | Gold: R$ 135,80
  - Acima 101: R$ 175,00 | Silver: R$ 157,50 | Gold: R$ 122,50

**Documento 2: "Programa de Partners (Novos clientes consultoria)"**
- Categoria: "Preços Consultoria"
- Conteúdo com a tabela:
  - Bronze: 5 créditos, R$ 165/un, Total R$ 660, Recarga 10: R$ 1.320
  - Prata: 15 créditos, R$ 107,80/un, Total R$ 1.617, Recarga 10: R$ 1.078
  - Ouro: 50 créditos, R$ 102,30/un, Total R$ 5.115, Recarga 10: R$ 1.023
  - Esmeralda: 100 créditos, R$ 95,70/un, Total R$ 9.570, Recarga 10: R$ 957
  - Safira: 250 créditos, R$ 86,90/un, Total R$ 21.725, Recarga 10: R$ 869

#### 2. Ajustar o prompt de análise para diferenciar por `meeting_type`

No `analyze-meeting/index.ts`, quando `meeting.meeting_type === "consultoria"`, adicionar instrução extra no prompt:

```
CONTEXTO DE PREÇOS PARA CONSULTORIA:
- Esta é uma reunião de CONSULTORIA. Use as tabelas "Créditos PDA - Consultoria" (para clientes existentes/recargas) e "Programa de Partners" (para novos clientes) ao avaliar propostas de valor e oportunidades.
- NÃO use a tabela de Licenças PDA para empresas neste contexto.
- Créditos PDA - Consultoria = recargas para consultores já clientes.
- Programa de Partners = entrada de novos consultores com pacotes de licenças (Bronze a Safira).
```

Isso garante que a IA use as tabelas corretas dependendo do tipo de reunião.

### Arquivos modificados
- **Migration SQL**: Insere os 2 documentos de preços na `knowledge_documents`
- **`supabase/functions/analyze-meeting/index.ts`**: Adiciona bloco condicional no prompt quando `meeting_type = "consultoria"`

