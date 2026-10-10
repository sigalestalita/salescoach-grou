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
 * Casca da aplicação: menu claro à esquerda, barra superior fina e área de
 * conteúdo centralizada, com largura máxima para a leitura não se espalhar.
 */
export function AppLayout({ children }: AppLayoutProps) {
  const { profile, role } = useAuth();
  const { branding } = useBranding();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-8">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-8 w-8 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground" />
              {branding.org_name && (
                <span className="hidden text-[13px] text-muted-foreground sm:inline">
                  {branding.org_name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {role && (
                <span className="eyebrow rounded-md border border-border bg-card px-1.5 py-0.5 text-[10.5px]">
                  {ROLE_LABELS[role]}
                </span>
              )}
              <span className="text-[13px] font-medium text-foreground">
                {profile?.full_name || "Usuário"}
              </span>
            </div>
          </header>
          <main className="flex-1 overflow-auto px-4 pb-10 pt-6 md:px-8 md:pt-8"><div className="mx-auto w-full max-w-[1240px]">{children}</div></main>
        </div>
      </div>
      <SalesAssistant />
    </SidebarProvider>
  );
}
