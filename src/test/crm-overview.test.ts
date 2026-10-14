import { describe, expect, it } from "vitest";
import { crmOverview, maskEmails } from "../../supabase/functions/_shared/crm/overview";

describe("crmOverview", () => {
  const conns = [
    { org_id: "a", provider: "pipedrive", status: "ativo", account_label: "Pipedrive · acme", connected_at: "2026-10-01", last_error: null },
    { org_id: "b", provider: "kommo", status: "erro", account_label: null, connected_at: "2026-10-02", last_error: "Token venceu" },
    { org_id: "c", provider: "hubspot", status: "desconectado", account_label: null, connected_at: "2026-09-01", last_error: null },
  ];
  const maps = [
    { org_id: "a", provider: "pipedrive" }, { org_id: "a", provider: "pipedrive" }, { org_id: "a", provider: "rdstation" },
  ];
  const jobs = [
    { org_id: "a", status: "enviado", updated_at: "2026-10-10T10:00:00Z", last_error: null },
    { org_id: "a", status: "enviado", updated_at: "2026-10-12T10:00:00Z", last_error: null },
    { org_id: "a", status: "erro", updated_at: "2026-10-11T10:00:00Z", last_error: "Pipedrive recusou para ana.souza@cliente.com.br" },
    { org_id: "a", status: "enviando", updated_at: "2026-10-13T10:00:00Z", last_error: null },
    { org_id: "b", status: "aguardando_vinculo", updated_at: "2026-10-13T10:00:00Z", last_error: "x" },
  ];
  const out = crmOverview(conns, maps, jobs);

  it("lista só conexões em uso", () => {
    expect(out.map((o) => o.org_id)).toEqual(["a", "b"]);
  });

  it("conta campos do CRM conectado e envios por situação", () => {
    const a = out[0];
    expect(a.mapped_fields).toBe(2);
    expect(a.jobs).toEqual({ enviado: 2, erro: 1, aguardando_vinculo: 0, pendente: 1 });
    expect(a.last_sent_at).toBe("2026-10-12T10:00:00Z");
  });

  it("mascara e-mails nas mensagens de erro", () => {
    expect(out[0].last_job_error).toBe("Pipedrive recusou para a***@cliente.com.br");
    expect(maskEmails(null)).toBeNull();
    expect(out[1].connection_error).toBe("Token venceu");
  });
});
