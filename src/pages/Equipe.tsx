import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Users, Shield, UserCheck, User, Plus, Pencil, Trash2 } from "lucide-react";

interface TeamMember {
  user_id: string;
  full_name: string | null;
  role: string;
  team_name: string | null;
  team_id: string | null;
}

interface Team {
  id: string;
  name: string;
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
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [form, setForm] = useState({ full_name: "", team_id: "" });
  const { role } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === "admin";

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [profilesRes, rolesRes, teamsRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, team_id"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("teams").select("id, name"),
    ]);

    const teamsData = teamsRes.data || [];
    setTeams(teamsData);
    const teamsMap = new Map(teamsData.map((t) => [t.id, t.name]));
    const rolesMap = new Map(rolesRes.data?.map((r) => [r.user_id, r.role]) || []);

    const merged =
      profilesRes.data?.map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        role: rolesMap.get(p.user_id) || "vendedor",
        team_name: p.team_id ? teamsMap.get(p.team_id) || null : null,
        team_id: p.team_id,
      })) || [];

    setMembers(merged);
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) return;

    try {
      const newUserId = crypto.randomUUID();
      const { error } = await supabase.from("profiles").insert({
        user_id: newUserId,
        full_name: form.full_name.trim(),
        team_id: form.team_id || null,
      });
      if (error) throw error;

      toast({ title: "Sucesso!", description: "Membro criado com sucesso." });
      setCreateOpen(false);
      setForm({ full_name: "", team_id: "" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleEditOpen = (member: TeamMember) => {
    setSelectedMember(member);
    setForm({ full_name: member.full_name || "", team_id: member.team_id || "" });
    setEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: form.full_name.trim(),
          team_id: form.team_id || null,
        })
        .eq("user_id", selectedMember.user_id);
      if (error) throw error;

      toast({ title: "Sucesso!", description: "Membro atualizado." });
      setEditOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!selectedMember) return;
    try {
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("user_id", selectedMember.user_id);
      if (error) throw error;

      toast({ title: "Membro removido", description: "O membro foi excluído." });
      setDeleteOpen(false);
      setSelectedMember(null);
      fetchData();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  if (loading) return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;

  const MemberForm = ({ onSubmit, submitLabel }: { onSubmit: (e: React.FormEvent) => void; submitLabel: string }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Nome *</Label>
        <Input
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          placeholder="Nome completo"
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Equipe</Label>
        <Select value={form.team_id} onValueChange={(v) => setForm({ ...form, team_id: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione uma equipe..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem equipe</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full">{submitLabel}</Button>
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Equipe</h1>
          <p className="text-muted-foreground">Membros do time e seus papéis</p>
        </div>
        {isAdmin && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Membro
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Membro</DialogTitle>
                <DialogDescription>Adicione um executivo ou SDR à equipe</DialogDescription>
              </DialogHeader>
              <MemberForm onSubmit={handleCreate} submitLabel="Criar Membro" />
            </DialogContent>
          </Dialog>
        )}
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
                  {isAdmin && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEditOpen(member)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => {
                          setSelectedMember(member);
                          setDeleteOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Membro</DialogTitle>
            <DialogDescription>Atualize os dados do membro</DialogDescription>
          </DialogHeader>
          <MemberForm onSubmit={handleEditSubmit} submitLabel="Salvar" />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover {selectedMember?.full_name}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Equipe;
