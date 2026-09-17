import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Identidade visual do cliente, aplicada em tempo de execução.
 *
 * A interface inteira já consome design tokens (`hsl(var(--primary))`), então o
 * whitelabel é uma questão de escrever as variáveis no :root com os valores da
 * organização. Antes do login a marca é resolvida pelo host (subdomínio ou
 * domínio próprio); depois do login, pela organização do usuário.
 */

export interface Branding {
  org_id: string | null;
  org_name: string | null;
  product_name: string;
  logo_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  primary_hsl: string;
  primary_fg_hsl: string;
  accent_hsl: string;
  sidebar_hsl: string;
  login_headline: string | null;
  login_subheadline: string | null;
  support_email: string | null;
}

/** Marca da plataforma, usada enquanto nenhuma organização é resolvida. */
export const PLATFORM_BRANDING: Branding = {
  org_id: null,
  org_name: null,
  product_name: "Sales Coach",
  logo_url: null,
  logo_dark_url: null,
  favicon_url: null,
  primary_hsl: "217 91% 60%",
  primary_fg_hsl: "0 0% 100%",
  accent_hsl: "199 89% 48%",
  sidebar_hsl: "222 47% 6%",
  login_headline: null,
  login_subheadline: null,
  support_email: null,
};

interface BrandingContextValue {
  branding: Branding;
  loading: boolean;
  /** Recarrega a marca — usado depois de salvar nas configurações. */
  refresh: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: PLATFORM_BRANDING,
  loading: true,
  refresh: async () => {},
});

export const useBranding = () => useContext(BrandingContext);

/**
 * Extrai o subdomínio do host. Retorna null em localhost, em IP e quando o
 * host não tem subdomínio (ex.: "app.com" ou "www.app.com").
 */
export function slugFromHost(hostname: string): string | null {
  const host = hostname.toLowerCase();
  if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;

  const parts = host.split(".");
  if (parts.length < 3) return null;

  const slug = parts[0];
  if (slug === "www" || slug === "app") return null;
  return slug;
}

function applyTokens(branding: Branding) {
  const root = document.documentElement;
  root.style.setProperty("--primary", branding.primary_hsl);
  root.style.setProperty("--primary-foreground", branding.primary_fg_hsl);
  root.style.setProperty("--ring", branding.primary_hsl);
  root.style.setProperty("--sidebar-primary", branding.primary_hsl);
  root.style.setProperty("--sidebar-primary-foreground", branding.primary_fg_hsl);
  root.style.setProperty("--sidebar-ring", branding.primary_hsl);
  root.style.setProperty("--sidebar-background", branding.sidebar_hsl);
  root.style.setProperty("--brand-accent", branding.accent_hsl);

  document.title = branding.product_name;

  if (branding.favicon_url) {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = branding.favicon_url;
  }
}

function normalize(raw: Record<string, unknown> | null): Branding {
  if (!raw) return PLATFORM_BRANDING;
  return {
    ...PLATFORM_BRANDING,
    ...raw,
    product_name: (raw.product_name as string) || PLATFORM_BRANDING.product_name,
    primary_hsl: (raw.primary_hsl as string) || PLATFORM_BRANDING.primary_hsl,
    primary_fg_hsl: (raw.primary_fg_hsl as string) || PLATFORM_BRANDING.primary_fg_hsl,
    accent_hsl: (raw.accent_hsl as string) || PLATFORM_BRANDING.accent_hsl,
    sidebar_hsl: (raw.sidebar_hsl as string) || PLATFORM_BRANDING.sidebar_hsl,
  } as Branding;
}

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [branding, setBranding] = useState<Branding>(PLATFORM_BRANDING);
  const [loading, setLoading] = useState(true);

  /** Marca da organização do usuário logado, quando houver sessão. */
  const loadFromSession = useCallback(async (): Promise<Branding | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const { data } = await supabase
      .from("organization_branding")
      .select(
        "org_id, product_name, logo_url, logo_dark_url, favicon_url, primary_hsl, primary_fg_hsl, accent_hsl, sidebar_hsl, login_headline, login_subheadline, support_email",
      )
      .maybeSingle();

    return data ? normalize(data as Record<string, unknown>) : null;
  }, []);

  /** Marca resolvida pelo host, disponível antes do login. */
  const loadFromHost = useCallback(async (): Promise<Branding | null> => {
    // Envia subdomínio e domínio completo: a organização pode estar cadastrada
    // por um ou por outro (custom_domain cobre o endereço atual da instalação).
    const hostname = window.location.hostname;
    const slug = slugFromHost(hostname);
    const params = new URLSearchParams();
    if (slug) params.set("slug", slug);
    params.set("domain", hostname);

    try {
      const { data, error } = await supabase.functions.invoke(
        `get-branding?${params.toString()}`,
        { method: "GET" },
      );
      if (error || !data?.resolved) return null;
      return normalize(data.branding);
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    const resolved = (await loadFromSession()) ?? (await loadFromHost()) ?? PLATFORM_BRANDING;
    setBranding(resolved);
    applyTokens(resolved);
    setLoading(false);
  }, [loadFromHost, loadFromSession]);

  useEffect(() => {
    refresh();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        // Fora da callback do Supabase, para não segurar o lock de auth.
        setTimeout(() => { refresh(); }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [refresh]);

  return (
    <BrandingContext.Provider value={{ branding, loading, refresh }}>
      {children}
    </BrandingContext.Provider>
  );
};
