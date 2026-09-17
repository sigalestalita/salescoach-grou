import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Agendas from "./pages/Agendas";
import MeetingDetail from "./pages/MeetingDetail";
import Conhecimento from "./pages/Conhecimento";
import Equipe from "./pages/Equipe";
import Configuracoes from "./pages/Configuracoes";
import ArgumentGenerator from "./pages/ArgumentGenerator";
import Extensao from "./pages/Extensao";
import NotFound from "./pages/NotFound";
import SharedMeeting from "./pages/SharedMeeting";
import AcceptInvite from "./pages/AcceptInvite";
import SemOrganizacao from "./pages/SemOrganizacao";
import Plataforma from "./pages/Plataforma";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";

const queryClient = new QueryClient();

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { session, role, orgId, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;
  // Usuário autenticado que ainda não pertence a nenhuma organização.
  if (!orgId || !role) return <Navigate to="/sem-organizacao" replace />;
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/agendas" replace />;
  }
  return <AppLayout>{children}</AppLayout>;
}

// Painel do provedor: exige sessão e cadastro em platform_admins. Não exige
// organização — um operador da plataforma pode não pertencer a nenhuma.
function PlatformRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const { isPlatformAdmin, loading: adminLoading } = usePlatformAdmin();
  if (loading || adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;
  if (!isPlatformAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BrandingProvider>
          <Routes>
            <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
            <Route path="/share/:token" element={<SharedMeeting />} />
            <Route path="/convite/:token" element={<AcceptInvite />} />
            <Route path="/sem-organizacao" element={<SemOrganizacao />} />
            <Route path="/plataforma" element={<PlatformRoute><Plataforma /></PlatformRoute>} />
            <Route path="/" element={<ProtectedRoute allowedRoles={["admin", "gestor"]}><Index /></ProtectedRoute>} />
            <Route path="/agendas" element={<ProtectedRoute><Agendas /></ProtectedRoute>} />
            <Route path="/agendas/:id" element={<ProtectedRoute><MeetingDetail /></ProtectedRoute>} />
            <Route path="/conhecimento" element={<ProtectedRoute allowedRoles={["admin", "gestor"]}><Conhecimento /></ProtectedRoute>} />
            <Route path="/equipe" element={<ProtectedRoute allowedRoles={["admin", "gestor"]}><Equipe /></ProtectedRoute>} />
            <Route path="/configuracoes" element={<ProtectedRoute allowedRoles={["admin", "gestor"]}><Configuracoes /></ProtectedRoute>} />
            <Route path="/argumentos" element={<ProtectedRoute><ArgumentGenerator /></ProtectedRoute>} />
            <Route path="/extensao" element={<ProtectedRoute><Extensao /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </BrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
