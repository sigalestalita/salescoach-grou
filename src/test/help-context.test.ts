import { describe, expect, it } from "vitest";
import { helpContextFor } from "@/components/hub/helpContext";

// O assistente do botão flutuante responde "como usar" com o trecho da ajuda
// que vai junto com a pergunta. Estes testes garantem que as perguntas comuns
// levam o artigo certo.

describe("trecho da ajuda para o assistente", () => {
  it("a pergunta do print (atendimento de CS) leva o artigo do coach de atendimento", () => {
    const g = helpContextFor("como configurar a parte de atendimento de cs?", "admin");
    expect(g).toContain("### Coach de atendimento (CS, suporte, onboarding)");
    expect(g).toContain("Configurações → Playbooks de atendimento");
    expect(g).toContain('Tour na Ajuda: "Coach de atendimento"');
  });

  it("CRM leva o artigo de integração", () => {
    expect(helpContextFor("como mando os campos pro hubspot?", "admin")).toContain("### Integração com o CRM");
  });

  it("respeita o papel: artigo só de admin não vai para vendedor", () => {
    const g = helpContextFor("como mudar a metodologia BANT?", "vendedor");
    expect(g).not.toContain("### Tipos de reunião, metodologia e marca");
    expect(g).toContain("Papel de quem pergunta: vendedor");
  });

  it("fica dentro do limite de tamanho", () => {
    expect(helpContextFor("configurar crm extensão agenda equipe treino playbook metodologia", "admin").length).toBeLessThanOrEqual(9000);
  });
});
