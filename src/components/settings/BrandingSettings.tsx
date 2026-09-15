import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Palette, Upload } from "lucide-react";

/**
 * Identidade visual da organização.
 *
 * As cores são gravadas em componentes HSL ("H S% L%") porque é exatamente o
 * formato dos design tokens que a interface já consome — o seletor de cor
 * trabalha em hex e a conversão acontece aqui.
 */

function hexToHsl(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function hslToHex(hsl: string): string {
  const match = hsl.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!match) return "#000000";

  const h = parseFloat(match[1]) / 360;
  const s = parseFloat(match[2]) / 100;
  const l = parseFloat(match[3]) / 100;

  const hue = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  let r = l;
  let g = l;
  let b = l;

  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }

  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export const BrandingSettings = () => {
  const { orgId } = useAuth();
  const { branding, refresh } = useBranding();
  const { toast } = useToast();

  const [productName, setProductName] = useState("");
  const [primary, setPrimary] = useState("#3b82f6");
  const [accent, setAccent] = useState("#0ea5e9");
  const [sidebar, setSidebar] = useState("#080f1a");
  const [headline, setHeadline] = useState("");
  const [subheadline, setSubheadline] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setProductName(branding.product_name);
    setPrimary(hslToHex(branding.primary_hsl));
    setAccent(hslToHex(branding.accent_hsl));
    setSidebar(hslToHex(branding.sidebar_hsl));
    setHeadline(branding.login_headline ?? "");
    setSubheadline(branding.login_subheadline ?? "");
    setSupportEmail(branding.support_email ?? "");
    setLogoUrl(branding.logo_url);
  }, [branding]);

  const handleLogoUpload = async (file: File) => {
    if (!orgId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${orgId}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("org-assets").upload(path, file, { upsert: true });
      if (error) throw error;

      const { data } = supabase.storage.from("org-assets").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
      toast({ title: "Logo enviado", description: "Clique em salvar para aplicar." });
    } catch (err: any) {
      toast({ title: "Erro ao enviar logo", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("organization_branding").upsert(
        {
          org_id: orgId,
          product_name: productName || "Sales Coach",
          logo_url: logoUrl,
          primary_hsl: hexToHsl(primary),
          accent_hsl: hexToHsl(accent),
          sidebar_hsl: hexToHsl(sidebar),
          login_headline: headline || null,
          login_subheadline: subheadline || null,
          support_email: supportEmail || null,
        },
        { onConflict: "org_id" },
      );
      if (error) throw error;

      await refresh();
      toast({ title: "Identidade visual atualizada" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Palette className="h-5 w-5" />
          Identidade visual
        </CardTitle>
        <CardDescription>
          Nome, logo e cores aplicados em toda a interface, na tela de login e nos relatórios compartilhados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="brand-name">Nome do produto</Label>
            <Input id="brand-name" value={productName} onChange={(e) => setProductName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-support">Email de suporte</Label>
            <Input
              id="brand-support"
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="suporte@empresa.com"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Logo</Label>
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-12 w-12 rounded border border-border object-contain" />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded border border-dashed border-border text-xs text-muted-foreground">
                —
              </div>
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">
              <Upload className="h-4 w-4" />
              {uploading ? "Enviando..." : "Enviar logo"}
              <input
                id="brand-logo"
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoUpload(file);
                }}
              />
            </label>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="brand-primary">Cor principal</Label>
            <div className="flex items-center gap-2">
              <Input
                id="brand-primary"
                type="color"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="h-10 w-16 p-1"
              />
              <span className="font-mono text-xs text-muted-foreground">{hexToHsl(primary)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-accent">Cor de destaque</Label>
            <Input
              id="brand-accent"
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="h-10 w-16 p-1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-sidebar">Fundo do menu</Label>
            <Input
              id="brand-sidebar"
              type="color"
              value={sidebar}
              onChange={(e) => setSidebar(e.target.value)}
              className="h-10 w-16 p-1"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="brand-headline">Título da tela de login</Label>
            <Input id="brand-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-subheadline">Subtítulo da tela de login</Label>
            <Input id="brand-subheadline" value={subheadline} onChange={(e) => setSubheadline(e.target.value)} />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Salvando..." : "Salvar identidade visual"}
        </Button>
      </CardContent>
    </Card>
  );
};
