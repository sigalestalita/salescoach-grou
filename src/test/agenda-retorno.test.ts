import { describe, expect, it } from "vitest";
import { destinoRetornoAgenda } from "@/lib/agendaRetorno";

describe("retorno da agenda pelo domínio do Sales Coach", () => {
  it("repassa code e state para a função calendar", () => {
    const d = destinoRetornoAgenda("https://abc.supabase.co/", "?code=4%2F0Ab&state=xyz.sig&scope=email%20calendar");
    expect(d).toBe("https://abc.supabase.co/functions/v1/calendar?code=4%2F0Ab&state=xyz.sig&scope=email+calendar");
  });
  it("repassa o cancelamento (error) para a função avisar o app", () => {
    expect(destinoRetornoAgenda("https://abc.supabase.co", "?error=access_denied&state=s"))
      .toBe("https://abc.supabase.co/functions/v1/calendar?state=s&error=access_denied");
  });
  it("sem state não repassa nada", () => {
    expect(destinoRetornoAgenda("https://abc.supabase.co", "?code=1")).toBeNull();
  });
  it("não repassa parâmetros desconhecidos", () => {
    expect(destinoRetornoAgenda("https://abc.supabase.co", "?state=s&code=c&foo=bar")).not.toContain("foo");
  });
});
