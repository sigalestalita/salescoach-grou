import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), signOut: vi.fn(), support: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke }, auth: { signOut: mocks.signOut } },
}));
vi.mock("@/lib/support", () => ({ supportSession: mocks.support }));

import { calendarApi } from "@/lib/calendar";

describe("agenda no suporte somente leitura", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.support.mockResolvedValue({ canEdit: false });
  });

  it("não consulta a agenda pessoal ao verificar a conexão", async () => {
    expect(await calendarApi.status()).toEqual({ connection: null, providers: [] });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("não consulta eventos da agenda pessoal", async () => {
    expect(await calendarApi.events(new Date("2026-10-28"), new Date("2026-10-29")))
      .toEqual({ connected: false, events: [] });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("não permite conectar a agenda", async () => {
    await expect(calendarApi.connect("google")).rejects.toThrow();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("não permite desconectar a agenda", async () => {
    await expect(calendarApi.disconnect()).rejects.toThrow();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("mantém a consulta fora do suporte somente leitura", async () => {
    mocks.support.mockResolvedValue(null);
    mocks.invoke.mockResolvedValue({ data: { connection: null, providers: ["google"] }, error: null });
    expect((await calendarApi.status()).providers).toEqual(["google"]);
    expect(mocks.invoke).toHaveBeenCalledWith("calendar", { body: { action: "status" } });
  });

  it("trata o bloqueio caso a sessão mude durante a consulta sem sair do login", async () => {
    mocks.support.mockResolvedValue(null);
    mocks.invoke.mockResolvedValue({ data: null, error: { context: {
      status: 403, json: async () => ({ code: "SUPPORT_READ_ONLY" }),
    } } });
    expect(await calendarApi.status()).toEqual({ connection: null, providers: [] });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});