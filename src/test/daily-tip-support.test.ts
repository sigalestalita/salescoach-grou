import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), support: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/lib/support", () => ({ supportSession: mocks.support }));
import { fetchDailyTip } from "@/lib/dailyTip";

describe("dica do dia no suporte", () => {
  beforeEach(() => vi.resetAllMocks());

  it("não gera dica no modo somente leitura", async () => {
    mocks.support.mockResolvedValue({ canEdit: false });
    await expect(fetchDailyTip()).rejects.toThrow();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it.each([null, { canEdit: true }])("preserva geração fora do modo somente leitura: %j", async (support) => {
    mocks.support.mockResolvedValue(support);
    const tip = { titulo: "Perguntas", dica: "Ouça", porque: "Entender", frase_pronta: null, foco: null, tipo: "vendedor" };
    mocks.invoke.mockResolvedValue({ data: { tip }, error: null });
    expect(await fetchDailyTip()).toEqual(tip);
    expect(mocks.invoke).toHaveBeenCalledWith("daily-tip", { body: { day: expect.any(String) } });
  });
});