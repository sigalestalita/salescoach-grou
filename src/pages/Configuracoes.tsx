import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings, Brain, Database, CreditCard, Users, Plus, KeyRound, Trash2, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ManagedUser {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string;
  role: string;
  team_id: string | null;
  created_at: string;
}

const roleLabels: Record<string, string> = {
  admin: "Admin",
  gestor: "Gestor",
  vendedor: "Executivo",
};

const Configuracoes = () => {
  const { role } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Create user dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("vendedor");
  const [newTeamId, setNewTeamId] = useState("");
  const [creating, setCreating] = useState(false);

  // Reset password dialog
  const [resetOpen, setResetOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState("");
  const [resetUserName, setResetUserName] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  // Change role dialog
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleUserId, setRoleUserId] = useState("");
  const [roleUserName, setRoleUserName] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [changingRole, setChangingRole] = useState(false);

  const callManageUsers = async (body: any) => {
    const { data, error } = await supabase.functions.invoke("manage-users", { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const fetchUsers = useCallback(async () => {
    if (role !== "admin") return;
    setLoadingUsers(true);
    try {
      const data = await callManageUsers({ action: "list_users" });
      setUsers(data.users || []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar usuários", description: err.message, variant: "destructive" });
    } finally {
      setLoadingUsers(false);
    }
  }, [role]);

  const fetchTeams = useCallback(async () => {
    const { data } = await supabase.from("teams").select("id, name");
    setTeams(data || []);
  }, []);

  useEffect(() => {
    if (role === "admin") {
      fetchUsers();
      fetchTeams();
    }
  }, [role, fetchUsers, fetchTeams]);

  const handleCreateUser = async () => {
    setCreating(true);
    try {
      await callManageUsers({
        action: "create_user",
        email: newEmail,
        password: newPassword,
        full_name: newName,
        role: newRole,
        team_id: newTeamId || null,
      });
      toast({ title: "Usuário criado com sucesso!" });
      setCreateOpen(false);
      setNewEmail("");
      setNewPassword("");
      setNewName("");
      setNewRole("vendedor");
      setNewTeamId("");
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Erro ao criar usuário", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async () => {
    setResetting(true);
    try {
      await callManageUsers({
        action: "reset_password",
        user_id: resetUserId,
        new_password: resetPassword,
      });
      toast({ title: "Senha redefinida com sucesso!" });
      setResetOpen(false);
      setResetPassword("");
    } catch (err: any) {
      toast({ title: "Erro ao redefinir senha", description: err.message, variant: "destructive" });
      fetchUsers();
    } finally {
      setResetting(false);
    }
  };

  const handleChangeRole = async () => {
    setChangingRole(true);
    try {
      await callManageUsers({
        action: "update_role",
        user_id: roleUserId,
        role: selectedRole,
      });
      toast({ title: "Papel atualizado com sucesso!" });
      setRoleOpen(false);
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Erro ao atualizar papel", description: err.message, variant: "destructive" });
      fetchUsers();
    } finally {
      setChangingRole(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Tem certeza que deseja excluir o usuário "${userName}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await callManageUsers({ action: "delete_user", user_id: userId });
      toast({ title: "Usuário excluído com sucesso!" });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Erro ao excluir usuário", description: err.message, variant: "destructive" });
      fetchUsers();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Configurações do sistema e preferências</p>
      </div>

      {/* Admin User Management */}
      {role === "admin" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5" />
                Gerenciamento de Usuários
              </CardTitle>
              <CardDescription>Crie, edite papéis e gerencie senhas dos usuários</CardDescription>
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Novo Usuário
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Novo Usuário</DialogTitle>
                  <DialogDescription>Preencha os dados do novo usuário.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Nome completo</Label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do usuário" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@empresa.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Senha</Label>
                    <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                  </div>
                  <div className="space-y-2">
                    <Label>Papel</Label>
                    <Select value={newRole} onValueChange={setNewRole}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                      <SelectItem value="vendedor">Executivo</SelectItem>
                        <SelectItem value="gestor">Gestor</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Equipe (opcional)</Label>
                    <Select value={newTeamId} onValueChange={setNewTeamId}>
                      <SelectTrigger><SelectValue placeholder="Selecione uma equipe" /></SelectTrigger>
                      <SelectContent>
                        {teams.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateUser} disabled={creating || !newEmail || !newPassword || !newName}>
                    {creating ? "Criando..." : "Criar Usuário"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {loadingUsers ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin h-6 w-6 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                          {roleLabels[u.role] || u.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Alterar papel"
                          onClick={() => {
                            setRoleUserId(u.user_id);
                            setRoleUserName(u.full_name || u.email);
                            setSelectedRole(u.role);
                            setRoleOpen(true);
                          }}
                        >
                          <Shield className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Redefinir senha"
                          onClick={() => {
                            setResetUserId(u.user_id);
                            setResetUserName(u.full_name || u.email);
                            setResetPassword("");
                            setResetOpen(true);
                          }}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Excluir usuário"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteUser(u.user_id, u.full_name || u.email)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Nenhum usuário encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reset Password Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir Senha</DialogTitle>
            <DialogDescription>Defina uma nova senha para {resetUserName}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <Input type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleResetPassword} disabled={resetting || resetPassword.length < 6}>
              {resetting ? "Salvando..." : "Redefinir Senha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Papel</DialogTitle>
            <DialogDescription>Altere o papel de {roleUserName}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendedor">Executivo</SelectItem>
                   <SelectItem value="gestor">Gestor</SelectItem>
                   <SelectItem value="admin">Admin</SelectItem>
                 </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleChangeRole} disabled={changingRole}>
              {changingRole ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
