// Identidade visual de uma organização, antes do login.
//
// Responde por subdomínio (?slug=) ou domínio próprio (?domain=). Devolve uma
// organização por vez e nunca lista — a carteira de clientes não fica exposta.
// Host desconhecido recebe a marca padrão da plataforma, não um erro.

import { json, preflight } from "../_shared/cors.ts";
import { adminClient } from "../_shared/tenant.ts";

const PLATFORM_DEFAULT = {
  org_id: null,
  org_name: null,
  slug: null,
  status: "active",
  product_name: Deno.env.get("PLATFORM_PRODUCT_NAME") ?? "Sales Coach",
  logo_url: null,
  logo_dark_url: null,
  favicon_url: null,
  primary_hsl: "214 74% 32%",
  primary_fg_hsl: "0 0% 100%",
  accent_hsl: "214 74% 45%",
  sidebar_hsl: "212 76% 12%",
  login_headline: null,
  login_subheadline: null,
  support_email: null,
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const domain = url.searchParams.get("domain");

    if (!slug && !domain) {
      return json(req, { branding: PLATFORM_DEFAULT, resolved: false });
    }

    const admin = adminClient();
    const { data, error } = await admin.rpc("branding_for_host", {
      _slug: slug,
      _domain: domain,
    });

    if (error) {
      console.error("branding_for_host error:", error.message);
      return json(req, { branding: PLATFORM_DEFAULT, resolved: false });
    }

    if (!data) {
      return json(req, { branding: PLATFORM_DEFAULT, resolved: false });
    }

    return json(req, { branding: data, resolved: true });
  } catch (e) {
    console.error("get-branding error", e);
    return json(req, { branding: PLATFORM_DEFAULT, resolved: false });
  }
});
