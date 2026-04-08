import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Upload,
  Calendar,
  Search,
  Thermometer,
  Clock,
  Target,
  Link,
  Pencil,
  Trash2,
  RotateCcw,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { Tables } from "@/integrations/supabase/types";

type Meeting = Tables<"meetings">;
type Profile = Tables<"profiles">;

const statusLabels: Record<string, string> = {
  enviado: "Enviado",
  transcrevendo: "Transcrevendo",
  analisando: "Analisando",
  completo: "Completo",
  erro: "Erro",
};

const statusColors: Record<string, string> = {
  enviado: "bg-muted text-muted-foreground",
  transcrevendo: "bg-info/10 text-info",
  analisando: "bg-warning/10 text-warning",
  completo: "bg-success/10 text-success",
  erro: "bg-destructive/10 text-destructive",
};

const tempLabels: Record<string, string> = {
  frio: "❄️ Frio",
  morno: "🌤️ Morno",
  quente: "🔥 Quente",
};

const Agendas = () => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("todos");
  const [filterSeller, setFilterSeller] = useState("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sourceTab, setSourceTab] = useState("file");
  const [newMeeting, setNewMeeting] = useState({
    title: "",
    lead_name: "",
    lead_company: "",
    lead_email: "",
    meeting_date: "",
    youtube_url: "",
    meeting_type: "empresa",
    seller_id: "",
  });
  const [editForm, setEditForm] = useState({
    title: "",
    lead_name: "",
    lead_company: "",
    lead_email: "",
    meeting_type: "empresa",
    seller_id: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const { user, role } = useAuth();
  const isVendedor = role === "vendedor";
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchMeetings();
    fetchProfiles();
  }, []);

  const fetchMeetings = async () => {
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setMeetings(data || []);
    }
    setLoading(false);
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from("profiles").select("*");
    if (data) setProfiles(data);
  };

  const resetForm = () => {
    setNewMeeting({
      title: "", lead_name: "", lead_company: "", lead_email: "",
      meeting_date: "", youtube_url: "", meeting_type: "empresa", seller_id: "",
    });
    setFile(null);
    setSourceTab("file");
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMeeting.title) return;
    setUploading(true);

    try {
      let fileUrl = null;
      let fileType = null;

      if (sourceTab === "file" && file) {
        const filePath = `${user.id}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("meeting-files")
          .upload(filePath, file);
        if (uploadError) throw uploadError;
        fileUrl = filePath;
        fileType = file.type;
      }

      const sellerId = newMeeting.seller_id || user.id;

      const { error } = await supabase.from("meetings").insert({
        title: newMeeting.title,
        seller_id: sellerId,
        lead_name: newMeeting.lead_name || null,
        lead_company: newMeeting.lead_company || null,
        lead_email: newMeeting.lead_email || null,
        meeting_date: newMeeting.meeting_date || null,
        file_url: fileUrl,
        file_type: fileType,
        youtube_url: (sourceTab === "link" && newMeeting.youtube_url) ? newMeeting.youtube_url : null,
        meeting_type: newMeeting.meeting_type,
      });

      if (error) throw error;
      toast({ title: "Sucesso!", description: "Agenda criada com sucesso." });
      setDialogOpen(false);
      resetForm();
      fetchMeetings();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setEditForm({
      title: meeting.title,
      lead_name: meeting.lead_name || "",
      lead_company: meeting.lead_company || "",
      lead_email: meeting.lead_email || "",
      meeting_type: meeting.meeting_type || "empresa",
      seller_id: meeting.seller_id || "",
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMeeting) return;
    try {
      const { error } = await supabase.from("meetings").update({
        title: editForm.title,
        lead_name: editForm.lead_name || null,
        lead_company: editForm.lead_company || null,
        lead_email: editForm.lead_email || null,
        meeting_type: editForm.meeting_type,
        seller_id: editForm.seller_id || selectedMeeting.seller_id,
      }).eq("id", selectedMeeting.id);
      if (error) throw error;
      toast({ title: "Sucesso!", description: "Agenda atualizada." });
      setEditDialogOpen(false);
      fetchMeetings();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!selectedMeeting) return;
    try {
      const { error } = await supabase.from("meetings").delete().eq("id", selectedMeeting.id);
      if (error) throw error;
      toast({ title: "Agenda apagada", description: "A agenda foi removida com sucesso." });
      setDeleteDialogOpen(false);
      setSelectedMeeting(null);
      fetchMeetings();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleReanalyze = async (meeting: Meeting) => {
    try {
      // Clear previous analysis data
      await Promise.all([
        supabase.from("analysis_results").delete().eq("meeting_id", meeting.id),
        supabase.from("transcriptions").delete().eq("meeting_id", meeting.id),
        supabase.from("highlights").delete().eq("meeting_id", meeting.id),
      ]);

      // Reset meeting status
      await supabase.from("meetings").update({
        status: "enviado",
        overall_score: null,
        temperature: null,
      }).eq("id", meeting.id);

      // Start new analysis
      const { error } = await supabase.functions.invoke("analyze-meeting", {
        body: { meetingId: meeting.id },
      });
      if (error) throw error;

      toast({ title: "Re-análise iniciada!", description: "O processamento pode levar alguns minutos." });
      fetchMeetings();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const filtered = meetings.filter((m) => {
    const matchesSearch =
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.lead_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.lead_company?.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === "todos" || m.meeting_type === filterType;
    const matchesSeller = filterSeller === "todos" || m.seller_id === filterSeller;
    return matchesSearch && matchesType && matchesSeller;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agendas</h1>
          <p className="text-muted-foreground">Gerencie e analise suas reuniões comerciais</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Agenda
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova Agenda</DialogTitle>
              <DialogDescription>Envie um arquivo ou cole um link para análise</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input
                  value={newMeeting.title}
                  onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
                  placeholder="Ex: Reunião Discovery - Empresa X"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={newMeeting.meeting_type}
                    onValueChange={(v) => setNewMeeting({ ...newMeeting, meeting_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="empresa">Empresa</SelectItem>
                      <SelectItem value="consultoria">Consultoria</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Executivo</Label>
                  <Select
                    value={newMeeting.seller_id}
                    onValueChange={(v) => setNewMeeting({ ...newMeeting, seller_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((p) => (
                        <SelectItem key={p.user_id} value={p.user_id}>
                          {p.full_name || p.user_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome do Lead</Label>
                  <Input
                    value={newMeeting.lead_name}
                    onChange={(e) => setNewMeeting({ ...newMeeting, lead_name: e.target.value })}
                    placeholder="Nome"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Empresa</Label>
                  <Input
                    value={newMeeting.lead_company}
                    onChange={(e) => setNewMeeting({ ...newMeeting, lead_company: e.target.value })}
                    placeholder="Empresa"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email do Lead</Label>
                  <Input
                    type="email"
                    value={newMeeting.lead_email}
                    onChange={(e) => setNewMeeting({ ...newMeeting, lead_email: e.target.value })}
                    placeholder="email@empresa.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data da Reunião</Label>
                  <Input
                    type="datetime-local"
                    value={newMeeting.meeting_date}
                    onChange={(e) => setNewMeeting({ ...newMeeting, meeting_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Fonte do Áudio/Vídeo</Label>
                <Tabs value={sourceTab} onValueChange={setSourceTab}>
                  <TabsList className="w-full">
                    <TabsTrigger value="file" className="flex-1">
                      <Upload className="h-3 w-3 mr-1" />
                      Upload
                    </TabsTrigger>
                    <TabsTrigger value="link" className="flex-1">
                      <Link className="h-3 w-3 mr-1" />
                      Link (Drive / YouTube)
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="file">
                    <div className="border-2 border-dashed rounded-lg p-6 text-center">
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <Input
                        type="file"
                        accept=".mp3,.wav,.m4a,.mp4"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="mx-auto"
                      />
                      <p className="text-xs text-muted-foreground mt-2">MP3, WAV, M4A, MP4 — máx 20MB</p>
                    </div>
                  </TabsContent>
                  <TabsContent value="link">
                    <Input
                      value={newMeeting.youtube_url}
                      onChange={(e) => setNewMeeting({ ...newMeeting, youtube_url: e.target.value })}
                      placeholder="https://drive.google.com/... ou https://youtube.com/..."
                    />
                    <p className="text-xs text-muted-foreground mt-2">Cole o link do Google Drive ou YouTube</p>
                  </TabsContent>
                </Tabs>
              </div>

              <Button type="submit" className="w-full" disabled={uploading}>
                {uploading ? "Enviando..." : "Criar Agenda"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar agendas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="empresa">Empresa</SelectItem>
            <SelectItem value="consultoria">Consultoria</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSeller} onValueChange={setFilterSeller}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Executivo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos executivos</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.user_id} value={p.user_id}>
                {p.full_name || p.user_id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Meeting list */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
            <h3 className="text-lg font-medium mb-1">Nenhuma agenda encontrada</h3>
            <p className="text-muted-foreground text-sm">
              Clique em "Nova Agenda" para enviar sua primeira reunião para análise
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 animate-stagger">
          {filtered.map((meeting) => (
            <Card
              key={meeting.id}
              className="cursor-pointer glass-card card-hover-glow transition-all"
              onClick={() => navigate(`/agendas/${meeting.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="font-semibold">{meeting.title}</h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {meeting.lead_name && <span>{meeting.lead_name}</span>}
                      {meeting.lead_company && <span>• {meeting.lead_company}</span>}
                      {meeting.meeting_date && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(meeting.meeting_date).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">
                      {meeting.meeting_type === "consultoria" ? "Consultoria" : "Empresa"}
                    </Badge>
                    {meeting.overall_score !== null && (
                      <div className="flex items-center gap-1">
                        <Target className="h-4 w-4 text-primary" />
                        <span className="font-bold text-primary">{meeting.overall_score}</span>
                      </div>
                    )}
                    {meeting.temperature && (
                      <span className="text-sm">{tempLabels[meeting.temperature]}</span>
                    )}
                    <Badge className={statusColors[meeting.status]}>
                      {statusLabels[meeting.status]}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => handleEdit(meeting)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleReanalyze(meeting)}>
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Refazer análise
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            setSelectedMeeting(meeting);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Apagar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Agenda</DialogTitle>
            <DialogDescription>Atualize os dados da agenda</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do Lead</Label>
                <Input
                  value={editForm.lead_name}
                  onChange={(e) => setEditForm({ ...editForm, lead_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Input
                  value={editForm.lead_company}
                  onChange={(e) => setEditForm({ ...editForm, lead_company: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email do Lead</Label>
                <Input
                  type="email"
                  value={editForm.lead_email}
                  onChange={(e) => setEditForm({ ...editForm, lead_email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={editForm.meeting_type}
                  onValueChange={(v) => setEditForm({ ...editForm, meeting_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="empresa">Empresa</SelectItem>
                    <SelectItem value="consultoria">Consultoria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Executivo</Label>
              <Select
                value={editForm.seller_id}
                onValueChange={(v) => setEditForm({ ...editForm, seller_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.full_name || p.user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full">Salvar</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar agenda?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. A agenda "{selectedMeeting?.title}" e todos os dados de análise serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Agendas;
