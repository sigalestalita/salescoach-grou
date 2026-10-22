import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings, Database, Users } from "lucide-react";
import { BrandingSettings } from "@/components/settings/BrandingSettings";
import { MethodologySettings } from "@/components/settings/MethodologySettings";
import { PlaybookSettings } from "@/components/settings/PlaybookSettings";
import { MeetingTypesSettings } from "@/components/settings/MeetingTypesSettings";
import { CrmSettings } from "@/components/settings/CrmSettings";
import { LeadProfilesSettings } from "@/components/settings/LeadProfilesSettings";
import { PlanUsageCard } from "@/components/settings/PlanUsageCard";

const Configuracoes = () => {
  const { role } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Configurações do sistema e preferências</p>
      </div>

      {/* Usuários e acessos ficam em Equipe (antes eram geridos aqui). */}
      {role === "admin" && (
        <Card data-tour="cfg-usuarios">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2"><Users className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="font-medium">Usuários e acessos</p>
                <p className="text-sm text-muted-foreground">Convidar, criar, mudar papel, redefinir senha e equipes ficam na tela Equipe.</p>
              </div>
            </div>
            <Button variant="outline" asChild><Link to="/equipe">Abrir Equipe</Link></Button>
          </CardContent>
        </Card>
      )}

      {role === "admin" && (
        <>
          <BrandingSettings />
          <MeetingTypesSettings />
          <MethodologySettings />
          <PlaybookSettings />
          <div data-tour="cfg-crm"><CrmSettings /></div>
        </>
      )}

      {/* Gestor também cuida dos perfis: é ele quem conduz o treino do time. */}
      {(role === "admin" || role === "gestor") && <LeadProfilesSettings />}

      <PlanUsageCard />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Database className="h-5 w-5" />
              Dados e privacidade
            </CardTitle>
            <CardDescription>Onde ficam as gravações e análises</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Gravações, transcrições e base de conhecimento ficam isoladas por empresa. Nenhum outro
              cliente da plataforma tem acesso aos dados desta conta.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings className="h-5 w-5" />
              Geral
            </CardTitle>
            <CardDescription>Preferências gerais</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm">Idioma</span>
              <Badge variant="secondary">Português (BR)</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Configuracoes;
