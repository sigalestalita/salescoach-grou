import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { SalesAssistant } from "@/components/SalesAssistant";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";

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
  const { profile, role } = useAuth();
  const { branding } = useBranding();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
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
          <main className="flex-1 overflow-auto px-4 pb-6 pt-2 md:px-8 md:pb-8 md:pt-3">{children}</main>
        </div>
      </div>
      <SalesAssistant />
    </SidebarProvider>
  );
}
