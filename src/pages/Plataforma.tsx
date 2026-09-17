import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Building2, Copy, Plus, RefreshCw, LogOut, Check } from "lucide-react";

/**
 * Painel do provedor: criar, listar, suspender e reativar empresas clientes e
 * acompanhar o consumo de cada uma.
 *
 * Deliberadamente NÃO mostra conteúdo de reunião, transcrição ou base de
 * conhecimento de nenhum cliente. O operador do SaaS vê metadados e consumo.
 */

interface Plan {
  id: string;
  key: string;
  name: string;
  description: string | null;
  limits: Record<string, number>;
  is_active: boolean;
  is_public: boolean;
}

interface Org {
  id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  status: string;
  created_at: string;
  users: number | null;
  meetings: number | null;
  subscription: {
    status: string;
    current_period_end: string;
    plans: { key: string; name: string } | null;
  } | null;
  usage: Record<string, { used: number; limit: number | null }> | null;
}

interface CreatedInvite {
  orgName: string;
  email: string;
  token: string;
  expiresAt: string;
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  trial:     { label: "Piloto",    variant: "secondary" },
  active:    { label: "Ativa",     variant: "default" },
  past_due:  { label: "Em atraso", variant: "outline" },
  suspended: { label: "Suspensa",  variant: "destructive" },
  canceled:  { label: "Cancelada", variant: "destructive" },
};

const USAGE_LABELS: Record<string, string> = {
  transcricao: "min transcritos",
  live_transcricao: "min ao vivo",
  analise: "análises",
  live_coach: "dicas",
  generate_arguments: "argumentos",
  cost_usd: "US$",
};

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const Plataforma = () => {
  const { signOut } = useAuth();
  const { branding } = useBranding();
  const { toast } = useToast();

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Formulário de criação.
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [productName, setProductName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [planKey, setPlanKey] = useState<string>("");
  const [creating, setCreating] = useState(false);

  // Convite recém-gerado.
  const [invite, setInvite] = useState<CreatedInvite | null>(null);
  const [copied, setCopied] = useState(false);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("platform-orgs", { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orgsRes, plansRes] = await Promise.all([
        call({ action: "list_orgs" }),
        call({ action: "list_plans" }),
      ]);
      setOrgs(orgsRes.organizations ?? []);
      setPlans((plansRes.plans ?? []).filter((p: Plan) => p.is_active));
    } catch (err: any) {
      toast({ title: "Erro ao carregar", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [call, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const inviteUrl = useMemo(
    () => (invite ? `${window.location.origin}/convite/${invite.token}` : ""),
    [invite],
  );

  const handleCreate = async () => {
    if (!name.trim() || !slug.trim()) {
      toast({ title: "Nome e subdomínio são obrigatórios", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const data = await call({
        action: "create_org",
        name: name.trim(),
        slug: slug.trim(),
        product_name: productName.trim() || null,
        plan_key: planKey || null,
        admin_email: adminEmail.trim() || null,
      });

      setCreateOpen(false);

      if (data.invite?.token && adminEmail.trim()) {
        setInvite({
          orgName: name.trim(),
          email: adminEmail.trim(),
          token: data.invite.token,
          expiresAt: data.invite.expires_at,
        });
        setCopied(false);
      } else {
        toast({ title: "Empresa criada", description: "Sem convite: informe um email para gerar o link de acesso." });
      }

      setName(""); setSlug(""); setSlugTouched(false);
      setProductName(""); setAdminEmail(""); setPlanKey("");
      await load();
    } catch (err: any) {
      toast({ title: "Erro ao criar empresa", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const setStatus = async (org: Org, status: string) => {
    setBusy(org.id);
    try {
      await call({ action: "set_status", org_id: org.id, status });
      toast({ title: status === "suspended" ? `${org.name} suspensa` : `${org.name} reativada` });
      await load();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const setPlan = async (org: Org, key: string) => {
    setBusy(org.id);
    try {
      await call({ action: "set_plan", org_id: org.id, plan_key: key });
      toast({ title: `Plano de ${org.name} atualizado` });
      await load();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ title: "Não foi possível copiar", description: "Selecione o link manualmente.", variant: "destructive" });
    }
  };

  const usageSummary = (org: Org) => {
    const entries = Object.entries(org.usage ?? {})
      .filter(([metric]) => metric !== "tokens")
      .filter(([, v]) => Number(v?.used ?? 0) > 0 || v?.limit !== null && v?.limit !== undefined)
      .slice(0, 4);
    if (entries.length === 0) return <span className="text-muted-foreground">sem consumo</span>;
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums">
        {entries.map(([metric, v]) => {
          const used = metric === "cost_usd" ? Number(v.used).toFixed(2) : Math.round(Number(v.used));
          const over = v.limit !== null && v.limit !== undefined && Number(v.used) >= Number(v.limit);
          return (
            <span key={metric} className={over ? "text-destructive font-medium" : ""}>
              {used}{v.limit !== null && v.limit !== undefined ? `/${v.limit}` : ""} {USAGE_LABELS[metric] ?? metric}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-lg font-bold leading-tight">Painel da plataforma</h1>
              <p className="text-xs text-muted-foreground">{branding.product_name} · empresas clientes, planos e consumo</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="mr-1 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {invite && (
          <Card className="border-primary/40">
            <CardHeader>
              <CardTitle className="text-lg">Convite gerado para {invite.orgName}</CardTitle>
              <CardDescription>
                Envie este link para <strong>{invite.email}</strong>. Ao aceitar, a pessoa entra como administradora da empresa
                e configura marca e metodologia em Configurações. Válido até {new Date(invite.expiresAt).toLocaleDateString("pt-BR")}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <p className="break-all font-mono text-xs">{inviteUrl}</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={copyInvite} size="sm">
                  {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                  {copied ? "Copiado" : "Copiar link"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setInvite(null)}>Fechar</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Empresas</CardTitle>
              <CardDescription>
                Cada empresa nasce com metodologia BANT, cor padrão e tipos de reunião genéricos. Nada de outro cliente é herdado.
              </CardDescription>
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  Nova empresa
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova empresa cliente</DialogTitle>
                  <DialogDescription>Cria a organização e, se informar um email, gera o convite do primeiro administrador.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="org-name">Nome da empresa</Label>
                    <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Empresa Exemplo" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-slug">Subdomínio</Label>
                    <Input
                      id="org-slug"
                      value={slug}
                      onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
                      placeholder="empresa-exemplo"
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">Identifica a marca antes do login em <code>{slug || "subdominio"}.seudominio.com</code>.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-product">Nome do produto para essa empresa</Label>
                    <Input id="org-product" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder={branding.product_name} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-plan">Plano</Label>
                    <Select value={planKey} onValueChange={setPlanKey}>
                      <SelectTrigger id="org-plan"><SelectValue placeholder="Sem plano (sem limites)" /></SelectTrigger>
                      <SelectContent>
                        {plans.map((p) => (
                          <SelectItem key={p.key} value={p.key}>
                            {p.name}{Object.keys(p.limits ?? {}).length === 0 ? " · sem limites" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-admin">Email do administrador</Label>
                    <Input id="org-admin" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@empresa.com" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating ? "Criando..." : "Criar empresa"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {loading && orgs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
            ) : orgs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma empresa ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead className="text-right">Usuários</TableHead>
                      <TableHead className="text-right">Reuniões</TableHead>
                      <TableHead>Consumo no ciclo</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orgs.map((org) => {
                      const st = STATUS_LABELS[org.status] ?? { label: org.status, variant: "outline" as const };
                      const isBusy = busy === org.id;
                      const suspended = org.status === "suspended" || org.status === "canceled";
                      return (
                        <TableRow key={org.id}>
                          <TableCell>
                            <div className="font-medium">{org.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">{org.custom_domain ?? org.slug}</div>
                          </TableCell>
                          <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                          <TableCell>
                            <Select
                              value={org.subscription?.plans?.key ?? ""}
                              onValueChange={(key) => setPlan(org, key)}
                              disabled={isBusy}
                            >
                              <SelectTrigger className="h-8 w-[160px] text-xs">
                                <SelectValue placeholder="Sem plano" />
                              </SelectTrigger>
                              <SelectContent>
                                {plans.map((p) => (
                                  <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{org.users ?? 0}</TableCell>
                          <TableCell className="text-right tabular-nums">{org.meetings ?? 0}</TableCell>
                          <TableCell>{usageSummary(org)}</TableCell>
                          <TableCell className="text-right">
                            {suspended ? (
                              <Button variant="outline" size="sm" disabled={isBusy} onClick={() => setStatus(org, "active")}>
                                Reativar
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                disabled={isBusy}
                                onClick={() => {
                                  if (confirm(`Suspender ${org.name}? Os usuários dela perdem a escrita, mas continuam lendo os próprios dados.`)) {
                                    setStatus(org, "suspended");
                                  }
                                }}
                              >
                                Suspender
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Este painel mostra metadados e consumo. Conteúdo de reunião, transcrição e base de conhecimento só é visível
          para membros de cada empresa.
        </p>
      </main>
    </div>
  );
};

export default Plataforma;
