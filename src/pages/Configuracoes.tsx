import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings, Brain, Database, CreditCard } from "lucide-react";

const Configuracoes = () => {
  const { role } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Configurações do sistema e preferências</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Brain className="h-5 w-5" />
              Modelo de IA
            </CardTitle>
            <CardDescription>Modelo utilizado para análises</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm">Modelo ativo</span>
              <Badge>Lovable AI</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              O sistema utiliza Lovable AI (Google Gemini) para transcrição e análise das reuniões.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Database className="h-5 w-5" />
              Base de Dados
            </CardTitle>
            <CardDescription>Informações sobre armazenamento</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm">Backend</span>
              <Badge variant="secondary">Lovable Cloud</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Dados armazenados de forma segura com Lovable Cloud.
            </p>
          </CardContent>
        </Card>

        {role === "admin" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CreditCard className="h-5 w-5" />
                Custos de API
              </CardTitle>
              <CardDescription>Monitoramento de uso</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                O monitoramento detalhado de custos estará disponível após as primeiras análises.
              </p>
            </CardContent>
          </Card>
        )}

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
