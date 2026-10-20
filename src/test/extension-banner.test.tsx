import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ExtensionUpdateBanner } from "@/components/ExtensionUpdateBanner";
import { EXTENSAO_ATUAL } from "@/lib/extensionVersion";

function comExtensao(versao: string | null) {
  (window as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage: (_id: string, _msg: unknown, cb: (r: unknown) => void) => cb(versao ? { installed: true, version: versao, userId: null } : null) },
  };
}

describe("faixa de atualização da extensão", () => {
  beforeEach(() => sessionStorage.clear());

  it("aparece quando a extensão instalada é antiga", async () => {
    comExtensao("1.0.0");
    render(<MemoryRouter><ExtensionUpdateBanner /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Atualize a extensão do Sales Coach/)).toBeInTheDocument());
    expect(screen.getByText(new RegExp(`a ${EXTENSAO_ATUAL.replace(/\./g, "\\.")} já está disponível`))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver como atualizar" })).toHaveAttribute("href", "/extensao#atualizar");
  });

  it("não aparece com a versão atual, sem extensão ou no modo suporte", async () => {
    for (const [versao, ativo] of [[EXTENSAO_ATUAL, true], [null, true], ["1.0.0", false]] as const) {
      comExtensao(versao);
      const { container, unmount } = render(<MemoryRouter><ExtensionUpdateBanner ativo={ativo} /></MemoryRouter>);
      await new Promise((r) => setTimeout(r, 20));
      expect(container.textContent).toBe("");
      unmount();
    }
  });
});
