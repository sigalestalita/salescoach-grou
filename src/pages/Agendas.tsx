import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Upload,
  Calendar,
  Search,
  Thermometer,
  Clock,
  Target,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Meeting = Tables<"meetings">;

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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newMeeting, setNewMeeting] = useState({
    title: "",
    lead_name: "",
    lead_company: "",
    lead_email: "",
    meeting_date: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchMeetings();
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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMeeting.title) return;
    setUploading(true);

    try {
      let fileUrl = null;
      let fileType = null;

      if (file) {
        const filePath = `${user.id}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("meeting-files")
          .upload(filePath, file);
        if (uploadError) throw uploadError;
        fileUrl = filePath;
        fileType = file.type;
      }

      const { error } = await supabase.from("meetings").insert({
        title: newMeeting.title,
        seller_id: user.id,
        lead_name: newMeeting.lead_name || null,
        lead_company: newMeeting.lead_company || null,
        lead_email: newMeeting.lead_email || null,
        meeting_date: newMeeting.meeting_date || null,
        file_url: fileUrl,
        file_type: fileType,
      });

      if (error) throw error;
      toast({ title: "Sucesso!", description: "Agenda criada com sucesso." });
      setDialogOpen(false);
      setNewMeeting({ title: "", lead_name: "", lead_company: "", lead_email: "", meeting_date: "" });
      setFile(null);
      fetchMeetings();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const filtered = meetings.filter(
    (m) =>
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.lead_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.lead_company?.toLowerCase().includes(search.toLowerCase())
  );

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
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nova Agenda</DialogTitle>
              <DialogDescription>Envie um arquivo de áudio/vídeo para análise</DialogDescription>
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
                <Label>Arquivo de Áudio/Vídeo</Label>
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
              </div>
              <Button type="submit" className="w-full" disabled={uploading}>
                {uploading ? "Enviando..." : "Criar Agenda"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar agendas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
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
        <div className="grid gap-4">
          {filtered.map((meeting) => (
            <Card
              key={meeting.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
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
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Agendas;
