// Resumo das integrações com CRM por empresa, para o painel da plataforma.
//
// Só metadados: qual CRM, se está conectado, quantos campos mapeados e quantos
// envios deram certo ou errado. Nada de conteúdo de reunião; e-mails que
// aparecem em mensagens de erro são mascarados.

export interface OverviewConnection {
  org_id: string;
  provider: string;
  status: string;
  account_label: string | null;
  connected_at: string;
  last_error: string | null;
}

export interface OverviewJob {
  org_id: string;
  status: string;
  updated_at: string;
  last_error: string | null;
}

export interface CrmOrgOverview {
  org_id: string;
  provider: string;
  status: string;
  account_label: string | null;
  connected_at: string;
  connection_error: string | null;
  mapped_fields: number;
  /** Envios nos últimos 30 dias, por situação. */
  jobs: { enviado: number; erro: number; aguardando_vinculo: number; pendente: number };
  last_sent_at: string | null;
  last_job_error: string | null;
}

/** Mascara e-mails (ex.: "ana@x.com" → "a***@x.com"). */
export function maskEmails(text: string | null): string | null {
  if (!text) return text;
  return text.replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, "$1***@$2");
}

export function crmOverview(
  connections: OverviewConnection[],
  mappings: { org_id: string; provider: string }[],
  jobs: OverviewJob[],
): CrmOrgOverview[] {
  return connections
    .filter((c) => c.status !== "desconectado")
    .map((c) => {
      const own = jobs.filter((j) => j.org_id === c.org_id)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      const count = (s: string) => own.filter((j) => j.status === s).length;
      return {
        org_id: c.org_id,
        provider: c.provider,
        status: c.status,
        account_label: c.account_label,
        connected_at: c.connected_at,
        connection_error: maskEmails(c.last_error),
        mapped_fields: mappings.filter((m) => m.org_id === c.org_id && m.provider === c.provider).length,
        jobs: {
          enviado: count("enviado"),
          erro: count("erro"),
          aguardando_vinculo: count("aguardando_vinculo"),
          pendente: count("pendente") + count("enviando"),
        },
        last_sent_at: own.find((j) => j.status === "enviado")?.updated_at ?? null,
        last_job_error: maskEmails(own.find((j) => j.status === "erro")?.last_error ?? null),
      };
    });
}
