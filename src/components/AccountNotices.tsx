import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Clock, Lock } from "lucide-react";

/**
 * Avisos da conta, mostrados no topo do app:
 *
 * - Demonstração: "A demonstração termina em X dias". Vencido o prazo, a conta
 *   fica bloqueada com uma tela de aviso (o banco já não aceita escrita nem
 *   funções; ver 20261022090000_demo_e_configuracao.sql). O operador da
 *   plataforma, no modo suporte, vê a faixa mas não é bloqueado.
 * - Primeiro acesso: quem recebeu uma senha gerada pelo painel da plataforma
 *   cria a própria senha antes de usar o app.
 */

const DAY = 864e5;

// demo_ends_at ainda não está nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useDemoEndsAt(): string | null {
  const { orgId } = useAuth();
  const [endsAt, setEndsAt] = useState<string | null>(null);
  useEffect(() => {
    if (!orgId) return;
    let alive = true;
    db.from("organizations").select("demo_ends_at").eq("id", orgId).maybeSingle()
      .then(({ data }: { data: { demo_ends_at: string | null } | null }) => { if (alive) setEndsAt(data?.demo_ends_at ?? null); });
    return () => { alive = false; };
  }, [orgId]);
  return endsAt;
}

function daysLeft(endsAt: string): number {
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / DAY));
}

export function DemoBanner({ endsAt }: { endsAt: string }) {
  const days = daysLeft(endsAt);
  const date = new Date(endsAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const urgent = days <= 3;
  const when = days === 0 ? "hoje" : days === 1 ? "amanhã" : `em ${days} dias`;
  return (
    <div
      role="status"
      className={`flex items-start gap-2 px-4 py-2 text-sm md:px-8 ${
        urgent ? "bg-orange-100 text-orange-950" : "bg-primary/10 text-foreground"
      }`}
    >
      <Clock className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <strong>Ambiente de demonstração.</strong> A demonstração termina {when} ({date}). Para continuar usando depois
        disso, fale com a equipe do Sales Coach.
      </span>
    </div>
  );
}

export function DemoEndedScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <Lock className="mx-auto h-10 w-10 text-primary" />
        <h1 className="text-xl font-semibold">A demonstração terminou</h1>
        <p className="text-sm text-muted-foreground">
          O período de demonstração desta conta acabou. Seus dados continuam guardados. Para continuar usando o Sales
          Coach, fale com a equipe que liberou a demonstração.
        </p>
        <Button variant="outline" onClick={onSignOut}>Sair</Button>
      </div>
    </div>
  );
}

export function isDemoOver(endsAt: string | null): boolean {
  return !!endsAt && new Date(endsAt).getTime() <= Date.now();
}

/** Troca da senha gerada no primeiro acesso. Não fecha sem salvar. */
export function FirstPasswordDialog() {
  const { user, support } = useAuth();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const open = !support && !done && !!user?.user_metadata?.must_change_password;
  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;

  const save = async () => {
    if (password.length < 8 || password !== confirm) return;
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
    setSaving(false);
    if (error) {
      toast({ title: "Não foi possível salvar a senha", description: error.message, variant: "destructive" });
      return;
    }
    setDone(true);
    toast({ title: "Senha criada", description: "Use esta senha nos próximos acessos." });
  };

  return (
    <Dialog open={open}>
      <DialogContent className="[&>button]:hidden" onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Crie sua senha</DialogTitle>
          <DialogDescription>
            Você entrou com a senha provisória enviada pela equipe do Sales Coach. Escolha uma senha sua para os próximos
            acessos.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Nova senha</Label>
            <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {tooShort && <p className="text-xs text-destructive">Use pelo menos 8 caracteres.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Repita a senha</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {mismatch && <p className="text-xs text-destructive">As senhas não são iguais.</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || password.length < 8 || password !== confirm}>
              {saving ? "Salvando..." : "Salvar senha"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
