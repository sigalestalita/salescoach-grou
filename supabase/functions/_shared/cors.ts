// CORS com lista de origens permitidas.
//
// Antes todas as funções respondiam "Access-Control-Allow-Origin: *". Em um
// SaaS whitelabel, as origens legítimas são o domínio da plataforma, os
// subdomínios de cliente, os domínios próprios cadastrados e a extensão.

const ALLOWED_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-internal-secret",
  "x-supabase-client-platform",
  "x-supabase-client-platform-version",
  "x-supabase-client-runtime",
  "x-supabase-client-runtime-version",
].join(", ");

/** Domínio raiz da plataforma; qualquer subdomínio dele é aceito. */
function platformDomains(): string[] {
  return (Deno.env.get("PLATFORM_DOMAINS") ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/** Origens extras liberadas explicitamente (ex.: preview do Lovable). */
function extraOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string, customDomains: string[] = []): boolean {
  if (!origin) return false;

  let host: string;
  let protocol: string;
  try {
    const url = new URL(origin);
    host = url.hostname.toLowerCase();
    protocol = url.protocol;
  } catch {
    return false;
  }

  // Extensão do navegador: a origem é chrome-extension://<id>.
  if (protocol === "chrome-extension:") {
    const allowedIds = (Deno.env.get("ALLOWED_EXTENSION_IDS") ?? "")
      .split(",").map((i) => i.trim()).filter(Boolean);
    return allowedIds.length === 0 ? false : allowedIds.includes(host);
  }

  if (host === "localhost" || host === "127.0.0.1") return true;
  if (extraOrigins().includes(origin.toLowerCase())) return true;
  if (customDomains.includes(host)) return true;

  return platformDomains().some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * Cabeçalhos de CORS para a requisição. `customDomains` permite liberar os
 * domínios próprios dos clientes (consultados no banco quando necessário).
 */
export function corsHeaders(req: Request, customDomains: string[] = []): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  // Enquanto nenhuma origem estiver configurada, mantém o comportamento atual
  // (aberto) para não derrubar quem já usa o sistema. Definir PLATFORM_DOMAINS
  // ou ALLOWED_ORIGINS liga a restrição.
  if (platformDomains().length === 0 && extraOrigins().length === 0) {
    headers["Access-Control-Allow-Origin"] = "*";
    return headers;
  }

  if (isAllowedOrigin(origin, customDomains)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

export function preflight(req: Request, customDomains: string[] = []): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(req, customDomains) });
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}
