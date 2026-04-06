import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, Shield, UserCheck, User } from "lucide-react";

interface TeamMember {
  user_id: string;
  full_name: string | null;
  role: string;
  team_name: string | null;
}

const roleIcons: Record<string, any> = {
  admin: Shield,
  gestor: UserCheck,
  vendedor: User,
};

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  vendedor: "Vendedor",
};

const Equipe = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const { role } = useAuth();

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, team_id");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const { data: teams } = await supabase.from("teams").select("id, name");

    const teamsMap = new Map(teams?.map((t) => [t.id, t.name]) || []);
    const rolesMap = new Map(roles?.map((r) => [r.user_id, r.role]) || []);

    const merged =
      profiles?.map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        role: rolesMap.get(p.user_id) || "vendedor",
        team_name: p.team_id ? teamsMap.get(p.team_id) || null : null,
      })) || [];

    setMembers(merged);
    setLoading(false);
  };

  if (loading) return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Equipe</h1>
        <p className="text-muted-foreground">Membros do time e seus papéis</p>
      </div>

      {members.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
            <p className="text-muted-foreground">Nenhum membro encontrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => {
            const RoleIcon = roleIcons[member.role] || User;
            return (
              <Card key={member.user_id}>
                <CardContent className="p-4 flex items-center gap-4">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>
                      {member.full_name?.[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate">{member.full_name || "Sem nome"}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs flex items-center gap-1">
                        <RoleIcon className="h-3 w-3" />
                        {roleLabels[member.role]}
                      </Badge>
                      {member.team_name && (
                        <Badge variant="outline" className="text-xs">{member.team_name}</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Equipe;
