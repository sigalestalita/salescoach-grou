import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Check, Copy, KeyRound, Mail, Pencil, Plus, Shield, Trash2, User, UserCheck, UserPlus, Users, X,
} from "lucide-react";

/**
 * Equipe: quem tem acesso ao Sales Coach, com que papel e em que equipe.
 *
 * Todos os papéis com acesso à tela veem o time; só o admin convida, cria,
 * edita, redefine senha e remove (função manage-users, que valida o papel no
 * servidor). Antes, "Novo Membro" criava só um nome na lista, sem login; o
 * acesso de verdade ficava escondido em Configurações. Agora fica tudo aqui.
 */

type Role = "admin" | "gestor" | "vendedor";

interface Member {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: Role;
  team_id: string | null;
  /** Perfil sem login (cadastros antigos ou de demonstração). */
  noLogin: boolean;
}

interface Team { id: string; name: string }

interface Invite {
  id: string;
  email: string;
  role: Role;
  token: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

const ROLE_LABEL: Record<Role, string> = { admin: "Admin", gestor: "Gestor", vendedor: "Executivo" };
const ROLE_ICON: Record<Role, typeof User> = { admin: Shield, gestor: UserCheck, vendedor: User };
const ROLE_HINT: Record<Role, string> = {
  vendedor: "Grava e vê as próprias reuniões.",
  gestor: "Vê as reuniões e a visão geral do time.",
  admin: "Configura a empresa, os usuários e o CRM.",
};
const NO_TEAM = "none";

async function manageUsers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("manage-users", { body });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

const inviteLink = (token: string) => `${window.location.origin}/convite/${token}`;

function RoleSelect({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <div className="space-y-2">
      <Label>Papel</Label>
      <Select value={value} onValueChange={(v) => onChange(v as Role)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{ROLE_HINT[value]}</p>
    </div>
  );
}

function TeamSelect({ teams, value, onChange }: { teams: Team[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>Equipe</Label>
      <Select value={value || NO_TEAM} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_TEAM}>Sem equipe</SelectItem>
          {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

const Equipe = () => {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === "admin";

  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Diálogos
  const [addOpen, setAddOpen] = useState(false);
  const [add, setAdd] = useState({ full_name: "", email: "", password: "", role: "vendedor" as Role, team_id: NO_TEAM });
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [edit, setEdit] = useState<Member | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", role: "vendedor" as Role, team_id: NO_TEAM });
  const [resetFor, setResetFor] = useState<Member | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [removeFor, setRemoveFor] = useState<Member | null>(null);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [newTeam, setNewTeam] = useState("");

  const load = useCallback(async () => {
    const [profilesRes, rolesRes, teamsRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, team_id"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("teams").select("id, name").order("name"),
    ]);
    const roles = new Map((rolesRes.data ?? []).map((r) => [r.user_id, r.role as Role]));
    let emails = new Map<string, string>();
    if (isAdmin) {
      try {
        const [{ users }, { invites: inv }] = await Promise.all([
          manageUsers<{ users: { user_id: string; email: string }[] }>({ action: "list_users" }),
          manageUsers<{ invites: Invite[] }>({ action: "list_invites" }),
        ]);
        emails = new Map(users.map((u) => [u.user_id, u.email]));
        setInvites(inv.filter((i) => !i.accepted_at && !i.revoked_at && new Date(i.expires_at) > new Date()));
      } catch (e) {
        toast({ title: "Não foi possível carregar os acessos", description: (e as Error).message, variant: "destructive" });
      }
    }
    setTeams(teamsRes.data ?? []);
    setMembers((profilesRes.data ?? []).map((p) => ({
      user_id: p.user_id,
      full_name: p.full_name,
      email: emails.get(p.user_id) ?? null,
      role: roles.get(p.user_id) ?? "vendedor",
      team_id: p.team_id,
      noLogin: isAdmin && !emails.has(p.user_id),
    })).sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")));
    setLoading(false);
  }, [isAdmin, toast]);

  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: ok });
      await load();
      return true;
    } catch (e) {
      toast({ title: "Algo deu errado", description: (e as Error).message, variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const teamOrNull = (v: string) => (v && v !== NO_TEAM ? v : null);
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? null;

  // ── Adicionar ──
  const openAdd = () => {
    setAdd({ full_name: "", email: "", password: "", role: "vendedor", team_id: NO_TEAM });
    setCreatedLink(null);
    setAddOpen(true);
  };

  const sendInvite = async () => {
    setBusy(true);
    try {
      const r = await manageUsers<{ token: string }>({
        action: "invite_user", email: add.email.trim(), role: add.role, team_id: teamOrNull(add.team_id),
      });
      setCreatedLink(inviteLink(r.token));
      await load();
    } catch (e) {
      toast({ title: "Não foi possível convidar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const createUser = async () => {
    const ok = await run(() => manageUsers({
      action: "create_user", email: add.email.trim(), password: add.password, full_name: add.full_name.trim(),
      role: add.role, team_id: teamOrNull(add.team_id),
    }).then(() => {}), "Usuário criado. Ele já pode entrar com o e-mail e a senha.");
    if (ok) setAddOpen(false);
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Link copiado" });
  };

  // ── Editar ──
  const openEdit = (m: Member) => {
    setEdit(m);
    setEditForm({ full_name: m.full_name ?? "", role: m.role, team_id: m.team_id ?? NO_TEAM });
  };

  const saveEdit = async () => {
    if (!edit) return;
    const ok = await run(async () => {
      const { error } = await supabase.from("profiles")
        .update({ full_name: editForm.full_name.trim() || null, team_id: teamOrNull(editForm.team_id) })
        .eq("user_id", edit.user_id);
      if (error) throw error;
      if (!edit.noLogin && editForm.role !== edit.role) {
        await manageUsers({ action: "update_role", user_id: edit.user_id, role: editForm.role });
      }
    }, "Dados atualizados");
    if (ok) setEdit(null);
  };

  const resetPassword = async () => {
    if (!resetFor) return;
    const ok = await run(() => manageUsers({ action: "reset_password", user_id: resetFor.user_id, new_password: newPassword }).then(() => {}),
      "Senha redefinida");
    if (ok) { setResetFor(null); setNewPassword(""); }
  };

  const remove = async () => {
    if (!removeFor) return;
    const m = removeFor;
    const ok = await run(async () => {
      if (m.noLogin) {
        const { error } = await supabase.from("profiles").delete().eq("user_id", m.user_id);
        if (error) throw error;
      } else {
        await manageUsers({ action: "delete_user", user_id: m.user_id });
      }
    }, "Removido da equipe");
    if (ok) setRemoveFor(null);
  };

  // ── Equipes ──
  const createTeam = async () => {
    const name = newTeam.trim();
    if (!name) return;
    const ok = await run(async () => {
      const { error } = await supabase.from("teams").insert({ name });
      if (error) throw error;
    }, `Equipe "${name}" criada`);
    if (ok) setNewTeam("");
  };

  const deleteTeam = (t: Team) => run(async () => {
    const { error } = await supabase.from("teams").delete().eq("id", t.id);
    if (error) throw error;
  }, `Equipe "${t.name}" removida`);

  if (loading) return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div data-tour="equipe-titulo">
          <h1 className="text-3xl font-bold">Equipe</h1>
          <p className="text-muted-foreground">Quem tem acesso ao Sales Coach, com que papel e em que equipe</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setTeamsOpen(true)} data-tour="equipe-equipes">
              <Users className="h-4 w-4 mr-2" /> Equipes
            </Button>
            <Button onClick={openAdd} data-tour="equipe-adicionar">
              <UserPlus className="h-4 w-4 mr-2" /> Adicionar pessoa
            </Button>
          </div>
        )}
      </div>

      {isAdmin && invites.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4" /> Convites pendentes</CardTitle>
            <CardDescription>A pessoa cria a própria senha pelo link. Ele vale até a data indicada.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {invites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{i.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {ROLE_LABEL[i.role]} · vale até {new Date(i.expires_at).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div className="flex gap-1">
                  {i.token && (
                    <Button variant="ghost" size="sm" onClick={() => copy(inviteLink(i.token!))}>
                      <Copy className="h-4 w-4 mr-1" /> Copiar link
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy}
                    onClick={() => run(() => manageUsers({ action: "revoke_invite", invite_id: i.id }).then(() => {}), "Convite cancelado")}>
                    <X className="h-4 w-4 mr-1" /> Cancelar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {members.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
            <p className="text-muted-foreground">Ninguém na equipe ainda</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-tour="equipe-lista">
          {members.map((m) => {
            const RoleIcon = ROLE_ICON[m.role];
            const team = teamName(m.team_id);
            const me = m.user_id === user?.id;
            return (
              <Card key={m.user_id}>
                <CardContent className="p-4 flex items-center gap-4">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>{m.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate">{m.full_name || m.email || "Sem nome"}{me && <span className="text-muted-foreground font-normal"> (você)</span>}</h4>
                    {m.email && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <Badge variant="secondary" className="text-xs flex items-center gap-1">
                        <RoleIcon className="h-3 w-3" /> {ROLE_LABEL[m.role]}
                      </Badge>
                      {team && <Badge variant="outline" className="text-xs">{team}</Badge>}
                      {m.noLogin && <Badge variant="outline" className="text-xs text-muted-foreground" title="Cadastro sem login: aparece nos relatórios, mas não acessa o sistema.">Sem acesso</Badge>}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => openEdit(m)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {!m.noLogin && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Redefinir senha" onClick={() => { setResetFor(m); setNewPassword(""); }}>
                          <KeyRound className="h-4 w-4" />
                        </Button>
                      )}
                      {!me && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Remover" onClick={() => setRemoveFor(m)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Adicionar pessoa */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar pessoa</DialogTitle>
            <DialogDescription>Ela passa a entrar no Sales Coach com o próprio e-mail.</DialogDescription>
          </DialogHeader>
          {createdLink ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-success"><Check className="h-4 w-4" /> Convite criado</div>
              <p className="text-sm text-muted-foreground">Envie este link para {add.email}. Por ele, a pessoa cria a própria senha e entra já na sua empresa.</p>
              <div className="flex gap-2">
                <Input readOnly value={createdLink} onFocus={(e) => e.currentTarget.select()} />
                <Button onClick={() => copy(createdLink)}><Copy className="h-4 w-4" /></Button>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Concluir</Button></DialogFooter>
            </div>
          ) : (
            <Tabs defaultValue="convite">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="convite">Convidar por link</TabsTrigger>
                <TabsTrigger value="senha">Criar com senha</TabsTrigger>
              </TabsList>
              <TabsContent value="convite" className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">Recomendado: a pessoa recebe um link e cria a própria senha.</p>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input type="email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} placeholder="nome@empresa.com" />
                </div>
                <RoleSelect value={add.role} onChange={(r) => setAdd({ ...add, role: r })} />
                <TeamSelect teams={teams} value={add.team_id} onChange={(v) => setAdd({ ...add, team_id: v })} />
                <DialogFooter>
                  <Button onClick={sendInvite} disabled={busy || !/\S+@\S+\.\S+/.test(add.email)}>
                    <Mail className="h-4 w-4 mr-2" /> {busy ? "Gerando…" : "Gerar convite"}
                  </Button>
                </DialogFooter>
              </TabsContent>
              <TabsContent value="senha" className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">Você define uma senha inicial e passa para a pessoa.</p>
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={add.full_name} onChange={(e) => setAdd({ ...add, full_name: e.target.value })} placeholder="Nome completo" />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input type="email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} placeholder="nome@empresa.com" />
                </div>
                <div className="space-y-2">
                  <Label>Senha inicial</Label>
                  <Input type="password" value={add.password} onChange={(e) => setAdd({ ...add, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
                </div>
                <RoleSelect value={add.role} onChange={(r) => setAdd({ ...add, role: r })} />
                <TeamSelect teams={teams} value={add.team_id} onChange={(v) => setAdd({ ...add, team_id: v })} />
                <DialogFooter>
                  <Button onClick={createUser} disabled={busy || !add.full_name.trim() || !/\S+@\S+\.\S+/.test(add.email) || add.password.length < 6}>
                    <Plus className="h-4 w-4 mr-2" /> {busy ? "Criando…" : "Criar usuário"}
                  </Button>
                </DialogFooter>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar</DialogTitle>
            <DialogDescription>{edit?.email ?? "Cadastro sem login"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
            </div>
            {edit && !edit.noLogin && edit.user_id !== user?.id && (
              <RoleSelect value={editForm.role} onChange={(r) => setEditForm({ ...editForm, role: r })} />
            )}
            <TeamSelect teams={teams} value={editForm.team_id} onChange={(v) => setEditForm({ ...editForm, team_id: v })} />
          </div>
          <DialogFooter>
            <Button onClick={saveEdit} disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redefinir senha */}
      <Dialog open={!!resetFor} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>Nova senha para {resetFor?.full_name || resetFor?.email}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nova senha</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
          </div>
          <DialogFooter>
            <Button onClick={resetPassword} disabled={busy || newPassword.length < 6}>{busy ? "Salvando…" : "Redefinir senha"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remover */}
      <AlertDialog open={!!removeFor} onOpenChange={(o) => !o && setRemoveFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {removeFor?.full_name || removeFor?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeFor?.noLogin
                ? "O cadastro sai da lista da equipe."
                : "A pessoa perde o acesso ao Sales Coach na hora. As reuniões que ela gravou continuam na empresa."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Equipes */}
      <Dialog open={teamsOpen} onOpenChange={setTeamsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Equipes</DialogTitle>
            <DialogDescription>Agrupe as pessoas (ex.: SDRs, Closers, Regional Sul).</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {teams.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma equipe criada.</p>}
            {teams.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2 text-sm">
                <span>{t.name} <span className="text-muted-foreground">· {members.filter((m) => m.team_id === t.id).length} pessoa(s)</span></span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Remover equipe" disabled={busy} onClick={() => deleteTeam(t)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder="Nome da nova equipe"
              onKeyDown={(e) => { if (e.key === "Enter") createTeam(); }} />
            <Button onClick={createTeam} disabled={busy || !newTeam.trim()}><Plus className="h-4 w-4" /></Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Equipe;
