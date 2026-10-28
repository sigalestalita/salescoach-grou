# Corrigir bloqueios de IA no coach ao vivo e na dica do dia

## Diagnóstico confirmado
- `live-coach` transforma respostas de erro da IA, inclusive 403, em erro genérico 500.
- `daily-tip` trata 402 e 429, mas transforma 403 em erro genérico 500.
- A extensão continua solicitando sugestões a cada nova fala mesmo depois de um bloqueio; o caminho antigo de transcrição também dispara solicitações. Não existe pausa persistente compartilhada.
- O registro fornecido identifica um **limite de gastos de IA**, não comprova falta de saldo. Comprar créditos não resolve esse limite quando o saldo já é suficiente.
- Na verificação atual, o limite mensal está habilitado em **100 créditos**, com **24,00209599 créditos** de uso e sem bloqueio ativo. Não foram encontrados registros recentes que permitam reproduzir o incidente histórico.

## Resultado esperado
Mostrar o motivo correto em Início e na extensão, impedir solicitações automáticas durante bloqueios e permitir retomada explícita após a regularização, sem interromper gravação ou transcrição.

## Alterações
1. **Mensagens e status corretos**
   - Compartilhar o tratamento de erros das duas funções, preservando o status e a mensagem segura recebidos da IA.
   - Para `credit_limit_reached`, orientar que um administrador ajuste o limite de IA em Lovable → Configurações do espaço de trabalho → Limites de uso e alertas.
   - Diferenciar falta de créditos, limites de gastos, bloqueios de acesso e recusas; não trocar modelos, chaves ou provedores.
2. **Pausa persistente e retomada segura**
   - Guardar no servidor a pausa compartilhada dessas funcionalidades quando a IA devolver 402 ou 403. Ambas as funções devem verificar a pausa antes de chamar a IA, inclusive quando acionadas por versões antigas da extensão.
   - Interromper os pedidos automáticos de coaching e exibir o motivo na extensão. Continuar salvando a transcrição e a gravação.
   - Exibir o motivo na dica do dia, mantendo acesso a dicas já salvas.
   - Oferecer retomada explícita a um administrador autorizado da plataforma após regularizar o acesso; um administrador de empresa não poderá desbloquear o gasto de todo o espaço de trabalho. Não retomar sozinho após recarregar páginas.
   - Negativas de acesso do provedor não terão sondagens automáticas. Recusas encerram a solicitação sem bloquear permanentemente o acesso.
3. **Publicação e verificação**
   - Aplicar a alteração necessária no banco antes de publicar as funções modificadas.
   - Atualizar o pacote da extensão para entregar o tratamento visível do bloqueio.
   - Testar erros simulados 402/403, preservação de status/motivo, pausa após recarregamento, chamadas simultâneas e retomada autorizada; confirmar que nenhuma nova chamada à IA ocorre durante a pausa.
   - Verificar Início com sessão autenticada e o fluxo da extensão. Testar as chamadas reais de IA preservando os modelos atuais; parar se houver negativa de acesso ou problema de disponibilidade.
   - Marcar o alerta como corrigido somente após validar a alteração; distinguir testes simulados de uma reunião real.

## Detalhes técnicos
- Módulo compartilhado em `supabase/functions/_shared` para interpretação segura dos erros e consulta da pausa.
- Estado em tabela de aplicação no esquema `public`, acessível somente ao servidor, com permissões explícitas e RLS. A pausa de workspace não deve ficar restrita a uma empresa ou a um processo em memória.
- Controle de retomada com autenticação e autorização no servidor, reutilizando o acesso administrativo da plataforma; não confiar em armazenamento do navegador.
- Revisar `extension/content.js` e o disparo legado em `live-transcribe` para impedir continuidade automática; adicionar proteção contra solicitações simultâneas durante a verificação/retomada.
- Registrar a regra arquitetural em `AGENTS.md` e manter testes junto aos existentes.

## Fora do escopo
Não aumentar o limite, comprar créditos, trocar modelos nem alterar gravação, preços ou permissões existentes da equipe. A recuperação do incidente histórico não pode ser comprovada pelos registros atualmente disponíveis.
