/**
 * Link de gravação colado em Nova Agenda ou em Importar em Lote: recusa na
 * hora o que nunca vai virar transcrição (a mesma regra da função
 * analyze-meeting, em _shared/media-link.ts), com o que fazer no lugar.
 */
export function recordingLinkProblem(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return "Cole o link completo, começando por https://.";
  }
  if (!/^https?:$/.test(u.protocol)) return "Cole o link completo, começando por https://.";
  const host = u.hostname.toLowerCase();
  if (/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host)) {
    return "Vídeos do YouTube não podem ser transcritos pelo link. Baixe o vídeo e envie o arquivo, ou suba no Google Drive e use o link de lá.";
  }
  if (/(^|\.)(drive\.google\.com|docs\.google\.com)$/.test(host)) {
    if (/\/(drive\/)?(u\/\d+\/)?folders\//.test(u.pathname)) return "Este é o link de uma pasta. Abra a pasta e copie o link do arquivo da gravação.";
    if (/^\/(document|presentation|spreadsheets|forms)\//.test(u.pathname)) return "Este link é de um documento do Google, não de uma gravação.";
  }
  return null;
}

/** Id do arquivo no Google Drive, em qualquer formato de link (para o player). */
export function driveFileId(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (!/(^|\.)(drive\.google\.com|docs\.google\.com|drive\.usercontent\.google\.com)$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
    if (m) return m[1];
    const id = u.searchParams.get("id");
    return id && /^[a-zA-Z0-9_-]{10,}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
