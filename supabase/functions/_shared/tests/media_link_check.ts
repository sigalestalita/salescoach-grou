// Verificação dos links de gravação (Nova Agenda e Importar em Lote).
// deno run _shared/tests/media_link_check.ts
import { classifyLink, LinkError, linkKindError, MSG, probeDirect } from "../media-link.ts";

let fails = 0;
const ok = (cond: unknown, msg: string) => { console.log(`${cond ? "ok " : "FALHOU"} ${msg}`); if (!cond) fails++; };
const ID = "1AbC_dEf-GhIjKlMnOpQrStUv";
const drive = (u: string) => { const k = classifyLink(u); return k.kind === "drive" ? k.id : k.kind; };

ok(drive(`https://drive.google.com/file/d/${ID}/view?usp=sharing`) === ID, "Drive: /file/d/ID");
ok(drive(`https://drive.google.com/file/u/1/d/${ID}/view`) === ID, "Drive com várias contas: /file/u/1/d/ID");
ok(drive(`https://drive.google.com/open?id=${ID}`) === ID, "Drive: open?id=ID");
ok(drive(`https://drive.google.com/uc?export=download&id=${ID}`) === ID, "Drive: uc?id=ID");
ok(drive(`https://drive.usercontent.google.com/download?id=${ID}&export=download`) === ID, "Drive: download direto");
ok(drive(`https://docs.google.com/file/d/${ID}/edit`) === ID, "Drive pelo docs.google.com/file");
ok(drive(`https://drive.google.com/a/empresa.com/file/d/${ID}/view`) === ID, "Drive de domínio: /a/empresa/file/d/ID");
ok(drive(`https://drive.google.com/drive/folders/${ID}`) === "drive-folder", "pasta do Drive");
ok(drive(`https://drive.google.com/drive/u/0/folders/${ID}?usp=sharing`) === "drive-folder", "pasta do Drive com conta");
ok(drive(`https://docs.google.com/document/d/${ID}/edit`) === "google-doc", "documento do Google");
ok(classifyLink("https://www.youtube.com/watch?v=abc").kind === "youtube" && classifyLink("https://youtu.be/abc").kind === "youtube", "YouTube");
ok(linkKindError(classifyLink("https://youtu.be/abc")) === MSG.youtube, "YouTube: mensagem com o caminho");

const db = classifyLink("https://www.dropbox.com/scl/fi/xyz/reuniao.mp4?rlkey=k1&dl=0");
ok(db.kind === "direct" && db.url.includes("dl=1") && db.url.includes("rlkey=k1") && !db.url.includes("dl=0"), "Dropbox vira download direto");
const sp = classifyLink("https://empresa.sharepoint.com/:v:/s/time/EabcDEF?e=x1");
ok(sp.kind === "direct" && sp.host === "microsoft" && sp.url.includes("download=1"), "SharePoint pede o download");
let threw = false;
try { classifyLink("drive.google.com sem https"); } catch (e) { threw = e instanceof LinkError; }
ok(threw, "texto que não é link: mensagem clara");

// Teste do link sem baixar o arquivo.
const resp = (status: number, type: string, url = "https://x/final.mp4") => (async () => {
  const r = new Response("x", { status, headers: { "content-type": type } });
  Object.defineProperty(r, "url", { value: url });
  return r;
}) as unknown as typeof fetch;
ok(await probeDirect("https://x/a", "outro", resp(206, "video/mp4")) === "https://x/final.mp4", "arquivo direto: segue, com o endereço final");
const erroDe = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return (e as Error).message; } };
ok(await erroDe(probeDirect("https://zoom.us/rec/share/x", "outro", resp(200, "text/html; charset=utf-8"))) === MSG.pagina, "página (Zoom, Loom...): explica o que fazer");
ok(await erroDe(probeDirect("https://x/a", "microsoft", resp(200, "text/html"))) === MSG.microsoft, "OneDrive que abre página: mensagem própria");
ok((await erroDe(probeDirect("https://x/a", "outro", resp(403, "text/plain"))))?.includes("HTTP 403"), "sem acesso: mostra o código");

console.log(fails ? `\n${fails} falha(s)` : "\nTudo certo.");
if (fails) Deno.exit(1);
