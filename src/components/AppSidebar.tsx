import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  Sparkles,
  MonitorSmartphone,
  Users,
  Settings,
  Building2,
  LogOut,
  ChevronsUpDown,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import markWhite from "@/assets/salescoach-mark-white.png";
import { supabase } from "@/integrations/supabase/client";
import { useBranding } from "@/contexts/BrandingContext";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

/**
 * Menu lateral.
 *
 * Painel flutuante navy com cantos grandes. Um seletor no topo alterna entre
 * as duas frentes do produto — Vendas (o dia a dia das reuniões) e Gestão
 * (time, configurações, plataforma) — e a aba acompanha a rota ativa. O logo
 * e o nome vêm da organização quando ela os definiu; caso contrário, a marca
 * da plataforma.
 */

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  roles: string[];
  end?: boolean;
  /** Chave do contador exibido ao lado do item. */
  badge?: "processing";
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

type TabKey = "vendas" | "gestao";

const ALL_ROLES = ["admin", "gestor", "vendedor"];
const MANAGEMENT = ["admin", "gestor"];

const TABS: { key: TabKey; label: string; groups: NavGroup[] }[] = [
  {
    key: "vendas",
    label: "Vendas",
    groups: [
      {
        label: "Análise",
        items: [
          { title: "Visão geral", url: "/", icon: LayoutDashboard, roles: MANAGEMENT, end: true },
          { title: "Agendas", url: "/agendas", icon: CalendarDays, roles: ALL_ROLES, badge: "processing" },
        ],
      },
      {
        label: "Inteligência",
        items: [
          { title: "Base de conhecimento", url: "/conhecimento", icon: BookOpen, roles: MANAGEMENT },
          { title: "Gerador de argumentos", url: "/argumentos", icon: Sparkles, roles: ALL_ROLES },
        ],
      },
      {
        label: "Ferramentas",
        items: [{ title: "Extensão Chrome", url: "/extensao", icon: MonitorSmartphone, roles: ALL_ROLES }],
      },
    ],
  },
  {
    key: "gestao",
    label: "Gestão",
    groups: [
      {
        label: "Administração",
        items: [
          { title: "Equipe", url: "/equipe", icon: Users, roles: MANAGEMENT },
          { title: "Configurações", url: "/configuracoes", icon: Settings, roles: MANAGEMENT },
        ],
      },
    ],
  },
];

const PLATFORM_GROUP: NavGroup = {
  label: "Plataforma",
  items: [{ title: "Empresas clientes", url: "/plataforma", icon: Building2, roles: ALL_ROLES }],
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  vendedor: "Executivo",
};

const PROCESSING_STATUSES = ["enviado", "baixando", "transcrevendo", "analisando"];

const MENU_BUTTON_CLASS =
  "h-10 px-3 text-[13.5px] font-medium text-sidebar-foreground/75 " +
  "hover:bg-white/[.06] hover:text-sidebar-foreground " +
  "data-[active=true]:bg-white/[.12] data-[active=true]:text-sidebar-foreground data-[active=true]:font-semibold " +
  "data-[active=true]:shadow-[inset_0_1px_0_rgba(255,255,255,.08)] " +
  "group-data-[collapsible=icon]:!h-10 group-data-[collapsible=icon]:!w-10 group-data-[collapsible=icon]:justify-center " +
  "[&>svg]:size-[19px] [&>svg]:opacity-75 data-[active=true]:[&>svg]:opacity-100";

const GROUP_LABEL_CLASS =
  "px-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45";

/** Reuniões ainda em processamento na organização — aparece como contador em "Agendas". */
function useProcessingCount(enabled: boolean) {
  const { data } = useQuery({
    queryKey: ["sidebar-processing-count"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("meetings")
        .select("id", { count: "exact", head: true })
        .in("status", PROCESSING_STATUSES);
      return count ?? 0;
    },
  });
  return data ?? 0;
}

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { profile, role, signOut, session } = useAuth();
  const { branding } = useBranding();
  const { isPlatformAdmin } = usePlatformAdmin();
  const processing = useProcessingCount(!!session);

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  // Abas com os itens que o papel do usuário pode ver; "Plataforma" entra em Gestão.
  const tabs = useMemo(() => {
    return TABS.map((tab) => {
      const groups = tab.groups
        .map((group) => ({ ...group, items: group.items.filter((item) => !role || item.roles.includes(role)) }))
        .filter((group) => group.items.length > 0);
      if (tab.key === "gestao" && isPlatformAdmin) groups.push(PLATFORM_GROUP);
      return { ...tab, groups };
    }).filter((tab) => tab.groups.length > 0);
  }, [role, isPlatformAdmin]);

  const tabOfRoute = useMemo<TabKey | null>(() => {
    for (const tab of tabs) {
      for (const group of tab.groups) {
        if (group.items.some((item) => isActive(item.url))) return tab.key;
      }
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, location.pathname]);

  const [tab, setTab] = useState<TabKey>(tabOfRoute ?? "vendas");
  useEffect(() => {
    if (tabOfRoute) setTab(tabOfRoute);
  }, [tabOfRoute]);

  const current = tabs.find((t) => t.key === tab) ?? tabs[0];
  const showPill = tabs.length > 1;
  const tabIndex = Math.max(0, tabs.findIndex((t) => t.key === current?.key));

  const initials = (profile?.full_name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";

  const renderItem = (item: NavItem) => {
    const count = item.badge === "processing" ? processing : 0;
    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title} className={MENU_BUTTON_CLASS}>
          <NavLink to={item.url} end={item.end}>
            <item.icon strokeWidth={1.75} />
            {!collapsed && <span className="flex-1 truncate">{item.title}</span>}
            {!collapsed && count > 0 && (
              <span className="rounded-full bg-warning px-1.5 py-0.5 text-[10.5px] font-bold leading-none text-warning-foreground">
                {count}
              </span>
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" variant="floating" className="border-0">
      <SidebarHeader className="px-3 pb-1 pt-3">
        <button
          type="button"
          onClick={toggleSidebar}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className="flex w-full items-center gap-2.5 rounded-2xl p-1.5 text-left transition-colors hover:bg-white/[.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1"
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[.08] ring-1 ring-white/10">
            <img src={branding.logo_url ?? markWhite} alt={branding.product_name} className="h-6 w-6 object-contain" />
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[14.5px] font-semibold text-sidebar-foreground">{branding.product_name}</div>
                {branding.org_name && branding.org_name !== branding.product_name && (
                  <div className="truncate text-[11px] text-sidebar-foreground/55">{branding.org_name}</div>
                )}
              </div>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-foreground/45" />
            </>
          )}
        </button>

        {showPill && !collapsed && (
          <div className="sidebar-pill mt-3" data-index={tabIndex} role="tablist" aria-label="Área do menu">
            <i aria-hidden="true" />
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={t.key === current?.key}
                data-on={t.key === current?.key}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-1 px-2 pt-2">
        {(collapsed ? tabs.flatMap((t) => t.groups) : current?.groups ?? []).map((group) => (
          <SidebarGroup key={group.label} className="py-1">
            <SidebarGroupLabel className={GROUP_LABEL_CLASS}>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">{group.items.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="px-3 pb-3 pt-2">
        <div className="flex items-center gap-2.5 rounded-2xl bg-white/[.06] p-2 ring-1 ring-white/[.06] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:ring-0">
          <Avatar className="h-9 w-9 shrink-0 rounded-full">
            <AvatarFallback className="rounded-full bg-gradient-to-br from-sidebar-primary to-sidebar-accent text-[11.5px] font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[13px] font-semibold text-sidebar-foreground">
                {profile?.full_name || "Usuário"}
              </span>
              <span className="truncate text-[11px] text-sidebar-foreground/55">{role ? ROLE_LABELS[role] : ""}</span>
            </div>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={signOut}
              title="Sair"
              aria-label="Sair"
              className="rounded-xl p-2 text-sidebar-foreground/55 transition-colors hover:bg-white/[.08] hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
