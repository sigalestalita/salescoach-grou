import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { HelpHub } from "@/components/hub/HelpHub";
import { useHub } from "@/components/hub/HubContext";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { Button } from "@/components/ui/button";
import { Eye, CircleHelp, Pencil } from "lucide-react";
import { DemoBanner, DemoEndedScreen, FirstPasswordDialog, isDemoOver, useDemoEndsAt } from "@/components/AccountNotices";
import { exitSupport } from "@/lib/support";
import { useEffect } from "react";
import { syncExtensionSession } from "@/lib/extensionBridge";
import { ExtensionUpdateBanner } from "@/components/ExtensionUpdateBanner";

interface AppLayoutProps {
  children: React.ReactNode;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  vendedor: "Executivo",
};

/**
 * Casca da aplicação: menu navy à esquerda, barra superior branca e área de
 * conteúdo sobre o cinza frio do sistema.
 */
export function AppLayout({ children }: AppLayoutProps) {
  const { user, profile, role, support, signOut } = useAuth();
  const { branding } = useBranding();
  const demoEndsAt = useDemoEndsAt();
  useExtensionLogin(support ? null : user?.id ?? null);

  // Demonstração vencida: o operador da plataforma ainda entra para ver ou
  // configurar; para a empresa, a conta fica bloqueada.
  if (!support && isDemoOver(demoEndsAt)) return <DemoEndedScreen onSignOut={signOut} />;

  return (
    <SidebarProvider>
      <HelpHub>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            {support && <SupportBanner orgName={support.orgName} until={support.until} canEdit={support.canEdit} />}
            {demoEndsAt && <DemoBanner endsAt={demoEndsAt} />}
            <ExtensionUpdateBanner ativo={!support} />
            <FirstPasswordDialog />
            <header className="flex h-16 items-center justify-between px-4 pt-1 md:px-8">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="rounded-xl text-muted-foreground hover:bg-card hover:text-foreground" />
                {branding.org_name && (
                  <span className="hidden text-sm font-medium text-muted-foreground sm:inline">
                    {branding.org_name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <HelpButton />
                {role && (
                  <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-secondary-foreground">
                    {ROLE_LABELS[role]}
                  </span>
                )}
                <span className="text-sm font-medium text-foreground">
                  {profile?.full_name || "Usuário"}
                </span>
              </div>
            </header>
            {/* Folga embaixo: o botão da central fica fixo no canto e não pode cobrir o fim da página. */}
            <main className="flex-1 overflow-auto px-4 pb-24 pt-2 md:px-8 md:pb-24 md:pt-3">{children}</main>
          </div>
        </div>
      </HelpHub>
    </SidebarProvider>
  );
}

/** Faixa fixa do modo suporte: deixa claro de quem é a conta e o modo. */
function SupportBanner({ orgName, until, canEdit }: { orgName: string; until: string; canEdit: boolean }) {
  const sair = async () => {
    try { await exitSupport(); } finally { window.location.assign("/plataforma"); }
  };
  const hora = new Date(until).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm md:px-8 ${
      canEdit ? "bg-violet-100 text-violet-950" : "bg-amber-100 text-amber-950"
    }`}>
      <span className="flex items-center gap-2">
        {canEdit ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        {canEdit ? (
          <>Configurando a conta de <strong>{orgName}</strong>. As alterações valem para a empresa. Até {hora}.</>
        ) : (
          <>Modo suporte: você está vendo a conta de <strong>{orgName}</strong>. Só leitura, até {hora}.</>
        )}
      </span>
      <Button size="sm" variant="outline" className="h-7 border-current/30 bg-transparent" onClick={sair}>
        Voltar ao painel
      </Button>
    </div>
  );
}

/**
 * Mantém a extensão do Chrome logada com o mesmo usuário do site. Roda ao abrir
 * o app e quando a aba volta ao foco (a extensão pode ter sido instalada com o
 * site aberto). No modo suporte não roda: a extensão gravaria como operador.
 */
function useExtensionLogin(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    let last = 0;
    const run = () => {
      if (Date.now() - last < 30_000) return;
      last = Date.now();
      syncExtensionSession(userId).catch(() => {});
    };
    run();
    window.addEventListener("focus", run);
    return () => window.removeEventListener("focus", run);
  }, [userId]);
}

/** Atalho no topo para a ajuda da tela aberta. */
function HelpButton() {
  const { openHub } = useHub();
  return (
    <Button
      variant="ghost"
      size="sm"
      data-tour="ajuda"
      onClick={() => openHub("ajuda")}
      className="h-8 gap-1.5 rounded-full px-2.5 text-muted-foreground hover:text-foreground"
    >
      <CircleHelp className="h-4 w-4" />
      <span className="hidden sm:inline">Ajuda</span>
    </Button>
  );
}
