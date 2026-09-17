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
  type LucideIcon,
} from "lucide-react";
import markWhite from "@/assets/salescoach-mark-white.png";
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
 * Fundo navy da marca, símbolo em branco, grupos por função. O logo e o nome
 * vêm da organização quando ela os definiu; caso contrário, a marca da
 * plataforma.
 */

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  roles: string[];
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const ALL_ROLES = ["admin", "gestor", "vendedor"];
const MANAGEMENT = ["admin", "gestor"];

const GROUPS: NavGroup[] = [
  {
    label: "Análise",
    items: [
      { title: "Visão geral", url: "/", icon: LayoutDashboard, roles: MANAGEMENT, end: true },
      { title: "Agendas", url: "/agendas", icon: CalendarDays, roles: ALL_ROLES },
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
    items: [
      { title: "Extensão Chrome", url: "/extensao", icon: MonitorSmartphone, roles: ALL_ROLES },
    ],
  },
  {
    label: "Administração",
    items: [
      { title: "Equipe", url: "/equipe", icon: Users, roles: MANAGEMENT },
      { title: "Configurações", url: "/configuracoes", icon: Settings, roles: MANAGEMENT },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  vendedor: "Executivo",
};

const MENU_BUTTON_CLASS =
  "relative h-9 px-2.5 text-[13.5px] font-medium text-sidebar-foreground/80 " +
  "hover:text-sidebar-foreground " +
  "data-[active=true]:text-sidebar-foreground data-[active=true]:font-semibold " +
  "data-[active=true]:before:absolute data-[active=true]:before:left-0 data-[active=true]:before:top-2 " +
  "data-[active=true]:before:bottom-2 data-[active=true]:before:w-[3px] data-[active=true]:before:rounded-r " +
  "data-[active=true]:before:bg-sidebar-primary data-[active=true]:before:content-[''] " +
  "[&>svg]:size-[18px] [&>svg]:opacity-80 data-[active=true]:[&>svg]:opacity-100";

const GROUP_LABEL_CLASS =
  "px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/55";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { profile, role, signOut } = useAuth();
  const { branding } = useBranding();
  const { isPlatformAdmin } = usePlatformAdmin();

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const visibleGroups = GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !role || item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);

  const initials = (profile?.full_name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="px-3 pb-2 pt-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center">
            <img
              src={branding.logo_url ?? markWhite}
              alt={branding.product_name}
              className="h-8 w-8 object-contain"
            />
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[15px] font-semibold text-sidebar-foreground">
                {branding.product_name}
              </div>
              {branding.org_name && branding.org_name !== branding.product_name && (
                <div className="truncate text-[11px] text-sidebar-foreground/55">{branding.org_name}</div>
              )}
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-1 px-1.5 pt-2">
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.label} className="py-1">
            <SidebarGroupLabel className={GROUP_LABEL_CLASS}>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className={MENU_BUTTON_CLASS}
                    >
                      <NavLink to={item.url} end={item.end}>
                        <item.icon />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {isPlatformAdmin && (
          <SidebarGroup className="py-1">
            <SidebarGroupLabel className={GROUP_LABEL_CLASS}>Plataforma</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/plataforma")}
                    tooltip="Empresas clientes"
                    className={MENU_BUTTON_CLASS}
                  >
                    <NavLink to="/plataforma">
                      <Building2 />
                      {!collapsed && <span>Empresas clientes</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-8 w-8 shrink-0 rounded-md">
            <AvatarFallback className="rounded-md bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[13px] font-medium text-sidebar-foreground">
                {profile?.full_name || "Usuário"}
              </span>
              <span className="truncate text-[11px] text-sidebar-foreground/55">
                {role ? ROLE_LABELS[role] : ""}
              </span>
            </div>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={signOut}
              title="Sair"
              aria-label="Sair"
              className="rounded-md p-1.5 text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
