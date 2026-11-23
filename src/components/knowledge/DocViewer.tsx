import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type KnowledgeDoc = Tables<"knowledge_documents">;

/**
 * Abre um documento da base de conhecimento: o arquivo original (baixar) ou o
 * link, e o texto que a IA usa. Admin edita o título e o texto. Antes, a lista
 * só mostrava o nome: não dava para conferir nem corrigir o que a IA lê.
 */
export function DocViewer({ doc, canEdit, onClose, onSaved }: {
  doc: KnowledgeDoc | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (d: KnowledgeDoc) => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    setTitle(doc?.title ?? "");
    setContent(doc?.extracted_content ?? "");
  }, [doc]);

  if (!doc) return null;
  const isLink = doc.doc_type === "link";
  const hasFile = !!doc.file_url && !isLink;
  const changed = title.trim() !== doc.title || content !== (doc.extracted_content ?? "");

  const openFile = async () => {
    if (!doc.file_url) return;
    setOpening(true);
    const { data, error } = await supabase.storage.from("knowledge-files").createSignedUrl(doc.file_url, 300, { download: true });
    setOpening(false);
    if (error || !data?.signedUrl) {
      toast({ title: "Não foi possível abrir o arquivo", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const save = async () => {
    setSaving(true);
    const patch = { title: title.trim() || doc.title, extracted_content: content.trim() ? content : null };
    const { data, error } = await supabase.from("knowledge_documents").update(patch).eq("id", doc.id).select().single();
    setSaving(false);
    if (error || !data) {
      toast({ title: "Não foi possível salvar", description: error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Documento atualizado", description: "A análise e o coach ao vivo já usam o texto novo." });
    onSaved(data);
  };

  return (
    <Dialog open={!!doc} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{canEdit ? "Documento" : doc.title}</DialogTitle>
          <DialogDescription>
            O texto abaixo é o que a IA lê deste documento na análise e no coach ao vivo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {canEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Título</Label>
              <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {hasFile && (
              <Button type="button" variant="outline" size="sm" onClick={openFile} disabled={opening}>
                {opening ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />} Baixar o arquivo original
              </Button>
            )}
            {isLink && doc.file_url && (
              <Button type="button" variant="outline" size="sm" asChild>
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 mr-1" /> Abrir o link</a>
              </Button>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-content">Conteúdo usado pela IA</Label>
            <Textarea id="doc-content" rows={16} className="font-mono text-xs leading-relaxed"
              value={content} onChange={(e) => setContent(e.target.value)} readOnly={!canEdit}
              placeholder={doc.file_url ? "O conteúdo ainda não foi extraído. Use \"Treinar IA\" na página." : "Sem conteúdo."} />
            {canEdit && <p className="text-xs text-muted-foreground">Corrija ou complete o texto aqui. Mudar o texto não altera o arquivo original.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{canEdit ? "Cancelar" : "Fechar"}</Button>
          {canEdit && <Button onClick={save} disabled={saving || !changed}>{saving ? "Salvando…" : "Salvar"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
