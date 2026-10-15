// Volta do navegador depois de um OAuth (CRM, agenda).

/** Só volta para domínios da própria plataforma (evita redirecionamento aberto). */
export function safeReturn(url: string | undefined, fallbackPath = "/configuracoes"): string {
  const fallback = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "") + fallbackPath;
  if (!url) return fallback;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const app = Deno.env.get("APP_URL") ? new URL(Deno.env.get("APP_URL")!).hostname : "";
    const domains = (Deno.env.get("PLATFORM_DOMAINS") ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
    const extras = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((o) => o.trim().toLowerCase()).filter(Boolean);
    const ok = u.protocol === "https:" && (
      host === app || domains.some((d) => host === d || host.endsWith(`.${d}`)) || extras.includes(u.origin.toLowerCase())
    );
    return ok ? u.toString() : fallback;
  } catch {
    return fallback;
  }
}

export function backTo(returnTo: string, params: Record<string, string>): Response {
  const u = new URL(returnTo);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}
