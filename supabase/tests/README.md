# Scripts de banco

Apesar do nome da pasta, aqui ficam dois tipos de arquivo: o ensaio local das
migrações (testes de verdade, contra um Postgres temporário) e scripts de
operação, colados no SQL do backend (Lovable → View Backend → SQL).

## Ensaio local (não toca produção)

| Arquivo | O que faz |
| --- | --- |
| `ensaio.sh` | Sobe um Postgres temporário, aplica o shim, todas as migrações e o estado de exemplo, e roda a verificação. Bom para testar mudanças de RLS. |
| `ensaio-seed.sh` | Mesmo ambiente, rodando o seed de demonstração duas vezes. |
| `00-shim.sql` | O mínimo do Supabase num Postgres comum: papéis, `auth.uid()`, schemas `auth` e `storage`. |
| `10-estado-atual.sql` | Dados de exemplo (usuários, reuniões, análises, arquivos, links). |
| `20-verificacao.sql` | Afirmações que falham com exceção: isolamento entre empresas, papéis, dados preservados. |

## Operação (rodar no SQL do backend)

| Arquivo | Quando usar | Altera dados? |
| --- | --- | --- |
| `verificar-producao.sql` | Conferir o estado do banco; toda linha precisa terminar em `ok` | Não |
| `abrir-para-testes.sql` | Cadastrar um operador da plataforma e criar o plano piloto | Sim, idempotente |
| `novo-cliente.sql` | Criar uma empresa cliente e o convite do primeiro admin | Sim |
| `aplicar-marca.sql` | Aplicar a paleta padrão a empresas que não personalizaram | Sim, idempotente |
| `agendar-crm-sync.sql` | Agendar a fila de envio ao CRM a cada 10 minutos (pg_cron) | Sim |
| `seed-sales-rocket.sql` | Popular a organização de demonstração "Sales Rocket" com dados fictícios | Sim, só nessa organização |
