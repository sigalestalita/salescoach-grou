import {
  BarChart3,
  Calendar,
  BookOpen,
  Users,
  Settings,
  LogOut,
} from "lucide-react";
import logo from "@/assets/logo.png";
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

const allMainItems = [
  { title: "Dashboard", url: "/", icon: BarChart3, roles: ["admin", "gestor"] },
  { title: "Agendas", url: "/agendas", icon: Calendar, roles: ["admin", "gestor", "vendedor"] },
  { title: "Base de Conhecimento", url: "/conhecimento", icon: BookOpen, roles: ["admin", "gestor"] },
];

const managementItems = [
  { title: "Equipe", url: "/equipe", icon: Users },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { profile, role, signOut } = useAuth();

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const roleLabels: Record<string, string> = {
    admin: "Administrador",
    gestor: "Gestor",
    vendedor: "Executivo",
  };

  const mainItems = allMainItems.filter(item => !role || item.roles.includes(role));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Sales Coach" className="h-9 w-9 shrink-0 object-contain" />
          {!collapsed && (
            <span className="text-sm font-bold text-sidebar-foreground">Sales Coach</span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} end={item.url === "/"}>
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {(role === "admin" || role === "gestor") && (
          <SidebarGroup>
            <SidebarGroupLabel>Gestão</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {managementItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink to={item.url}>
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
              {profile?.full_name?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <span className="truncate text-sm font-medium text-sidebar-foreground">
                {profile?.full_name || "Usuário"}
              </span>
              <span className="text-xs text-sidebar-foreground/60">
                {role ? roleLabels[role] : ""}
              </span>
            </div>
          )}
          {!collapsed && (
            <button onClick={signOut} className="text-sidebar-foreground/60 hover:text-sidebar-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
