// Link de gravação colado em Nova Agenda ou em Importar em Lote.
//
// A AssemblyAI só aceita o endereço direto de um arquivo de áudio ou vídeo.
// Qualquer outra coisa (página do YouTube, pasta do Drive, página de
// compartilhamento do Dropbox ou do Zoom) volta como "audio_url is invalid or
// points to a disallowed address", sem dizer o que fazer. Aqui o link é
// reconhecido, convertido para o download direto quando dá (Drive em qualquer
// formato, Dropbox, OneDrive/SharePoint) e testado antes; quando não dá, a
// pessoa recebe uma mensagem com o caminho.

export class LinkError extends Error {}

export type LinkKind =
  | { kind: "drive"; id: string }
  | { kind: "drive-folder" }
  | { kind: "google-doc" }
  | { kind: "youtube" }
  | { kind: "direct"; url: string; host: "dropbox" | "microsoft" | "outro" };

const TRANSCRICAO = 'Se tiver a transcrição, cole em "Já tem a transcrição? Cole aqui" e clique em Tentar novamente.';

export const MSG = {
  youtube:
    "Vídeos do YouTube não podem ser baixados para transcrição. Baixe o vídeo e envie o arquivo em Nova Agenda, " +
    `ou suba o arquivo no Google Drive e use o link dele. ${TRANSCRICAO}`,
  pasta:
    "Este é o link de uma pasta do Google Drive. Abra a pasta, clique com o botão direito no arquivo da gravação, " +
    'escolha "Compartilhar" → "Copiar link" e use o link do arquivo.',
  documento: `Este link é de um documento do Google (Docs, Slides ou Planilhas), não de uma gravação. ${TRANSCRICAO}`,
  pagina:
    "O link abre uma página, não o arquivo da gravação. Use o link de download do arquivo de áudio ou vídeo, " +
    `ou suba a gravação no Google Drive e use o link dela. ${TRANSCRICAO}`,
  microsoft:
    "Não foi possível baixar a gravação pelo link do OneDrive/SharePoint. Baixe o arquivo e envie em Nova Agenda, " +
    "ou suba no Google Drive e use o link dele.",
  inacessivel: (status: number) =>
    `Não foi possível acessar o arquivo do link (HTTP ${status}). Confira se ele está compartilhado para qualquer pessoa com o link.`,
};

const DRIVE_HOSTS = /(^|\.)(drive\.google\.com|docs\.google\.com|drive\.usercontent\.google\.com)$/i;

export function classifyLink(raw: string): LinkKind {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new LinkError("O link da gravação não é um endereço válido. Copie de novo o link completo, começando por https://.");
  }
  const host = u.hostname.toLowerCase();

  if (/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host)) return { kind: "youtube" };

  if (DRIVE_HOSTS.test(host)) {
    if (/\/(drive\/)?(u\/\d+\/)?folders\//.test(u.pathname)) return { kind: "drive-folder" };
    if (/^\/(document|presentation|spreadsheets|forms)\//.test(u.pathname)) return { kind: "google-doc" };
    // /file/d/ID, /file/u/0/d/ID, /a/dominio/file/d/ID, docs.google.com/file/d/ID
    const porCaminho = u.pathname.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
    const porId = u.searchParams.get("id");
    const id = porCaminho?.[1] ?? (porId && /^[a-zA-Z0-9_-]{10,}$/.test(porId) ? porId : null);
    if (id) return { kind: "drive", id };
    return { kind: "drive-folder" };
  }

  if (/(^|\.)dropbox\.com$/.test(host)) {
    u.searchParams.delete("raw");
    u.searchParams.set("dl", "1");
    return { kind: "direct", url: u.toString(), host: "dropbox" };
  }

  if (/(^|\.)(sharepoint\.com|onedrive\.live\.com|1drv\.ms)$/.test(host)) {
    if (!/(^|\.)1drv\.ms$/.test(host)) u.searchParams.set("download", "1");
    return { kind: "direct", url: u.toString(), host: "microsoft" };
  }

  return { kind: "direct", url: u.toString(), host: "outro" };
}

export const driveDirectUrl = (id: string) =>
  `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;

/**
 * Lê só o primeiro KB do link: precisa responder e não pode ser uma página.
 * Devolve o endereço para a AssemblyAI ou lança LinkError com o que fazer.
 */
export async function probeDirect(url: string, host: "dropbox" | "microsoft" | "outro", fetcher: typeof fetch = fetch): Promise<string> {
  let res: Response;
  try {
    res = await fetcher(url, {
      redirect: "follow",
      headers: {
        Range: "bytes=0-1023",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    });
  } catch {
    throw new LinkError("Não foi possível abrir o link da gravação. Confira se o endereço está certo e acessível sem login.");
  }
  const tipo = (res.headers.get("content-type") ?? "").toLowerCase();
  try { await res.arrayBuffer(); } catch { /* só libera a conexão */ }
  if (res.status >= 400) throw new LinkError(host === "microsoft" ? MSG.microsoft : MSG.inacessivel(res.status));
  if (tipo.includes("text/html") || tipo.includes("application/xhtml")) {
    throw new LinkError(host === "microsoft" ? MSG.microsoft : MSG.pagina);
  }
  // Depois dos redirecionamentos (1drv.ms, Dropbox), o endereço final é o do arquivo.
  return res.url || url;
}

/** Mensagem para quem lê, a partir do link: as que não têm solução automática. */
export function linkKindError(k: LinkKind): string | null {
  if (k.kind === "youtube") return MSG.youtube;
  if (k.kind === "drive-folder") return MSG.pasta;
  if (k.kind === "google-doc") return MSG.documento;
  return null;
}
