import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { Copy, Share2, XCircle } from "lucide-react";

type Meeting = Tables<"meetings">;

/**
 * Compartilhamento externo por link.
 *
 * O link só passa a responder depois de ativado aqui, tem prazo de validade e
 * pode ser revogado. Antes toda reunião nascia com um link válido para sempre,
 * que entregava a transcrição inteira a quem tivesse a URL.
 */
export const ShareControls = ({
  meeting,
  onChange,
}: {
  meeting: Meeting;
  onChange: () => void;
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [saving, setSaving] = useState(false);
  const [ttlDays, setTtlDays] = useState("14");

  const shareUrl = `${window.location.origin}/share/${meeting.share_token}`;
  const expired = meeting.share_expires_at
    ? new Date(meeting.share_expires_at) < new Date()
    : false;
  const active = meeting.share_enabled && !meeting.share_revoked_at && !expired;

  const setSharing = async (enabled: boolean) => {
    setSaving(true);
    try {
      const expiresAt = enabled
        ? new Date(Date.now() + Number(ttlDays) * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const { error } = await supabase
        .from("meetings")
        .update({
          share_enabled: enabled,
          share_expires_at: expiresAt,
          share_revoked_at: enabled ? null : new Date().toISOString(),
          shared_by: enabled ? userId : meeting.shared_by,
        })
        .eq("id", meeting.id);

      if (error) throw error;

      if (enabled) {
        await navigator.clipboard.writeText(shareUrl);
        toast({
          title: "Link ativado e copiado",
          description: `Válido por ${ttlDays} dias. Qualquer pessoa com o link vê a análise e a gravação.`,
        });
      } else {
        toast({ title: "Link revogado", description: "O link deixa de responder imediatamente." });
      }

      onChange();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={active ? "default" : "outline"}>
          <Share2 className="mr-2 h-4 w-4" />
          {active ? "Compartilhado" : "Compartilhar"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-4" align="end">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">Link externo</h4>
          <p className="text-xs text-muted-foreground">
            Quem tiver o link vê a análise, a transcrição e a gravação, sem precisar de conta.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="share-toggle" className="text-sm">
            Link ativo
          </Label>
          <Switch
            id="share-toggle"
            checked={active}
            disabled={saving}
            onCheckedChange={setSharing}
          />
        </div>

        {!active && (
          <div className="space-y-2">
            <Label htmlFor="share-ttl" className="text-xs text-muted-foreground">
              Validade
            </Label>
            <Select value={ttlDays} onValueChange={setTtlDays}>
              <SelectTrigger id="share-ttl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 dia</SelectItem>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="14">14 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {active && (
          <>
            <div className="rounded-md border border-border bg-muted/40 p-2">
              <p className="break-all font-mono text-[11px] text-muted-foreground">{shareUrl}</p>
            </div>
            {meeting.share_expires_at && (
              <p className="text-xs text-muted-foreground">
                Expira em {new Date(meeting.share_expires_at).toLocaleDateString("pt-BR")}.
              </p>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  toast({ title: "Link copiado!" });
                }}
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                Copiar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-destructive"
                disabled={saving}
                onClick={() => setSharing(false)}
              >
                <XCircle className="mr-1 h-3.5 w-3.5" />
                Revogar
              </Button>
            </div>
          </>
        )}

        {expired && meeting.share_enabled && (
          <p className="text-xs text-destructive">
            Este link expirou. Ative novamente para gerar uma nova validade.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
};
