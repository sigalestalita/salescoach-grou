import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, Package, Briefcase, Award, Search, BookOpen, Upload, Link, AlignLeft, ExternalLink, BrainCircuit, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Tables } from "@/integrations/supabase/types";

type KnowledgeDoc = Tables<"knowledge_documents">;
type KnowledgeItem = Tables<"knowledge_items">;

const typeIcons: Record<string, any> = {
  produto: Package,
  servico: Briefcase,
  case: Award,
};

const docTypeLabels: Record<string, string> = {
  pdf: "PDF",
  doc: "DOC",
  planilha: "Planilha",
  link: "Link",
  texto: "Texto",
};

const Conhecimento = () => {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [search, setSearch] = useState("");
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [training, setTraining] = useState(false);
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === "admin";

  const [sourceTab, setSourceTab] = useState("file");
  const [newDoc, setNewDoc] = useState({ title: "", category: "", link_url: "", text_content: "" });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [newItem, setNewItem] = useState({ name: "", item_type: "produto" as string, description: "", category: "" });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [docsRes, itemsRes] = await Promise.all([
      supabase.from("knowledge_documents").select("*").order("created_at", { ascending: false }),
      supabase.from("knowledge_items").select("*").order("created_at", { ascending: false }),
    ]);
    if (docsRes.data) setDocs(docsRes.data);
    if (itemsRes.data) setItems(itemsRes.data);
  };

  const resetDocForm = () => {
    setNewDoc({ title: "", category: "", link_url: "", text_content: "" });
    setDocFile(null);
    setSourceTab("file");
  };

  const handleAddDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setUploading(true);

    try {
      let fileUrl: string | null = null;
      let docType = "texto";
      let extractedContent: string | null = null;

      if (sourceTab === "file" && docFile) {
        const sanitizedName = docFile.name
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `${user.id}/${Date.now()}-${sanitizedName}`;
        const { error: uploadError } = await supabase.storage
          .from("knowledge-files")
          .upload(filePath, docFile);
        if (uploadError) throw uploadError;
        fileUrl = filePath;
        const ext = docFile.name.toLowerCase();
        if (ext.endsWith(".pdf")) docType = "pdf";
        else if (ext.endsWith(".csv") || ext.endsWith(".xls") || ext.endsWith(".xlsx")) docType = "planilha";
        else docType = "doc";
      } else if (sourceTab === "link") {
        if (!newDoc.link_url.trim()) {
          toast({ title: "Erro", description: "Informe a URL do link.", variant: "destructive" });
          setUploading(false);
          return;
        }
        fileUrl = newDoc.link_url.trim();
        docType = "link";
      } else if (sourceTab === "text") {
        if (!newDoc.text_content.trim()) {
          toast({ title: "Erro", description: "Informe o conteúdo de texto.", variant: "destructive" });
          setUploading(false);
          return;
        }
        extractedContent = newDoc.text_content;
        docType = "texto";
      }



      const { data: insertData, error } = await supabase.from("knowledge_documents").insert({
        title: newDoc.title,
        doc_type: docType,
        category: newDoc.category || null,
        file_url: fileUrl,
        extracted_content: extractedContent,
        uploaded_by: user.id,
      }).select().single();

      if (error) throw error;
      toast({ title: "Documento adicionado!" });
      setDocDialogOpen(false);
      resetDocForm();
      fetchData();

      // Trigger automatic content extraction for files and links
      if (insertData && (sourceTab === "file" || sourceTab === "link")) {
        toast({ title: "Extraindo conteúdo...", description: "O conteúdo está sendo extraído e analisado automaticamente." });
        supabase.functions.invoke("extract-document", {
          body: { documentId: insertData.id },
        }).then(({ error: extractError }) => {
          if (extractError) {
            console.error("Extraction error:", extractError);
            toast({ title: "Aviso", description: "Não foi possível extrair o conteúdo automaticamente.", variant: "destructive" });
          } else {
            toast({ title: "Conteúdo extraído!", description: "O conteúdo foi extraído e salvo com sucesso." });
            fetchData();
          }
        });
      }
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("knowledge_items").insert({
      name: newItem.name,
      item_type: newItem.item_type,
      description: newItem.description || null,
      category: newItem.category || null,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Item adicionado!" });
      setItemDialogOpen(false);
      setNewItem({ name: "", item_type: "produto", description: "", category: "" });
      fetchData();
    }
  };

  const handleDeleteDoc = async (docId: string, fileUrl: string | null, docType: string) => {
    try {
      if (fileUrl && docType !== "link") {
        await supabase.storage.from("knowledge-files").remove([fileUrl]);
      }
      const { error } = await supabase.from("knowledge_documents").delete().eq("id", docId);
      if (error) throw error;
      toast({ title: "Documento removido!" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const { error } = await supabase.from("knowledge_items").delete().eq("id", itemId);
      if (error) throw error;
      toast({ title: "Item removido!" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const getDocIcon = (docType: string) => {
    if (docType === "link") return ExternalLink;
    if (docType === "texto") return AlignLeft;
    return FileText;
  };

  const handleTrainAI = async () => {
    setTraining(true);
    try {
      // Find all docs without extracted content that have a file or link
      const pendingDocs = docs.filter(
        (d) => !d.extracted_content && (d.file_url || d.doc_type === "link")
      );

      if (pendingDocs.length === 0 && docs.length === 0 && items.length === 0) {
        toast({ title: "Base vazia", description: "Adicione documentos ou itens antes de treinar a IA.", variant: "destructive" });
        setTraining(false);
        return;
      }

      if (pendingDocs.length === 0) {
        toast({ title: "IA já treinada! ✅", description: `Todos os ${docs.length} documentos e ${items.length} itens já estão processados e prontos para uso nas análises.` });
        setTraining(false);
        return;
      }

      toast({ title: "Treinando IA...", description: `Processando ${pendingDocs.length} documento(s) pendente(s)...` });

      let successCount = 0;
      let errorCount = 0;

      for (const doc of pendingDocs) {
        try {
          const { error } = await supabase.functions.invoke("extract-document", {
            body: { documentId: doc.id },
          });
          if (error) {
            errorCount++;
            console.error(`Failed to extract doc ${doc.id}:`, error);
          } else {
            successCount++;
          }
        } catch {
          errorCount++;
        }
      }

      await fetchData();

      if (errorCount === 0) {
        toast({ title: "IA treinada com sucesso! 🎉", description: `${successCount} documento(s) processado(s). A IA usará esse conhecimento nas próximas análises.` });
      } else {
        toast({ title: "Treinamento parcial", description: `${successCount} extraído(s), ${errorCount} com erro.`, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Erro no treinamento", description: error.message, variant: "destructive" });
    } finally {
      setTraining(false);
    }
  };

  const pendingDocsCount = docs.filter(d => !d.extracted_content && (d.file_url || d.doc_type === "link")).length;
  const extractedDocsCount = docs.filter(d => !!d.extracted_content).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Base de Conhecimento</h1>
          <p className="text-muted-foreground">Documentos, produtos, serviços e cases da empresa</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            <div className="text-right text-xs text-muted-foreground hidden sm:block">
              <p>{extractedDocsCount} doc(s) processado(s)</p>
              {pendingDocsCount > 0 && <p className="text-warning">{pendingDocsCount} pendente(s)</p>}
            </div>
            <Button
              onClick={handleTrainAI}
              disabled={training}
              variant={pendingDocsCount > 0 ? "default" : "outline"}
              className="gap-2"
            >
              {training ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BrainCircuit className="h-4 w-4" />
              )}
              {training ? "Treinando..." : "Treinar IA"}
            </Button>
          </div>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Tabs defaultValue="documentos">
        <TabsList>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="itens">Produtos & Serviços</TabsTrigger>
        </TabsList>

        <TabsContent value="documentos" className="space-y-4">
          {isAdmin && (
            <Dialog open={docDialogOpen} onOpenChange={setDocDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Adicionar Documento</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Novo Documento</DialogTitle></DialogHeader>
                <form onSubmit={handleAddDoc} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Título *</Label>
                    <Input
                      value={newDoc.title}
                      onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
                      placeholder="Ex: Portfólio de Serviços 2025"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Input
                      value={newDoc.category}
                      onChange={(e) => setNewDoc({ ...newDoc, category: e.target.value })}
                      placeholder="Ex: Portfólio, Proposta, Manual"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Conteúdo</Label>
                    <Tabs value={sourceTab} onValueChange={setSourceTab}>
                      <TabsList className="w-full">
                        <TabsTrigger value="file" className="flex-1">
                          <Upload className="h-3 w-3 mr-1" />
                          Arquivo
                        </TabsTrigger>
                        <TabsTrigger value="link" className="flex-1">
                          <Link className="h-3 w-3 mr-1" />
                          Link
                        </TabsTrigger>
                        <TabsTrigger value="text" className="flex-1">
                          <AlignLeft className="h-3 w-3 mr-1" />
                          Texto
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="file">
                        <div className="border-2 border-dashed rounded-lg p-6 text-center">
                          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <Input
                            type="file"
                            accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx"
                            onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                            className="mx-auto"
                          />
                          <p className="text-xs text-muted-foreground mt-2">PDF, DOC, DOCX, TXT, CSV, XLS, XLSX</p>
                        </div>
                      </TabsContent>
                      <TabsContent value="link">
                        <Input
                          value={newDoc.link_url}
                          onChange={(e) => setNewDoc({ ...newDoc, link_url: e.target.value })}
                          placeholder="https://site.com, Google Sheets, ou qualquer URL"
                        />
                        <p className="text-xs text-muted-foreground mt-2">
                          Sites, Google Sheets, Google Drive ou qualquer URL — o conteúdo será lido e extraído automaticamente
                        </p>
                      </TabsContent>
                      <TabsContent value="text">
                        <Textarea
                          value={newDoc.text_content}
                          onChange={(e) => setNewDoc({ ...newDoc, text_content: e.target.value })}
                          placeholder="Cole aqui informações sobre produtos, serviços, processos..."
                          rows={6}
                        />
                        <p className="text-xs text-muted-foreground mt-2">
                          Texto livre sobre seus produtos, serviços ou processos
                        </p>
                      </TabsContent>
                    </Tabs>
                  </div>

                  <Button type="submit" className="w-full" disabled={uploading}>
                    {uploading ? "Salvando..." : "Salvar Documento"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}

          {docs.filter((d) => d.title.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
                <p className="text-muted-foreground">Nenhum documento cadastrado</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {docs.filter((d) => d.title.toLowerCase().includes(search.toLowerCase())).map((doc) => {
                const DocIcon = getDocIcon(doc.doc_type);
                return (
                  <Card key={doc.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <DocIcon className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <h4 className="font-medium">{doc.title}</h4>
                          <p className="text-xs text-muted-foreground">
                            {docTypeLabels[doc.doc_type] || doc.doc_type.toUpperCase()}
                            {doc.doc_type === "link" && doc.file_url && (
                              <a
                                href={doc.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 text-primary hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Abrir link ↗
                              </a>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.category && <Badge variant="secondary">{doc.category}</Badge>}
                        {isAdmin && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover documento?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação não pode ser desfeita. O documento "{doc.title}" será removido permanentemente da base de conhecimento.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteDoc(doc.id, doc.file_url, doc.doc_type)}>
                                  Remover
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="itens" className="space-y-4">
          {isAdmin && (
            <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Adicionar Item</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Novo Item</DialogTitle></DialogHeader>
                <form onSubmit={handleAddItem} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={newItem.item_type} onValueChange={(v) => setNewItem({ ...newItem, item_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="produto">Produto</SelectItem>
                        <SelectItem value="servico">Serviço</SelectItem>
                        <SelectItem value="case">Case</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Textarea value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Input value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} />
                  </div>
                  <Button type="submit" className="w-full">Salvar</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}

          {items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
                <p className="text-muted-foreground">Nenhum item cadastrado</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase())).map((item) => {
                const Icon = typeIcons[item.item_type] || Package;
                return (
                  <Card key={item.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon className="h-4 w-4 text-primary shrink-0" />
                          <CardTitle className="text-sm truncate">{item.name}</CardTitle>
                        </div>
                        {isAdmin && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover item?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação não pode ser desfeita. "{item.name}" será removido permanentemente.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteItem(item.id)}>
                                  Remover
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                      <CardDescription className="text-xs capitalize">{item.item_type}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2">{item.description || "Sem descrição"}</p>
                      {item.category && <Badge variant="secondary" className="mt-2 text-xs">{item.category}</Badge>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Conhecimento;
