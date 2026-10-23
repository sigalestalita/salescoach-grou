import { describe, expect, it } from "vitest";
import { driveFileId, recordingLinkProblem } from "@/lib/mediaLink";

// Links de gravação em Nova Agenda e Importar em Lote: o que nunca vira
// transcrição é recusado na hora, com o que fazer no lugar.

const ID = "1AbC_dEf-GhIjKlMnOpQrStUv";

describe("link da gravação", () => {
  it("aceita Drive em qualquer formato, Dropbox e link direto", () => {
    for (const u of [
      `https://drive.google.com/file/d/${ID}/view?usp=sharing`,
      `https://drive.google.com/file/u/1/d/${ID}/view`,
      `https://drive.google.com/open?id=${ID}`,
      "https://www.dropbox.com/scl/fi/x/reuniao.mp4?rlkey=k&dl=0",
      "https://cdn.empresa.com/gravacoes/reuniao.mp3",
    ]) expect(recordingLinkProblem(u)).toBeNull();
  });

  it("recusa YouTube, pasta, documento e texto que não é link", () => {
    expect(recordingLinkProblem("https://www.youtube.com/watch?v=abc")).toMatch(/YouTube/);
    expect(recordingLinkProblem("https://youtu.be/abc")).toMatch(/YouTube/);
    expect(recordingLinkProblem(`https://drive.google.com/drive/folders/${ID}`)).toMatch(/pasta/);
    expect(recordingLinkProblem(`https://docs.google.com/document/d/${ID}/edit`)).toMatch(/documento/);
    expect(recordingLinkProblem("drive.google.com/file/d/x")).toMatch(/https/);
  });

  it("player do Drive acha o arquivo em qualquer formato de link", () => {
    expect(driveFileId(`https://drive.google.com/file/u/0/d/${ID}/view`)).toBe(ID);
    expect(driveFileId(`https://drive.google.com/uc?export=download&id=${ID}`)).toBe(ID);
    expect(driveFileId("https://www.dropbox.com/s/abc/x.mp4")).toBeNull();
  });
});
